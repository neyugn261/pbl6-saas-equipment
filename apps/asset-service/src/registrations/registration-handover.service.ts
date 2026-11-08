import { randomUUID } from 'node:crypto';
import { ConflictException, Injectable } from '@nestjs/common';
import { dataScope, type Principal } from '@pbl6/auth';
import {
  enqueueEvent,
  Events,
  type ModelSetupSnapshot,
} from '@pbl6/event-contracts';
import { getCorrelationId } from '@pbl6/service-kit';
import {
  Prisma,
  type Equipment,
  type EquipmentRegistration,
  type EquipmentHandover,
} from '../generated/prisma/client.js';
import { auditContext, json } from '../history/audit';
import { inputHash } from '../model-policies/policy-hash';
import { WarrantyRepository } from '../warranties/warranty.repository';
import { dto, HandoverDetailsDto, invalidInput } from './registration.dto';

const conflict = (message: string) =>
  new ConflictException({ code: 'REGISTRATION_HANDOVER_CONFLICT', message });
type Tx = Prisma.TransactionClient;

@Injectable()
export class RegistrationHandoverService {
  constructor(private readonly warranties: WarrantyRepository) {}

  /** Called with Equipment -> Registration locks held and references validated. */
  async submit(
    tx: Tx,
    row: EquipmentRegistration,
    eq: Equipment,
    p: Principal,
    customerName: string,
  ) {
    const details = dto(HandoverDetailsDto, row.handoverDetails);
    const [clock] = await tx.$queryRaw<
      { now: Date }[]
    >`SELECT clock_timestamp() AS now`;
    const now = clock.now,
      deadline = new Date(details.expiresAt);
    if (deadline <= now || deadline.getTime() > now.getTime() + 90 * 86400000)
      invalidInput(
        'Confirmation deadline must be in the future and within 90 days',
      );
    if (eq.status === 'RETIRED' || eq.status === 'IN_SERVICE')
      throw conflict('Equipment cannot be handed over in this state');
    if (
      await tx.warranty.count({
        where: { tenantId: eq.tenantId, equipmentId: eq.id, status: 'ACTIVE' },
      })
    )
      throw conflict(
        'Manage existing warranties before submitting this registration',
      );
    const previous = eq.currentHandoverId
      ? await tx.equipmentHandover.findUnique({
          where: { id: eq.currentHandoverId },
        })
      : null;
    if (
      previous &&
      [
        'DRAFT',
        'PENDING_CUSTOMER_CONFIRMATION',
        'ACCEPTED',
        'ACTIVATED',
      ].includes(previous.status)
    )
      throw conflict('An existing handover must be resolved first');
    const model = await tx.equipmentModel.findUniqueOrThrow({
      where: { id: eq.modelId },
    });
    const policy = row.policyPreview as unknown as ModelSetupSnapshot;
    const id = randomUUID();
    const handover = await tx.equipmentHandover.create({
      data: {
        id,
        tenantId: eq.tenantId,
        equipmentId: eq.id,
        customerId: eq.customerId,
        handoverNo: `BG-${id}`,
        status: 'PENDING_CUSTOMER_CONFIRMATION',
        submittedAt: now,
        createdBy: p.userId,
        expiresAt: deadline,
        snapshot: json({
          contentVersion: 2,
          deliveryMethod: 'CUSTOMER_SITE',
          registrationId: row.id,
          policyHash: policy.hash,
          assetCode: eq.assetCode,
          name: eq.displayName ?? model.name,
          model: model.name,
          serialNumber: eq.serialNumber,
          customerId: eq.customerId,
          customerName,
          customerSiteId: eq.customerSiteId,
          locationId: eq.locationId,
          handoverDate: policy.handoverDate,
          installationDate:
            eq.installationDate?.toISOString().slice(0, 10) ?? null,
          commissionedDate:
            eq.commissionedDate?.toISOString().slice(0, 10) ?? null,
          condition: details.condition.trim(),
          notes: details.notes?.trim() ?? '',
          policies: {
            warranty: policy.warranty,
            maintenance: {
              revision: policy.maintenance.revision,
              body: policy.maintenance.body,
              firstDueDates: policy.maintenance.firstDueDates,
            },
          },
        }),
      },
    });
    if (previous) {
      await tx.equipmentHandover.update({
        where: { id: previous.id },
        data: { supersededById: id },
      });
      await this.audit(tx, previous, 'SUPERSEDED', p.userId);
    }
    await tx.equipment.update({
      where: { id: eq.id },
      data: {
        handoverRequired: true,
        currentHandoverId: id,
        status: 'OUT_OF_SERVICE',
      },
    });
    const updated = await tx.equipmentRegistration.update({
      where: { id: row.id },
      data: {
        status: 'PENDING_CUSTOMER_CONFIRMATION',
        handoverId: id,
        submittedBy: p.userId,
        submittedAt: now,
        maintenanceInputHash: policy.hash,
        updatedBy: p.userId,
        version: { increment: 1 },
        lastErrorCode: null,
      },
    });
    await this.audit(tx, handover, 'CREATED', p.userId);
    await this.audit(tx, handover, 'SUBMITTED', p.userId);
    await this.publish(tx, handover);
    return updated;
  }

  /** Acceptance applies the exact approved snapshot, never the latest Model policy. */
  async accept(
    tx: Tx,
    handover: EquipmentHandover,
    eq: Equipment,
    p: Principal,
    now: Date,
  ) {
    const row = await tx.equipmentRegistration.findFirst({
      where: {
        tenantId: eq.tenantId,
        equipmentId: eq.id,
        handoverId: handover.id,
      },
    });
    if (!row || row.deliveryMethod !== 'CUSTOMER_SITE') {
      if ((handover.snapshot as Record<string, unknown>).contentVersion === 2)
        throw conflict('The submitted registration is no longer available');
      return;
    }
    const snapshot = row.policyPreview as unknown as ModelSetupSnapshot;
    const frozen = handover.snapshot as Record<string, unknown>;
    if (
      row.status !== 'PENDING_CUSTOMER_CONFIRMATION' ||
      frozen.registrationId !== row.id ||
      frozen.policyHash !== snapshot?.hash ||
      inputHash({ equipmentId: eq.id, ...snapshot, hash: undefined }) !==
        snapshot.hash ||
      eq.handoverDate?.toISOString().slice(0, 10) !== snapshot.handoverDate ||
      (eq.installationDate?.toISOString().slice(0, 10) ?? null) !==
        frozen.installationDate ||
      (eq.commissionedDate?.toISOString().slice(0, 10) ?? null) !==
        frozen.commissionedDate
    )
      throw conflict(
        'The submitted registration changed; cancel and submit a new version',
      );
    let warrantyId: string | null = null;
    if (snapshot.warranty.body.mode === 'APPLY') {
      warrantyId = (
        await this.warranties.add(
          dataScope(p),
          eq.id,
          p.userId,
          {
            startDate: snapshot.warranty.startDate,
            endDate: snapshot.warranty.endDate,
            warrantyType: 'MODEL_POLICY',
            terms: snapshot.warranty.body.terms,
          },
          p.roles,
          tx,
          {
            versionId: snapshot.warranty.revisionId,
            snapshot: json(snapshot.warranty.body),
          },
        )
      ).id;
    } else if (
      await tx.warranty.count({
        where: { tenantId: eq.tenantId, equipmentId: eq.id, status: 'ACTIVE' },
      })
    ) {
      throw conflict(
        'An unexpected warranty was added; correct and resubmit the registration',
      );
    }
    const needsPlan = snapshot.maintenance.body.mode === 'APPLY';
    await tx.equipmentRegistration.update({
      where: { id: row.id },
      data: {
        status: 'COMPLETED',
        warrantyId,
        completedBy: p.userId,
        completedAt: now,
        updatedBy: p.userId,
        version: { increment: 1 },
        maintenanceProvisioning: needsPlan ? 'PENDING' : null,
      },
    });
    await tx.equipmentHistory.create({
      data: {
        tenantId: eq.tenantId,
        equipmentId: eq.id,
        eventType: 'REGISTRATION_CUSTOMER_CONFIRMED',
        referenceType: 'EQUIPMENT_REGISTRATION',
        referenceId: row.id,
        ...auditContext(eq, p.userId, p.roles),
        changes: { handoverId: handover.id, policyHash: snapshot.hash },
      },
    });
    if (needsPlan)
      await enqueueEvent(tx, Events.EquipmentRegistrationConfirmed, {
        tenantId: eq.tenantId,
        aggregateId: row.id,
        correlationId: getCorrelationId(),
        payload: {
          registrationId: row.id,
          equipmentId: eq.id,
          customerId: eq.customerId,
          customerSiteId: eq.customerSiteId,
          snapshotVersion: eq.snapshotVersion,
          submittedBy: row.submittedBy!,
          confirmedBy: p.userId,
          confirmedAt: now.toISOString(),
          snapshot,
        },
      });
  }

  /** No service side effects exist yet, so corrections can safely return to Draft. */
  async reopen(tx: Tx, handover: EquipmentHandover) {
    await tx.equipmentRegistration.updateMany({
      where: {
        tenantId: handover.tenantId,
        equipmentId: handover.equipmentId,
        handoverId: handover.id,
        deliveryMethod: 'CUSTOMER_SITE',
        status: 'PENDING_CUSTOMER_CONFIRMATION',
      },
      data: {
        status: 'DRAFT',
        submittedAt: null,
        submittedBy: null,
        maintenanceInputHash: null,
        policyPreview: Prisma.DbNull,
        version: { increment: 1 },
        lastErrorCode: null,
      },
    });
  }
  private audit(tx: Tx, h: EquipmentHandover, action: string, actorId: string) {
    return tx.equipmentHandoverAudit.create({
      data: {
        tenantId: h.tenantId,
        handoverId: h.id,
        action,
        actorId,
        correlationId: getCorrelationId()?.slice(0, 128),
      },
    });
  }
  private publish(tx: Tx, h: EquipmentHandover) {
    return enqueueEvent(tx, Events.EquipmentHandoverChanged, {
      tenantId: h.tenantId,
      aggregateId: h.id,
      correlationId: getCorrelationId(),
      payload: {
        handoverId: h.id,
        equipmentId: h.equipmentId,
        customerId: h.customerId,
        handoverNo: h.handoverNo,
        assetCode: String((h.snapshot as Record<string, unknown>).assetCode),
        status: 'PENDING_CUSTOMER_CONFIRMATION',
        createdBy: h.createdBy,
        version: h.version,
      },
    });
  }
}

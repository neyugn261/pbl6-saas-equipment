import { RegistrationHandoverService } from '../registrations/registration-handover.service';
import { randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, Optional } from '@nestjs/common';
import { dataScope, type Principal } from '@pbl6/auth';
import { enqueueEvent, Events } from '@pbl6/event-contracts';
import { getCorrelationId, toPage, DisplayNameLookup } from '@pbl6/service-kit';
import { ORGANIZATION_CLIENT, type OrganizationClient } from '../organization/organization-client';
import { type EquipmentHandover } from '../generated/prisma/client.js';
import { json } from '../history/audit';
import { HandoverAuthorization } from './handover-authorization';
import { HandoverRepository, handoverMissing, type HandoverTx } from './handover.repository';
import { canTransition, type HandoverAction } from './handover-state';
import { type CreateHandoverDto, type HandoverQuery } from './handover.dto';
const conflict = (message: string) => new ConflictException({ code: 'HANDOVER_CONFLICT', message });

@Injectable()
export class HandoverService {
  constructor(private readonly repo: HandoverRepository, private readonly auth: HandoverAuthorization,
    @Inject(ORGANIZATION_CLIENT) private readonly organization: OrganizationClient,
    @Optional() private readonly names?: DisplayNameLookup,
    @Optional() private readonly registrations?: RegistrationHandoverService) {}

  private view(row: EquipmentHandover, customer: boolean) {
    return { id: row.id, handoverNo: row.handoverNo, equipmentId: row.equipmentId, customerId: row.customerId,
      status: row.status, version: row.version, snapshot: row.snapshot, expiresAt: row.expiresAt,
      submittedAt: row.submittedAt, acceptedAt: row.acceptedAt, activatedAt: row.activatedAt,
      rejectedReason: row.rejectedReason, supersededById: row.supersededById, createdAt: row.createdAt,
      ...(!customer ? { createdBy: row.createdBy, acceptedBy: row.acceptedBy } : {}) };
  }
  async list(p: Principal, q: HandoverQuery) {
    await this.auth.check(p);
    const { rows, total } = await this.repo.list(p, q);
    return toPage(await this.display(p, rows), total, q);
  }
  private async display(p: Principal, rows: EquipmentHandover[]) {
    const siteId = (row: EquipmentHandover) => {
      const snapshot = row.snapshot as Record<string, unknown>;
      return typeof snapshot.customerSiteId === 'string' ? snapshot.customerSiteId : null;
    };
    const [users, sites] = await Promise.all([
      p.userType === 'TENANT_STAFF' ? this.names?.lookup('users', rows.map(row => row.createdBy), p) : undefined,
      this.names?.lookup('sites', rows.map(siteId), p),
    ]);
    return rows.map(row => ({ ...this.view(row, p.userType === 'CUSTOMER'),
      ...(p.userType === 'TENANT_STAFF' ? { createdByName: users?.get(row.createdBy.toLowerCase())?.name ?? null } : {}),
      customerSiteName: sites?.get(siteId(row)?.toLowerCase() ?? '')?.name ?? null,
      customerSiteCode: sites?.get(siteId(row)?.toLowerCase() ?? '')?.code ?? null,
    }));
  }
  async detail(p: Principal, id: string) {
    await this.auth.check(p);
    const row = await this.repo.load(p, id);
    const equipment = await this.repo.db.equipment.findFirstOrThrow({ where: { id: row.equipmentId, tenantId: row.tenantId } });
    const audit = await this.repo.db.equipmentHandoverAudit.findMany({ where: { handoverId: id, tenantId: row.tenantId }, orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }] });
    return { ...(await this.display(p, [row]))[0], equipmentStatus: equipment.status,
      isCurrent: equipment.currentHandoverId === id,
      audit: audit.map(a => ({ action: a.action, occurredAt: a.occurredAt,
        ...(p.userType === 'CUSTOMER' ? {} : { actorId: a.actorId, correlationId: a.correlationId }) })) };
  }
  async create(p: Principal, input: CreateHandoverDto) {
    if (p.userType !== 'TENANT_STAFF') throw new ForbiddenException();
    await this.auth.check(p);
    const tenantId = dataScope(p).tenantId;
    const source = await this.repo.db.equipment.findFirst({ where: { tenantId, id: input.equipmentId } });
    if (!source) throw handoverMissing();
    const customer = await this.organization.getCustomer(source.customerId, p);
    const site = await this.organization.getSite(source.customerId, source.customerSiteId, source.locationId ?? undefined, p);
    if (!customer || customer.status !== 'ACTIVE' || !site || site.siteStatus !== 'ACTIVE') throw conflict('Customer or site is inactive');
    const row = await this.repo.db.$transaction(async tx => {
      const eq = await this.repo.lockEquipment(tx, tenantId, input.equipmentId);
      if (await tx.equipmentRegistration.findFirst({ where: { tenantId, equipmentId: eq.id, deliveryMethod: { not: null } } }))
        throw conflict('Complete or correct the handover from its registration');
      const now = await this.repo.now(tx);
      const deadline = new Date(input.expiresAt);
      if (!Number.isFinite(deadline.getTime()) || deadline <= now || deadline.getTime() > now.getTime() + 90 * 86400000)
        throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'Deadline must be in the future and within 90 days' });
      if (eq.status === 'RETIRED' || eq.status === 'IN_SERVICE') throw conflict('Equipment cannot be handed over in this state');
      if (eq.customerId !== source.customerId || eq.customerSiteId !== source.customerSiteId || eq.locationId !== source.locationId) throw conflict('Equipment destination changed');
      const previous = eq.currentHandoverId ? await tx.equipmentHandover.findUnique({ where: { id: eq.currentHandoverId } }) : null;
      if (previous && ['DRAFT', 'PENDING_CUSTOMER_CONFIRMATION'].includes(previous.status)) {
        if (previous.status === 'PENDING_CUSTOMER_CONFIRMATION' && previous.expiresAt <= now) await this.expire(tx, previous);
        else throw conflict('Cancel the existing open handover before replacing it');
      }
      const id = randomUUID();
      const created = await tx.equipmentHandover.create({ data: { id, tenantId, equipmentId: eq.id,
        customerId: eq.customerId, handoverNo: `BG-${id}`, createdBy: p.userId, expiresAt: deadline,
        snapshot: json({ contentVersion: 1, assetCode: eq.assetCode, name: eq.displayName ?? eq.model.name,
          model: eq.model.name, serialNumber: eq.serialNumber, customerId: eq.customerId,
          customerName: customer.name, customerSiteId: eq.customerSiteId, locationId: eq.locationId,
          deliveryAt: input.deliveryAt, condition: input.condition.trim(), notes: input.notes?.trim() ?? '' }),
      } });
      if (previous) {
        await tx.equipmentHandover.update({ where: { id: previous.id }, data: { supersededById: id } });
        await this.audit(tx, previous, 'SUPERSEDED', p.userId);
      }
      await tx.equipment.update({ where: { id: eq.id }, data: { handoverRequired: true, currentHandoverId: id } });
      await this.audit(tx, created, 'CREATED', p.userId);
      return created;
    });
    return this.view(row, false);
  }
  async act(p: Principal, id: string, action: Exclude<HandoverAction, 'expire'>, reason?: string, expectedVersion?: number) {
    const decision = action === 'accept' || action === 'reject';
    if ((decision && p.userType !== 'CUSTOMER') || (!decision && p.userType !== 'TENANT_STAFF')) throw new ForbiddenException();
    await this.auth.check(p, decision);
    const initial = await this.repo.load(p, id);
    const outcome = await this.repo.db.$transaction(async tx => {
      const eq = await this.repo.lockEquipment(tx, initial.tenantId, initial.equipmentId);
      const row = await this.repo.load(p, id, tx);
      const now = await this.repo.now(tx);
      if (row.supersededById || eq.currentHandoverId !== id || eq.customerId !== row.customerId) throw conflict('Handover has been superseded');
      if ((action === 'accept' && row.status === 'ACTIVATED') || (action === 'reject' && row.status === 'REJECTED') ||
        (action === 'cancel' && row.status === 'CANCELLED') || (action === 'submit' && row.status === 'PENDING_CUSTOMER_CONFIRMATION')) return { row };
      if (row.status === 'PENDING_CUSTOMER_CONFIRMATION' && row.expiresAt <= now) {
        await this.expire(tx, row);
        return { expired: true };
      }
      if ((row.snapshot as Record<string, unknown>).contentVersion === 2 && decision && expectedVersion !== row.version)
        throw conflict('Reload the submitted handover before deciding on this version');
      if (!canTransition(row.status, action)) throw conflict('Invalid handover transition');
      const snapshot = row.snapshot as Record<string, unknown>;
      if (decision || action === 'submit') {
        if (eq.status === 'RETIRED' || eq.status === 'IN_SERVICE' || snapshot.customerSiteId !== eq.customerSiteId || snapshot.locationId !== eq.locationId)
          throw conflict('Equipment state or destination changed; cancel and create a new handover');
      }
      if (action === 'submit' && row.expiresAt <= now) throw conflict('Draft deadline has passed; create a new handover');
      if (action === 'reject' && !reason?.trim()) throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'A rejection reason is required' });
      if (action === 'accept') {
        if ((row.snapshot as Record<string, unknown>).contentVersion === 2 && !this.registrations) throw new Error('Registration handovers are not configured');
        await this.registrations?.accept(tx, row, eq, p, now);
        await tx.equipmentHandover.update({ where: { id }, data: { status: 'ACCEPTED', acceptedAt: now, acceptedBy: p.userId } });
        await this.audit(tx, row, 'ACCEPTED', p.userId);
        await this.audit(tx, row, 'ACTIVATION_REQUESTED', p.userId);
        await tx.equipment.update({ where: { id: eq.id }, data: { status: 'ACTIVE' } });
      }
      const status = { submit: 'PENDING_CUSTOMER_CONFIRMATION', accept: 'ACTIVATED', reject: 'REJECTED', cancel: 'CANCELLED' }[action];
      const updated = await tx.equipmentHandover.update({ where: { id }, data: { status, version: { increment: 1 },
        ...(action === 'submit' ? { submittedAt: now } : {}), ...(action === 'accept' ? { activatedAt: now } : {}),
        ...(action === 'reject' ? { rejectedReason: reason!.trim() } : {}),
      } });
      await this.audit(tx, row, { accept: 'ACTIVATED', submit: 'SUBMITTED', cancel: 'CANCELLED', reject: 'REJECTED' }[action], p.userId);
      if (action === 'reject' || action === 'cancel') await this.registrations?.reopen(tx, updated);
      await this.publish(tx, updated);
      return { row: updated };
    });
    if (outcome.expired || !outcome.row) throw conflict('Handover has expired');
    return this.detail(p, id);
  }
  async expireDue() {
    const due = await this.repo.db.equipmentHandover.findMany({ where: { status: 'PENDING_CUSTOMER_CONFIRMATION', expiresAt: { lte: new Date() } }, take: 100, orderBy: { expiresAt: 'asc' } });
    for (const candidate of due) await this.repo.db.$transaction(async tx => {
      await this.repo.lockEquipment(tx, candidate.tenantId, candidate.equipmentId);
      const row = await tx.equipmentHandover.findUniqueOrThrow({ where: { id: candidate.id } });
      if (row.status === 'PENDING_CUSTOMER_CONFIRMATION' && row.expiresAt <= await this.repo.now(tx)) await this.expire(tx, row);
    });
  }
  private async expire(tx: HandoverTx, row: EquipmentHandover) {
    const updated = await tx.equipmentHandover.update({ where: { id: row.id }, data: { status: 'EXPIRED', version: { increment: 1 } } });
    await this.registrations?.reopen(tx, updated);
    await this.audit(tx, row, 'EXPIRED', null);
    await this.publish(tx, updated);
  }
  private audit(tx: HandoverTx, row: EquipmentHandover, action: string, actorId: string | null) {
    return tx.equipmentHandoverAudit.create({ data: { tenantId: row.tenantId, handoverId: row.id, action, actorId, correlationId: getCorrelationId()?.slice(0, 128) } });
  }
  private publish(tx: HandoverTx, row: EquipmentHandover) {
    return enqueueEvent(tx, Events.EquipmentHandoverChanged, { tenantId: row.tenantId, aggregateId: row.id,
      correlationId: getCorrelationId(), payload: { handoverId: row.id, equipmentId: row.equipmentId, customerId: row.customerId,
        handoverNo: row.handoverNo, assetCode: String((row.snapshot as Record<string, unknown>).assetCode),
        status: row.status as 'PENDING_CUSTOMER_CONFIRMATION' | 'ACTIVATED' | 'REJECTED' | 'CANCELLED' | 'EXPIRED', createdBy: row.createdBy, version: row.version } });
  }
}

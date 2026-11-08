import { Injectable } from '@nestjs/common';
import {
  Events,
  isEvent,
  InvalidEventError,
  parseEnvelope,
  processOnce,
  type EventEnvelope,
  type ModelSetupSnapshot,
} from '@pbl6/event-contracts';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class RegistrationMaintenanceConsumer {
  constructor(private readonly db: PrismaService) {}
  async handle(envelope: EventEnvelope): Promise<void> {
    if (!isEvent(envelope, Events.RegistrationMaintenanceReady)) return;
    parseEnvelope(JSON.stringify(envelope));
    const p = envelope.payload;
    if (
      !envelope.tenantId ||
      envelope.producer !== 'maintenance-service' ||
      envelope.aggregateType !== 'EquipmentRegistration' ||
      envelope.aggregateId.toLowerCase() !== p.registrationId.toLowerCase()
    )
      throw new InvalidEventError(['Invalid maintenance receipt source']);
    await processOnce(
      this.db,
      {
        eventId: envelope.eventId,
        eventType: envelope.eventType,
        consumer: 'asset-service.registration-maintenance',
      },
      async (tx) => {
        const source = await tx.equipmentRegistration.findFirst({
          where: {
            id: p.registrationId,
            tenantId: envelope.tenantId!,
            equipmentId: p.equipmentId,
          },
        });
        if (!source)
          throw new InvalidEventError([
            'Registration tenant/equipment mismatch',
          ]);
        if (
          source.deliveryMethod !== 'CUSTOMER_SITE' ||
          source.status !== 'COMPLETED' ||
          source.maintenanceInputHash !== p.inputHash
        )
          throw new InvalidEventError([
            'Registration receipt does not match the confirmed setup',
          ]);
        const snapshot = source.policyPreview as unknown as ModelSetupSnapshot;
        const expected = snapshot.maintenance.body.rules
          .map((r) => r.id)
          .sort();
        if (
          JSON.stringify(expected) !==
            JSON.stringify(p.plans.map((r) => r.itemId).sort()) ||
          new Set(p.plans.map((r) => r.planId)).size !== expected.length
        )
          throw new InvalidEventError(['Invalid registration plan mapping']);
        if (
          source.maintenanceProvisioning === 'READY' &&
          JSON.stringify([...source.maintenancePlanIds].sort()) !==
            JSON.stringify(p.plans.map((r) => r.planId).sort())
        )
          throw new InvalidEventError(['Conflicting maintenance receipt']);
        await tx.equipmentRegistration.updateMany({
          where: {
            id: source.id,
            tenantId: source.tenantId,
            maintenanceProvisioning: 'PENDING',
          },
          data: {
            maintenancePlanIds: p.plans.map((r) => r.planId),
            maintenancePlanId: p.plans.length === 1 ? p.plans[0].planId : null,
            maintenanceProvisioning: 'READY',
            lastErrorCode: null,
            lastAttemptAt: new Date(),
            version: { increment: 1 },
          },
        });
      },
    );
  }
}

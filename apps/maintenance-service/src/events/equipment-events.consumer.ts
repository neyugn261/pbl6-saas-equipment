import { Injectable } from '@nestjs/common';
import {
  Events,
  InvalidEventError,
  isEvent,
  parseEnvelope,
  processOnce,
  type EventEnvelope,
} from '@pbl6/event-contracts';
import { PrismaService } from '../prisma/prisma.service';
import { lockEquipment } from '../plans/plans.repository';
import { sameId } from '../common/errors';
import { changes, recordHistory } from '../common/audit';
export const EQUIPMENT_CONSUMER = 'maintenance-service.equipment-snapshots';
@Injectable()
export class EquipmentEventsConsumer {
  constructor(private readonly db: PrismaService) {}
  async handle(envelope: EventEnvelope): Promise<void> {
    if (!isEvent(envelope, Events.EquipmentMoved)) return;
    parseEnvelope(JSON.stringify(envelope));
    const p = envelope.payload;
    if (
      !envelope.tenantId ||
      envelope.producer !== 'asset-service' ||
      envelope.aggregateType !== 'Equipment' ||
      !sameId(envelope.aggregateId, p.equipmentId)
    )
      throw new InvalidEventError(['Invalid EquipmentMoved source']);
    const tenantId = envelope.tenantId;
    await processOnce(
      this.db,
      {
        eventId: envelope.eventId,
        eventType: envelope.eventType,
        consumer: EQUIPMENT_CONSUMER,
      },
      async (tx) => {
        await lockEquipment(tx, tenantId, p.equipmentId);
        const known = await tx.equipmentSnapshot.findUnique({
          where: {
            tenantId_equipmentId: { tenantId, equipmentId: p.equipmentId },
          },
        });
        if (known && known.snapshotVersion >= p.snapshotVersion) return;
        // Equipment IDs are global. Never apply an envelope with another tenant to existing plans.
        if (
          await tx.maintenancePlan.findFirst({
            where: { equipmentId: p.equipmentId, tenantId: { not: tenantId } },
          })
        )
          throw new InvalidEventError(['Equipment tenant mismatch']);
        if (
          await tx.equipmentSnapshot.findFirst({
            where: { equipmentId: p.equipmentId, tenantId: { not: tenantId } },
          })
        )
          throw new InvalidEventError(['Equipment tenant mismatch']);
        const data = {
          tenantId,
          equipmentId: p.equipmentId,
          customerId: p.customerId,
          customerSiteId: p.customerSiteId,
          snapshotVersion: p.snapshotVersion,
          changedAt: new Date(p.changedAt),
        };
        await tx.equipmentSnapshot.upsert({
          where: {
            tenantId_equipmentId: { tenantId, equipmentId: p.equipmentId },
          },
          create: data,
          update: data,
        });
        const affected = await tx.maintenancePlan.findMany({
          where: {
            tenantId,
            equipmentId: p.equipmentId,
            snapshotVersion: { lt: p.snapshotVersion },
          },
        });
        await tx.maintenancePlan.updateMany({
          where: {
            tenantId,
            equipmentId: p.equipmentId,
            snapshotVersion: { lt: p.snapshotVersion },
          },
          data: {
            customerId: p.customerId,
            customerSiteId: p.customerSiteId,
            snapshotVersion: p.snapshotVersion,
          },
        });
        for (const before of affected)
          await recordHistory(
            tx,
            before,
            'EQUIPMENT_SNAPSHOT_UPDATED',
            changes(
              {
                customerId: before.customerId,
                customerSiteId: before.customerSiteId,
                snapshotVersion: before.snapshotVersion,
              },
              {
                customerId: p.customerId,
                customerSiteId: p.customerSiteId,
                snapshotVersion: p.snapshotVersion,
              },
            ),
            {
              sourceEventId: envelope.eventId,
              occurredAt: new Date(p.changedAt),
            },
          );
      },
    );
  }
}

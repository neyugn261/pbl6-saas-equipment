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

@Injectable()
export class SiteRoutingConsumer {
  constructor(private readonly db: PrismaService) {}
  async handle(envelope: EventEnvelope) {
    if (!isEvent(envelope, Events.CustomerSiteRoutingChanged)) return;
    parseEnvelope(JSON.stringify(envelope));
    const { payload: p, tenantId } = envelope;
    if (
      !tenantId ||
      envelope.producer !== 'organization-service' ||
      envelope.aggregateType !== 'CustomerSite' ||
      envelope.aggregateId !== p.siteId
    )
      throw new InvalidEventError(['Invalid site routing source']);
    await processOnce(
      this.db,
      {
        eventId: envelope.eventId,
        eventType: envelope.eventType,
        consumer: 'workorder-service.site-routing',
      },
      async (tx) => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${tenantId + ':site:' + p.siteId}, 0))::text`;
        const key = { tenantId_siteId: { tenantId, siteId: p.siteId } };
        const known = await tx.siteBranchSnapshot.findUnique({ where: key });
        if (known && known.revision > p.revision) return;
        if (known?.revision === p.revision) {
          if (known.branchId !== p.branchId)
            throw new InvalidEventError(['Conflicting site routing revision']);
          return;
        }
        await tx.siteBranchSnapshot.upsert({
          where: key,
          create: {
            tenantId,
            siteId: p.siteId,
            branchId: p.branchId,
            revision: p.revision,
          },
          update: { branchId: p.branchId, revision: p.revision },
        });
        // Unknown routing at task delivery is a central queue, not unrestricted access.
        // Only newly created, unassigned maintenance orders may acquire their initial route.
        if (p.branchId) {
          const orders = await tx.workOrder.findMany({
            where: {
              tenantId,
              customerSiteId: p.siteId,
              maintenanceTaskId: { not: null },
              branchId: null,
              status: 'CREATED',
              assignments: { none: {} },
            },
          });
          for (const order of orders) {
            await tx.$queryRaw`SELECT id FROM work_orders WHERE id = ${order.id}::uuid FOR UPDATE`;
            const changed = await tx.workOrder.updateMany({
              where: {
                id: order.id,
                branchId: null,
                status: 'CREATED',
                assignments: { none: {} },
              },
              data: { branchId: p.branchId },
            });
            if (changed.count)
              await tx.workOrderStatusHistory.create({
                data: {
                  tenantId,
                  workOrderId: order.id,
                  oldStatus: 'CREATED',
                  newStatus: 'CREATED',
                  reason: `Initial site routing: ${p.branchId}`,
                },
              });
          }
        }
      },
    );
  }
}

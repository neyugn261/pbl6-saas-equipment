import { Injectable } from '@nestjs/common';
import {
  enqueueEvent,
  Events,
  InvalidEventError,
  isEvent,
  parseEnvelope,
  processOnce,
  type EventEnvelope,
} from '@pbl6/event-contracts';
import { sameUuid } from '../common/uuid';
import { PrismaService } from '../prisma/prisma.service';
import { nextWorkOrderNumber } from '../work-orders/work-order-number';

export const MAINTENANCE_CONSUMER = 'workorder-service.maintenance-task-due';

@Injectable()
export class MaintenanceEventsConsumer {
  constructor(private readonly db: PrismaService) {}

  async handle(envelope: EventEnvelope) {
    if (!isEvent(envelope, Events.MaintenanceTaskDue)) return;
    // Transport validates the catalog too; keep direct handler calls equally strict.
    parseEnvelope(JSON.stringify(envelope));
    const tenantId = envelope.tenantId;
    const payload = envelope.payload;
    if (
      !tenantId ||
      envelope.producer !== Events.MaintenanceTaskDue.producer ||
      envelope.aggregateType !== Events.MaintenanceTaskDue.aggregateType ||
      !sameUuid(envelope.aggregateId, payload.maintenanceTaskId)
    )
      throw new InvalidEventError([
        'Invalid Maintenance Task source reference',
      ]);

    // A date denotes a Vietnam calendar day; it is not an appointment time.
    const utcDate = new Date(payload.scheduledDate + 'T00:00:00Z');
    if (
      !Number.isFinite(utcDate.getTime()) ||
      utcDate.toISOString().slice(0, 10) !== payload.scheduledDate ||
      utcDate.getUTCFullYear() < 1
    )
      throw new InvalidEventError([
        'scheduledDate must be a real calendar date',
      ]);
    const scheduledStart = new Date(payload.scheduledDate + 'T00:00:00+07:00');

    return processOnce(
      this.db,
      {
        eventId: envelope.eventId,
        eventType: envelope.eventType,
        consumer: MAINTENANCE_CONSUMER,
      },
      async (tx) => {
        // The task unique index is global. Lock its UUID, including across tenants.
        const key =
          'maintenance-task:' + payload.maintenanceTaskId.toLowerCase();
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text`;
        const previous = await tx.workOrder.findFirst({
          where: { maintenanceTaskId: payload.maintenanceTaskId },
        });
        if (previous) {
          if (!sameUuid(previous.tenantId, tenantId))
            throw new InvalidEventError(['Maintenance Task tenant mismatch']);
          // Includes CANCELLED: replaying a due event is not a manager's replacement request.
          // A replacement operation needs a separately reviewed contract (D04).
          return;
        }
        const order = await tx.workOrder.create({
          data: {
            tenantId,
            workOrderNo: await nextWorkOrderNumber(tx, tenantId),
            maintenanceTaskId: payload.maintenanceTaskId,
            equipmentId: payload.equipmentId,
            customerId: payload.customerId,
            customerSiteId: payload.customerSiteId,
            type: 'MAINTENANCE',
            title: payload.title,
            scheduledStart,
            createdBy: null,
          },
        });
        await tx.workOrderStatusHistory.create({
          data: {
            tenantId,
            workOrderId: order.id,
            newStatus: 'CREATED',
            changedBy: null,
          },
        });
        // There is no actor user for an event; no fabricated work_logs row (D5).
        await enqueueEvent(tx, Events.WorkOrderCreated, {
          tenantId,
          aggregateId: order.id,
          correlationId: envelope.correlationId,
          payload: {
            workOrderId: order.id,
            workOrderNo: order.workOrderNo,
            serviceRequestId: null,
            maintenanceTaskId: order.maintenanceTaskId,
            equipmentId: order.equipmentId,
            customerId: order.customerId,
            type: 'MAINTENANCE',
            priority: 'NORMAL',
          },
        });
      },
    );
  }
}

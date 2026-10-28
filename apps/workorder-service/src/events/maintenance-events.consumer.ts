import { Injectable } from '@nestjs/common';
import {
  enqueueEvent,
  Events,
  InvalidEventError,
  isEvent,
  parseEnvelope,
  processOnce,
  type EventEnvelope,
  type MaintenanceWorkOrderReplacementRequestedV1,
} from '@pbl6/event-contracts';
import type { WorkOrder } from '../generated/prisma/client.js';
import { lockMaintenanceTask } from '../common/maintenance-source';
import { sameUuid } from '../common/uuid';
import { PrismaService } from '../prisma/prisma.service';
import { nextWorkOrderNumber } from '../work-orders/work-order-number';

export const MAINTENANCE_CONSUMER = 'workorder-service.maintenance-task-due';
export const MAINTENANCE_REPLACEMENT_CONSUMER =
  'workorder-service.maintenance-work-order-replacement';

@Injectable()
export class MaintenanceEventsConsumer {
  constructor(private readonly db: PrismaService) {}

  async handle(envelope: EventEnvelope) {
    if (
      !isEvent(envelope, Events.MaintenanceTaskDue) &&
      !isEvent(envelope, Events.MaintenanceWorkOrderReplacementRequested)
    )
      return;
    // Transport validates the catalog too; keep direct handler calls equally strict.
    parseEnvelope(JSON.stringify(envelope));
    const tenantId = envelope.tenantId;
    const payload = envelope.payload;
    if (
      !tenantId ||
      envelope.producer !== 'maintenance-service' ||
      envelope.aggregateType !== 'MaintenanceTask' ||
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
        consumer: isEvent(
          envelope,
          Events.MaintenanceWorkOrderReplacementRequested,
        )
          ? MAINTENANCE_REPLACEMENT_CONSUMER
          : MAINTENANCE_CONSUMER,
      },
      async (tx) => {
        await lockMaintenanceTask(tx, payload.maintenanceTaskId);
        const replacement = isEvent(
          envelope,
          Events.MaintenanceWorkOrderReplacementRequested,
        )
          ? envelope.payload
          : null;
        if (replacement) {
          if (
            sameUuid(
              replacement.previousWorkOrderId,
              replacement.replacementWorkOrderId,
            )
          )
            throw new InvalidEventError([
              'A replacement must have a new Work Order ID',
            ]);
          const existing = await tx.workOrder.findUnique({
            where: { id: replacement.replacementWorkOrderId },
          });
          if (existing) {
            this.assertReplacement(existing, replacement, tenantId);
            // Business idempotency survives different event IDs and later cancellation/completion.
            return;
          }
          const previous = await tx.workOrder.findUnique({
            where: { id: replacement.previousWorkOrderId },
          });
          if (!previous)
            throw new Error(
              'Previous Maintenance Work Order is not available yet',
            );
          this.assertSource(previous, replacement, tenantId);
          if (previous.status !== 'CANCELLED')
            throw new Error(
              'Previous Maintenance Work Order must be CANCELLED',
            );
          const used = await tx.workOrder.findFirst({
            where: {
              OR: [
                { maintenanceReplacementRequestId: replacement.requestId },
                { replacesWorkOrderId: previous.id },
              ],
            },
          });
          if (used)
            throw new InvalidEventError([
              'Replacement request or previous Work Order already used',
            ]);
          // COMPLETED also blocks replacement, as required by ADR 0002.
          if (
            await tx.workOrder.findFirst({
              where: {
                maintenanceTaskId: payload.maintenanceTaskId,
                status: { not: 'CANCELLED' },
              },
            })
          )
            throw new Error(
              'Maintenance Task already has a non-cancelled Work Order',
            );
        } else {
          const previous = await tx.workOrder.findFirst({
            where: { maintenanceTaskId: payload.maintenanceTaskId },
          });
          if (previous) {
            if (!sameUuid(previous.tenantId, tenantId))
              throw new InvalidEventError(['Maintenance Task tenant mismatch']);
            // Replaying Due never expresses a manager's replacement intent.
            return;
          }
        }
        const order = await tx.workOrder.create({
          data: {
            ...(replacement
              ? {
                  id: replacement.replacementWorkOrderId,
                  maintenanceReplacementRequestId: replacement.requestId,
                  replacesWorkOrderId: replacement.previousWorkOrderId,
                }
              : {}),
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
            reason: replacement
              ? `Maintenance replacement request ${replacement.requestId}; requestedBy=${replacement.requestedBy}; previousWorkOrderId=${replacement.previousWorkOrderId}`
              : null,
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

  private assertSource(
    order: WorkOrder,
    payload: MaintenanceWorkOrderReplacementRequestedV1,
    tenantId: string,
  ) {
    if (
      !sameUuid(order.tenantId, tenantId) ||
      !sameUuid(order.maintenanceTaskId, payload.maintenanceTaskId) ||
      order.serviceRequestId !== null ||
      order.type !== 'MAINTENANCE' ||
      !sameUuid(order.equipmentId, payload.equipmentId) ||
      !sameUuid(order.customerId, payload.customerId) ||
      !(
        (order.customerSiteId === null && payload.customerSiteId === null) ||
        sameUuid(order.customerSiteId, payload.customerSiteId)
      )
    )
      throw new InvalidEventError(['Maintenance replacement source mismatch']);
  }

  private assertReplacement(
    order: WorkOrder,
    payload: MaintenanceWorkOrderReplacementRequestedV1,
    tenantId: string,
  ) {
    this.assertSource(order, payload, tenantId);
    if (
      !sameUuid(order.maintenanceReplacementRequestId, payload.requestId) ||
      !sameUuid(order.replacesWorkOrderId, payload.previousWorkOrderId)
    )
      throw new InvalidEventError([
        'Replacement Work Order ID already belongs to another request',
      ]);
  }
}

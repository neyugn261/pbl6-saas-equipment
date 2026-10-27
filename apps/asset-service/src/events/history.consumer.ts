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
import {
  auditContext,
  changedFields,
  equipmentSnapshot,
  json,
} from '../history/audit';
export const HISTORY_CONSUMER = 'asset-service.history';
const same = (left: string, right: string) =>
  left.toLowerCase() === right.toLowerCase();
@Injectable()
export class HistoryConsumer {
  constructor(private readonly db: PrismaService) {}
  async handle(envelope: EventEnvelope): Promise<void> {
    const sr = isEvent(envelope, Events.ServiceRequestStatusChanged)
      ? envelope.payload
      : null;
    const wo = isEvent(envelope, Events.WorkOrderCompletedV2)
      ? envelope.payload
      : null;
    if (!sr && !wo) return;
    parseEnvelope(JSON.stringify(envelope));
    const definition = sr
      ? Events.ServiceRequestStatusChanged
      : Events.WorkOrderCompletedV2;
    const referenceId = sr ? sr.serviceRequestId : wo!.workOrderId;
    if (
      !envelope.tenantId ||
      envelope.producer !== definition.producer ||
      envelope.aggregateType !== definition.aggregateType ||
      !same(envelope.aggregateId, referenceId)
    )
      throw new InvalidEventError(['Invalid Asset history source']);
    const tenantId = envelope.tenantId;
    if (wo && Boolean(wo.serviceRequestId) === Boolean(wo.maintenanceTaskId))
      throw new InvalidEventError(['Work Order must have exactly one source']);
    const payload = sr ?? wo!;
    await processOnce(
      this.db,
      {
        eventId: envelope.eventId,
        eventType: envelope.eventType,
        consumer: HISTORY_CONSUMER,
      },
      async (tx) => {
        const equipment = await tx.equipment.findUnique({
          where: { id: payload.equipmentId },
        });
        if (!equipment) throw new Error('Equipment is not available yet');
        if (
          !same(equipment.tenantId, tenantId) ||
          !same(equipment.customerId, payload.customerId)
        )
          throw new InvalidEventError([
            'Asset history tenant/customer mismatch',
          ]);
        await tx.equipmentHistory.create({
          data: {
            tenantId,
            equipmentId: equipment.id,
            eventType: sr
              ? 'SERVICE_REQUEST_STATUS_CHANGED'
              : 'WORK_ORDER_COMPLETED',
            referenceType: sr ? 'SERVICE_REQUEST' : 'WORK_ORDER',
            referenceId,
            description: sr
              ? `Service Request ${sr.requestNo}: ${sr.toStatus}`
              : `Work Order ${wo!.workOrderNo}: ${wo!.result}`,
            // Explicit allowlist. In particular SR reason and arbitrary payload data never reach CUSTOMER history.
            metadata: sr
              ? {
                  requestNo: sr.requestNo,
                  fromStatus: sr.fromStatus,
                  toStatus: sr.toStatus,
                }
              : {
                  workOrderNo: wo!.workOrderNo,
                  result: wo!.result,
                  serviceReportId: wo!.serviceReportId,
                  customerSummary: wo!.customerSummary,
                },
            sourceEventId: envelope.eventId,
            ...auditContext(equipment),
            context: json({
              ...equipmentSnapshot(equipment),
              snapshotMoment: 'AT_EVENT_PROCESSING',
              sourceEquipmentContextAvailable: false,
            }),
            changes: sr
              ? changedFields(
                  { serviceRequestStatus: sr.fromStatus },
                  { serviceRequestStatus: sr.toStatus },
                )
              : changedFields(
                  {},
                  {
                    workOrderResult: wo!.result,
                    serviceReportId: wo!.serviceReportId,
                  },
                ),
            customerNote: wo?.customerSummary ?? null,
            occurredAt: new Date(wo?.completedAt ?? envelope.occurredAt),
          },
        });
      },
    );
  }
}

import { Injectable, Logger } from '@nestjs/common';
import {
  Events,
  isEvent,
  processOnce,
  type EventEnvelope,
} from '@pbl6/event-contracts';
import { PrismaService } from '../prisma/prisma.service';
import { sameUuid } from '../common/uuid';
import { WorkOrderWorkflowRepository } from '../work-orders/workflow.repository';
import {
  lockServiceRequest,
  workOrderInclude,
} from '../work-orders/work-orders.repository';

export const REQUEST_CONSUMER =
  'workorder-service.service-request-cancellations';
@Injectable()
export class ServiceRequestEventsConsumer {
  private readonly logger = new Logger(ServiceRequestEventsConsumer.name);
  constructor(
    private readonly db: PrismaService,
    private readonly workflow: WorkOrderWorkflowRepository,
  ) {}
  async handle(envelope: EventEnvelope) {
    if (
      !isEvent(envelope, Events.ServiceRequestStatusChanged) ||
      envelope.payload.toStatus !== 'CANCELLED'
    )
      return;
    const tenantId = envelope.tenantId;
    if (
      !tenantId ||
      !sameUuid(envelope.aggregateId, envelope.payload.serviceRequestId)
    )
      throw new Error('Invalid Service Request cancellation reference');
    const payload = envelope.payload;
    await processOnce(
      this.db,
      {
        eventId: envelope.eventId,
        eventType: envelope.eventType,
        consumer: REQUEST_CONSUMER,
      },
      async (tx) => {
        await lockServiceRequest(tx, tenantId, payload.serviceRequestId);
        const candidate = await tx.workOrder.findFirst({
          where: {
            tenantId,
            serviceRequestId: payload.serviceRequestId,
            status: { notIn: ['COMPLETED', 'CANCELLED'] },
          },
        });
        if (!candidate) return;
        await tx.$queryRaw`SELECT id FROM work_orders WHERE tenant_id = ${tenantId}::uuid AND id = ${candidate.id}::uuid FOR UPDATE`;
        const order = await tx.workOrder.findUniqueOrThrow({
          where: { id: candidate.id },
          include: workOrderInclude,
        });
        if (
          !sameUuid(order.equipmentId, payload.equipmentId) ||
          !sameUuid(order.customerId, payload.customerId)
        )
          throw new Error(
            'Service Request cancellation does not match Work Order equipment/customer',
          );
        if (['CREATED', 'ASSIGNED', 'ACCEPTED'].includes(order.status)) {
          await this.workflow.cancel(
            { tx, order, now: new Date() },
            null,
            'Service request cancelled',
            true,
          );
        } else if (
          ['TRAVELLING', 'IN_PROGRESS', 'ON_HOLD'].includes(order.status)
        ) {
          this.logger.warn({
            msg: 'Service Request cancelled while Work Order is underway; Service Manager attention required',
            tenantId,
            workOrderId: order.id,
            serviceRequestId: payload.serviceRequestId,
            status: order.status,
            eventId: envelope.eventId,
          });
        }
      },
    );
  }
}

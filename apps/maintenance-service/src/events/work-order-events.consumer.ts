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
import { sameId } from '../common/errors';
import { changes, recordHistory } from '../common/audit';
export const WORK_ORDER_CONSUMER = 'maintenance-service.workorder';
@Injectable()
export class WorkOrderEventsConsumer {
  constructor(private readonly db: PrismaService) {}
  async handle(envelope: EventEnvelope): Promise<void> {
    if (
      !isEvent(envelope, Events.WorkOrderCreated) &&
      !isEvent(envelope, Events.WorkOrderCompletedV2) &&
      !isEvent(envelope, Events.WorkOrderCancelledV2)
    )
      return;
    parseEnvelope(JSON.stringify(envelope));
    const p = envelope.payload;
    if (
      !envelope.tenantId ||
      envelope.producer !== 'workorder-service' ||
      envelope.aggregateType !== 'WorkOrder' ||
      !sameId(envelope.aggregateId, p.workOrderId)
    )
      throw new InvalidEventError(['Invalid Work Order source']);
    if (!p.maintenanceTaskId) return;
    if (p.serviceRequestId)
      throw new InvalidEventError(['Work Order must have exactly one source']);
    const tenantId = envelope.tenantId;
    const taskId = p.maintenanceTaskId;
    await processOnce(
      this.db,
      {
        eventId: envelope.eventId,
        eventType: envelope.eventType,
        consumer: WORK_ORDER_CONSUMER,
      },
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM maintenance_tasks WHERE id = ${taskId}::uuid FOR UPDATE`;
        const task = await tx.maintenanceTask.findUnique({
          where: { id: taskId },
          include: { maintenancePlan: true },
        });
        if (!task) throw new Error('Maintenance Task is not available yet');
        if (
          !sameId(task.tenantId, tenantId) ||
          !sameId(task.maintenancePlan.equipmentId, p.equipmentId) ||
          ('customerId' in p && !sameId(task.customerId, p.customerId))
        )
          throw new InvalidEventError([
            'Work Order tenant/equipment/customer mismatch',
          ]);
        const link = await tx.maintenanceWorkOrderLink.findUnique({
          where: { workOrderId: p.workOrderId },
        });
        if (
          link &&
          (!sameId(link.tenantId, tenantId) || !sameId(link.taskId, taskId))
        )
          throw new InvalidEventError(['Work Order is linked to another task']);
        if (
          ['COMPLETED', 'FAILED', 'CANCELLED'].includes(task.status) ||
          link?.state === 'COMPLETED' ||
          link?.state === 'CANCELLED'
        )
          return;

        if (task.workOrderId && !sameId(task.workOrderId, p.workOrderId)) {
          const replacement = await tx.maintenanceReplacementRequest.findFirst({
            where: {
              tenantId,
              taskId,
              previousWorkOrderId: task.workOrderId,
              replacementWorkOrderId: p.workOrderId,
              status: 'PENDING',
            },
          });
          if (!replacement)
            throw new InvalidEventError(['Unrequested replacement Work Order']);
        }
        const completed = isEvent(envelope, Events.WorkOrderCompletedV2)
          ? envelope.payload
          : null;
        const cancelled = isEvent(envelope, Events.WorkOrderCancelledV2)
          ? envelope.payload
          : null;
        if (
          !completed &&
          !cancelled &&
          link?.state === 'CREATED' &&
          task.workOrderId === p.workOrderId
        )
          return;
        const state = completed
          ? 'COMPLETED'
          : cancelled
            ? 'CANCELLED'
            : 'CREATED';
        const occurredAt = new Date(
          completed?.completedAt ??
            cancelled?.cancelledAt ??
            envelope.occurredAt,
        );
        await tx.maintenanceWorkOrderLink.upsert({
          where: { workOrderId: p.workOrderId },
          create: {
            workOrderId: p.workOrderId,
            tenantId,
            taskId,
            state,
            occurredAt,
          },
          update: { state, occurredAt },
        });
        await tx.maintenanceReplacementRequest.updateMany({
          where: {
            tenantId,
            taskId,
            replacementWorkOrderId: p.workOrderId,
            status: 'PENDING',
          },
          data: { status: 'LINKED' },
        });
        const successful = completed && completed.result !== 'UNRESOLVED';
        const updated = await tx.maintenanceTask.update({
          where: { id: taskId },
          data: {
            workOrderId: p.workOrderId,
            status: completed
              ? successful
                ? 'COMPLETED'
                : 'FAILED'
              : cancelled
                ? 'PENDING'
                : 'WORK_ORDER_CREATED',
            completedAt: completed ? occurredAt : null,
            lastError: cancelled
              ? 'WORK_ORDER_CANCELLED'
              : completed && !successful
                ? 'WORK_ORDER_UNRESOLVED'
                : null,
          },
        });
        await recordHistory(
          tx,
          task.maintenancePlan,
          `WORK_ORDER_${state}`,
          changes(
            {
              status: task.status,
              workOrderId: task.workOrderId,
              completedAt: task.completedAt,
            },
            {
              status: updated.status,
              workOrderId: updated.workOrderId,
              completedAt: updated.completedAt,
              ...(completed
                ? {
                    result: completed.result,
                    serviceReportId: completed.serviceReportId,
                    customerSummary: completed.customerSummary,
                  }
                : {}),
            },
          ),
          { taskId, sourceEventId: envelope.eventId, occurredAt },
        );
        if (successful) {
          await tx.$queryRaw`SELECT id FROM maintenance_plans WHERE tenant_id = ${tenantId}::uuid AND id = ${task.maintenancePlanId}::uuid FOR UPDATE`;
          const currentPlan = await tx.maintenancePlan.findUniqueOrThrow({
            where: { id: task.maintenancePlanId },
          });
          const advanced = await tx.maintenancePlan.updateMany({
            where: {
              id: task.maintenancePlanId,
              tenantId,
              OR: [
                { lastCompletedAt: null },
                { lastCompletedAt: { lt: occurredAt } },
              ],
            },
            data: { lastCompletedAt: occurredAt },
          });
          if (advanced.count)
            await recordHistory(
              tx,
              currentPlan,
              'PLAN_COMPLETION_RECORDED',
              changes(
                { lastCompletedAt: currentPlan.lastCompletedAt },
                { lastCompletedAt: occurredAt },
              ),
              { taskId, sourceEventId: envelope.eventId, occurredAt },
            );
        }
      },
    );
  }
}

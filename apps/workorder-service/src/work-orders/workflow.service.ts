import {
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Principal } from '@pbl6/auth';
import { enqueueEvent, Events } from '@pbl6/event-contracts';
import { getCorrelationId } from '@pbl6/service-kit';
import { invalid } from '../common/errors';
import { WorkOrderWorkflowRepository } from './workflow.repository';
import {
  ACTION_STATES,
  isCurrentTechnician,
  mayAct,
  TERMINAL,
  type WorkOrderAction,
} from './work-order-policy';
import {
  AssignWorkOrderDto,
  CancelWorkOrderDto,
  ReasonDto,
  ServiceReportDto,
  WorkLogDto,
} from './workflow.dto';
import { workOrderView } from './work-orders.repository';

type ActionInput = Partial<
  AssignWorkOrderDto & CancelWorkOrderDto & ReasonDto
> & { report?: ServiceReportDto };
@Injectable()
export class WorkOrderWorkflowService {
  constructor(private readonly repo: WorkOrderWorkflowRepository) {}
  assignments(p: Principal, id: string) {
    return this.repo.assignments(p, id);
  }
  logs(p: Principal, id: string) {
    return this.repo.logs(p, id);
  }
  report(p: Principal, id: string) {
    return this.repo.report(p, id);
  }
  action(
    p: Principal,
    id: string,
    action: WorkOrderAction,
    input: ActionInput = {},
  ) {
    return this.repo.change(p, id, async (context) => {
      const { tx, order, now } = context;
      const assignment = order.assignments[0];
      if (!ACTION_STATES[action].includes(order.status))
        this.transitionError(order.status, action);
      if (!mayAct(p, action, assignment?.technician.userId))
        throw new ForbiddenException({
          code: 'NOT_ASSIGNED_TECHNICIAN',
          message:
            'This action requires the assigned technician or the applicable management permission',
        });
      if (action === 'cancel') {
        if (input.cancelServiceRequest && !order.serviceRequestId)
          throw invalid(
            'NOT_A_SERVICE_REQUEST_WORK_ORDER',
            'Only a Service Request Work Order can cancel its request',
          );
        await this.repo.cancel(
          context,
          p.userId,
          input.reason!,
          input.cancelServiceRequest ?? false,
        );
        return workOrderView(await this.repo.view(tx, id), p);
      }
      const technicianIds = [
        assignment?.technicianId,
        action === 'assign' ? input.technicianId : undefined,
      ].filter((value): value is string => !!value);
      await this.repo.lockTechnicians(tx, order.tenantId, technicianIds);
      let status: string;
      let note = input.reason ?? input.note ?? null;
      if (action === 'assign') {
        const technician = await tx.technician.findFirst({
          where: { tenantId: order.tenantId, id: input.technicianId },
        });
        if (!technician)
          throw invalid('TECHNICIAN_NOT_FOUND', 'Technician was not found');
        if (!['AVAILABLE', 'BUSY'].includes(technician.status))
          throw invalid(
            'TECHNICIAN_UNAVAILABLE',
            'Technician is OFF_DUTY or INACTIVE',
          );
        if (assignment)
          await tx.workOrderAssignment.update({
            where: { id: assignment.id },
            data: { status: 'REMOVED', unassignedAt: now },
          });
        await tx.workOrderAssignment.create({
          data: {
            tenantId: order.tenantId,
            workOrderId: id,
            technicianId: technician.id,
            assignedBy: p.userId,
            assignedAt: now,
          },
        });
        if (assignment)
          await this.repo.recomputeTechnician(
            tx,
            order.tenantId,
            assignment.technicianId,
          );
        status = 'ASSIGNED';
        await enqueueEvent(tx, Events.WorkOrderAssigned, {
          tenantId: order.tenantId,
          aggregateId: id,
          correlationId: getCorrelationId(),
          payload: {
            workOrderId: id,
            workOrderNo: order.workOrderNo,
            technicianId: technician.id,
            technicianUserId: technician.userId,
            assignedBy: p.userId,
            scheduledStart: order.scheduledStart?.toISOString() ?? null,
          },
        });
      } else if (action === 'accept') {
        if (!assignment || assignment.status !== 'ASSIGNED')
          this.transitionError(order.status, action);
        await tx.workOrderAssignment.update({
          where: { id: assignment.id },
          data: { status: 'ACCEPTED', acceptedAt: now },
        });
        await this.repo.recomputeTechnician(
          tx,
          order.tenantId,
          assignment.technicianId,
        );
        status = 'ACCEPTED';
      } else if (action === 'reject') {
        if (!assignment || assignment.status !== 'ASSIGNED')
          this.transitionError(order.status, action);
        await tx.workOrderAssignment.update({
          where: { id: assignment.id },
          data: {
            status: 'REJECTED',
            rejectionReason: input.reason,
            rejectedAt: now,
          },
        });
        status = 'CREATED';
      } else {
        if (!assignment || assignment.status !== 'ACCEPTED')
          this.transitionError(order.status, action);
        status =
          action === 'start-travel'
            ? 'TRAVELLING'
            : action === 'hold'
              ? 'ON_HOLD'
              : action === 'complete'
                ? 'COMPLETED'
                : 'IN_PROGRESS';
        if (action === 'complete') {
          const reportInput = input.report!;
          const report = await tx.serviceReport.create({
            data: {
              tenantId: order.tenantId,
              workOrderId: id,
              technicianId: assignment.technicianId,
              problemDescription: reportInput.problemDescription,
              rootCause: reportInput.rootCause ?? null,
              solution: reportInput.solution,
              result: reportInput.result,
              customerNote: reportInput.customerSummary,
              submittedAt: now,
            },
          });
          await tx.workOrderAssignment.update({
            where: { id: assignment.id },
            data: { status: 'COMPLETED' },
          });
          await this.repo.recomputeTechnician(
            tx,
            order.tenantId,
            assignment.technicianId,
          );
          await enqueueEvent(tx, Events.WorkOrderCompletedV2, {
            tenantId: order.tenantId,
            aggregateId: id,
            correlationId: getCorrelationId(),
            payload: {
              workOrderId: id,
              workOrderNo: order.workOrderNo,
              serviceRequestId: order.serviceRequestId,
              maintenanceTaskId: order.maintenanceTaskId,
              equipmentId: order.equipmentId,
              customerId: order.customerId,
              serviceReportId: report.id,
              result: reportInput.result,
              customerSummary: reportInput.customerSummary,
              completedAt: now.toISOString(),
            },
          });
          note = null; // Internal diagnosis is never copied into customer-visible event text.
        }
      }
      await tx.workOrder.update({
        where: { id },
        data: {
          status,
          ...(action === 'start' && !order.startedAt ? { startedAt: now } : {}),
          ...(action === 'complete' ? { completedAt: now } : {}),
        },
      });
      const actingTechnician =
        action !== 'assign' &&
        isCurrentTechnician(p, assignment?.technician.userId)
          ? assignment!.technicianId
          : null;
      await this.repo.audit(
        context,
        status,
        p.userId,
        action,
        note,
        actingTechnician,
      );
      return workOrderView(await this.repo.view(tx, id), p);
    });
  }
  addLog(p: Principal, id: string, input: WorkLogDto) {
    return this.repo.change(p, id, async ({ tx, order, now }) => {
      const assignment = order.assignments[0];
      const own = isCurrentTechnician(p, assignment?.technician.userId);
      if (TERMINAL.includes(order.status))
        this.transitionError(order.status, 'add-log');
      if (
        !own &&
        !p.permissions.has('work_order:assign') &&
        !p.permissions.has('work_order:manage')
      )
        throw new ForbiddenException({
          code: 'FORBIDDEN',
          message:
            'Only the assigned technician or dispatch/management may add a note',
        });
      const row = await tx.workLog.create({
        data: {
          tenantId: order.tenantId,
          workOrderId: id,
          actorUserId: p.userId,
          technicianId: own ? assignment!.technicianId : null,
          eventType: 'NOTE',
          note: input.note,
          createdAt: now,
        },
      });
      return {
        id: row.id,
        actorUserId: row.actorUserId,
        technicianId: row.technicianId,
        eventType: row.eventType,
        note: row.note,
        createdAt: row.createdAt,
      };
    });
  }
  private transitionError(from: string, action: string): never {
    throw new ConflictException({
      code: 'INVALID_STATE_TRANSITION',
      message: 'Action is not allowed in the current state',
      details: { from, action },
    });
  }
}

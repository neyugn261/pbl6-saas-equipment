import { requiredChecklist, validateResults } from './checklist';
import { Prisma } from '../generated/prisma/client.js';
import type { ChecklistResult } from '@pbl6/event-contracts';
import type { ChecklistInputDto } from './workflow.dto';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Optional,
} from '@nestjs/common';
import type { Principal } from '@pbl6/auth';
import { enqueueEvent, Events, WORK_ORDER_TYPES } from '@pbl6/event-contracts';
import { getCorrelationId, DisplayNameLookup } from '@pbl6/service-kit';
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
import { assertNoInventoryHold } from '../inventory-reservations/inventory-reservations.repository';

type ActionInput = Partial<
  AssignWorkOrderDto & CancelWorkOrderDto & ReasonDto
> & { report?: ServiceReportDto };
@Injectable()
export class WorkOrderWorkflowService {
  constructor(private readonly repo: WorkOrderWorkflowRepository, @Optional() private readonly names?: DisplayNameLookup,
  ) {}
  async assignments(p: Principal, id: string) {
    const rows = await this.repo.assignments(p, id);
    const users = await this.names?.lookup('users', rows.flatMap((row) => [row.technicianUserId, row.assignedBy]), p,
    );
    return rows.map((row) => ({ ...row, technicianName: users?.get(row.technicianUserId.toLowerCase())?.name ?? null,
      assignedByName: users?.get(row.assignedBy.toLowerCase())?.name ?? null,
    }));
  }
  async logs(p: Principal, id: string) {
    const rows = await this.repo.logs(p, id);
    const users = await this.names?.lookup('users', rows.map((row) => row.actorUserId), p,
    );
    return rows.map((row) => ({ ...row, actorName: users?.get(row.actorUserId.toLowerCase())?.name ?? null,
    }));
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
      if (action === 'complete' && order.checklist)
        validateResults(
          requiredChecklist(order.checklist),
          (order.checklistResults ?? []) as unknown as ChecklistResult[],
          true,
        );
      if (action === 'complete')
        await assertNoInventoryHold(tx, order.tenantId, id);
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
        if (technician && technician.branchId !== order.branchId)
          throw invalid(
            'TECHNICIAN_BRANCH_MISMATCH',
            'Choose a technician from the Work Order branch',
          );
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
            branchId: order.branchId,
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
          if (reportInput.result === 'UNRESOLVED') {
            const reason = reportInput.unresolvedReason?.trim();
            if (!reason) {
              throw invalid(
                'UNRESOLVED_REASON_REQUIRED',
                'An unresolved reason is required when the work order result is UNRESOLVED',
              );
            }
          }
          const report = await tx.serviceReport.create({
            data: {
              tenantId: order.tenantId,
              workOrderId: id,
              technicianId: assignment.technicianId,
              problemDescription: reportInput.problemDescription,
              rootCause: reportInput.rootCause ?? null,
              solution: reportInput.solution,
              result: reportInput.result,
              unresolvedReason:
                reportInput.result === 'UNRESOLVED'
                  ? (reportInput.unresolvedReason?.trim() ?? null)
                  : (reportInput.unresolvedReason?.trim() || null),
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
              branchId: order.branchId,
              workOrderNo: order.workOrderNo,
              serviceRequestId: order.serviceRequestId,
              maintenanceTaskId: order.maintenanceTaskId,
              equipmentId: order.equipmentId,
              customerId: order.customerId,
              type: order.type as (typeof WORK_ORDER_TYPES)[number],
              serviceReportId: report.id,
              result: reportInput.result,
              unresolvedReason:
                reportInput.result === 'UNRESOLVED'
                  ? (reportInput.unresolvedReason?.trim() ?? null)
                  : null,
              customerSummary: reportInput.customerSummary,
              ...(order.checklist
                ? {
                    customerChecklist: requiredChecklist(order.checklist).map(
                      (item) => ({
                        itemId: item.id,
                        title: item.title,
                        status:
                          (
                            (order.checklistResults ??
                              []) as unknown as ChecklistResult[]
                          ).find((r) => r.itemId === item.id)?.status ??
                          'NOT_DONE',
                      }),
                    ),
                  }
                : {}),
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
  checklist(p: Principal, id: string) {
    return this.repo.change(p, id, async ({ order }) => ({
      items: order.checklist ?? [],
      results: order.checklistResults ?? [],
      version: order.checklistVersion,
      canEdit:
        !TERMINAL.includes(order.status) &&
        isCurrentTechnician(p, order.assignments[0]?.technician.userId) &&
        order.assignments[0]?.status === 'ACCEPTED',
    }));
  }
  checklistHistory(p: Principal, id: string) {
    return this.repo.change(p, id, async ({ tx, order }) => ({
      items: await tx.workOrderChecklistHistory.findMany({
        where: { tenantId: order.tenantId, workOrderId: id },
        orderBy: { version: 'desc' },
        take: 100,
      }),
    }));
  }
  saveChecklist(p: Principal, id: string, input: ChecklistInputDto) {
    return this.repo.change(p, id, async ({ tx, order }) => {
      const assignment = order.assignments[0];
      if (
        !isCurrentTechnician(p, assignment?.technician.userId) ||
        assignment?.status !== 'ACCEPTED' ||
        TERMINAL.includes(order.status)
      )
        throw new ForbiddenException({
          code: 'NOT_ASSIGNED_TECHNICIAN',
          message:
            'Only the current assigned technician may edit this checklist',
        });
      if (order.checklistVersion !== input.expectedVersion)
        throw new ConflictException({
          code: 'CHECKLIST_VERSION_CONFLICT',
          message: 'Reload checklist before saving',
        });
      validateResults(requiredChecklist(order.checklist), input.results);
      const updated = await tx.workOrder.update({
        where: { id },
        data: {
          checklistResults: input.results as unknown as Prisma.InputJsonValue,
          checklistVersion: { increment: 1 },
        },
      });
      await tx.workOrderChecklistHistory.create({
        data: {
          tenantId: order.tenantId,
          workOrderId: id,
          actorId: p.userId,
          assignmentId: assignment.id,
          version: updated.checklistVersion,
          results: input.results as unknown as Prisma.InputJsonValue,
        },
      });
      return {
        items: updated.checklist,
        results: updated.checklistResults,
        version: updated.checklistVersion,
        canEdit: true,
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

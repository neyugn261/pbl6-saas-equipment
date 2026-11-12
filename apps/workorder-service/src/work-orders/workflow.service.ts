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
import { invalid, missing } from '../common/errors';
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
  SignOffDto,
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

          const signOffInput = reportInput.signOff;
          let signOffStatus = 'NOT_APPLICABLE';
          let signerName: string | null = null;
          let signerTitle: string | null = null;
          let signerPhone: string | null = null;
          let signedAt: Date | null = null;
          let signatureAttachmentId: string | null = null;
          let signOffNotes: string | null = null;

          if (signOffInput) {
            signOffStatus = signOffInput.status;
            if (signOffStatus === 'SIGNED') {
              const name = signOffInput.signerName?.trim();
              if (!name) {
                throw invalid(
                  'SIGNER_NAME_REQUIRED',
                  'Signer name is required when sign-off status is SIGNED',
                );
              }
              signerName = name;
              signerTitle = signOffInput.signerTitle?.trim() || null;
              signerPhone = signOffInput.signerPhone?.trim() || null;
              signedAt = now;
              signatureAttachmentId = signOffInput.signatureAttachmentId || null;
              signOffNotes = signOffInput.notes?.trim() || null;
            } else if (signOffStatus === 'CUSTOMER_REFUSED') {
              const notes = signOffInput.notes?.trim();
              if (!notes) {
                throw invalid(
                  'REFUSAL_REASON_REQUIRED',
                  'A note or reason is required when customer refuses to sign',
                );
              }
              signOffNotes = notes;
              signerName = signOffInput.signerName?.trim() || null;
              signerTitle = signOffInput.signerTitle?.trim() || null;
              signerPhone = signOffInput.signerPhone?.trim() || null;
            } else if (signOffStatus === 'CUSTOMER_ABSENT') {
              const notes = signOffInput.notes?.trim();
              if (!notes) {
                throw invalid(
                  'ABSENCE_REASON_REQUIRED',
                  'A note or reason is required when customer is absent',
                );
              }
              signOffNotes = notes;
            } else {
              signOffNotes = signOffInput.notes?.trim() || null;
            }

            if (signatureAttachmentId) {
              const att = await tx.workOrderAttachment.findFirst({
                where: {
                  tenantId: order.tenantId,
                  workOrderId: id,
                  id: signatureAttachmentId,
                  deletedAt: null,
                },
              });
              if (!att) {
                throw invalid(
                  'SIGNATURE_ATTACHMENT_NOT_FOUND',
                  'Signature attachment does not belong to this work order',
                );
              }
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
              signOffStatus,
              signerName,
              signerTitle,
              signerPhone,
              signedAt,
              signatureAttachmentId,
              signOffNotes,
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
              signOff: {
                status: signOffStatus as any,
                signerName,
                signerTitle,
                signerPhone,
                signedAt: signedAt ? signedAt.toISOString() : null,
                signatureAttachmentId,
                notes: signOffNotes,
              },
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
  async updateSignOff(p: Principal, id: string, input: SignOffDto) {
    return this.repo.change(p, id, async ({ tx, order, now }) => {
      const isManager = p.permissions.has('work_order:manage');
      let isAssignedTech = false;
      if (p.permissions.has('work_order:execute')) {
        const completedAssignment = await tx.workOrderAssignment.findFirst({
          where: {
            tenantId: order.tenantId,
            workOrderId: id,
            status: { in: ['ACCEPTED', 'COMPLETED'] },
            technician: { userId: p.userId },
          },
        });
        if (completedAssignment) isAssignedTech = true;
      }
      if (!isManager && !isAssignedTech) {
        throw new ForbiddenException({
          code: 'FORBIDDEN',
          message:
            'Only the assigned technician or service manager may update sign-off',
        });
      }

      const report = await tx.serviceReport.findFirst({
        where: { tenantId: order.tenantId, workOrderId: id },
      });
      if (!report) throw missing('SERVICE_REPORT_NOT_FOUND');

      let signerName: string | null = null;
      let signerTitle: string | null = null;
      let signerPhone: string | null = null;
      let signedAt: Date | null = null;
      let signatureAttachmentId: string | null = null;
      let signOffNotes: string | null = null;

      if (input.status === 'SIGNED') {
        const name = input.signerName?.trim();
        if (!name) {
          throw invalid(
            'SIGNER_NAME_REQUIRED',
            'Signer name is required when sign-off status is SIGNED',
          );
        }
        signerName = name;
        signerTitle = input.signerTitle?.trim() || null;
        signerPhone = input.signerPhone?.trim() || null;
        signedAt = now;
        signatureAttachmentId = input.signatureAttachmentId || null;
        signOffNotes = input.notes?.trim() || null;
      } else if (input.status === 'CUSTOMER_REFUSED') {
        const notes = input.notes?.trim();
        if (!notes) {
          throw invalid(
            'REFUSAL_REASON_REQUIRED',
            'A note or reason is required when customer refuses to sign',
          );
        }
        signOffNotes = notes;
        signerName = input.signerName?.trim() || null;
        signerTitle = input.signerTitle?.trim() || null;
        signerPhone = input.signerPhone?.trim() || null;
      } else if (input.status === 'CUSTOMER_ABSENT') {
        const notes = input.notes?.trim();
        if (!notes) {
          throw invalid(
            'ABSENCE_REASON_REQUIRED',
            'A note or reason is required when customer is absent',
          );
        }
        signOffNotes = notes;
      } else {
        signOffNotes = input.notes?.trim() || null;
      }

      if (signatureAttachmentId) {
        const woAtt = await tx.workOrderAttachment.findFirst({
          where: {
            tenantId: order.tenantId,
            workOrderId: id,
            id: signatureAttachmentId,
            deletedAt: null,
          },
        });
        const repAtt = await tx.reportAttachment.findFirst({
          where: {
            tenantId: order.tenantId,
            serviceReportId: report.id,
            id: signatureAttachmentId,
            deletedAt: null,
          },
        });
        if (!woAtt && !repAtt) {
          throw invalid(
            'SIGNATURE_ATTACHMENT_NOT_FOUND',
            'Signature attachment does not belong to this work order or service report',
          );
        }
      }

      const updated = await tx.serviceReport.update({
        where: { id: report.id },
        data: {
          signOffStatus: input.status,
          signerName,
          signerTitle,
          signerPhone,
          signedAt,
          signatureAttachmentId,
          signOffNotes,
        },
      });

      return {
        id: updated.id,
        workOrderId: updated.workOrderId,
        technicianId: updated.technicianId,
        problemDescription: updated.problemDescription,
        rootCause: updated.rootCause,
        solution: updated.solution,
        result: updated.result,
        unresolvedReason: updated.unresolvedReason,
        customerSummary: updated.customerNote,
        submittedAt: updated.submittedAt,
        signOff: {
          status: updated.signOffStatus,
          signerName: updated.signerName,
          signerTitle: updated.signerTitle,
          signerPhone: updated.signerPhone,
          signedAt: updated.signedAt,
          signatureAttachmentId: updated.signatureAttachmentId,
          notes: updated.signOffNotes,
        },
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

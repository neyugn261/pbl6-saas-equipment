import { Injectable } from '@nestjs/common';
import { requireTenantId, type Principal } from '@pbl6/auth';
import { Events, enqueueEvent } from '@pbl6/event-contracts';
import { getCorrelationId } from '@pbl6/service-kit';
import { PrismaService } from '../prisma/prisma.service';
import { missing } from '../common/errors';
import { lockMaintenanceTask } from '../common/maintenance-source';
import {
  lockServiceRequest,
  workOrderInclude,
  workOrderScope,
  type WorkOrderRow,
  type WorkOrderTx,
} from './work-orders.repository';

export interface WorkflowContext {
  tx: WorkOrderTx;
  order: WorkOrderRow;
  now: Date;
}
@Injectable()
export class WorkOrderWorkflowRepository {
  constructor(private readonly db: PrismaService) {}
  async change<T>(
    p: Principal,
    id: string,
    work: (context: WorkflowContext) => Promise<T>,
  ) {
    const tenantId = requireTenantId(p);
    return this.db.$transaction(
      async (tx) => {
        // Source references are immutable. Source lock always precedes WO and technician locks.
        const source = await tx.workOrder.findFirst({
          where: { ...workOrderScope(p), id },
        });
        if (!source) throw missing('WORK_ORDER_NOT_FOUND');
        if (source.serviceRequestId)
          await lockServiceRequest(tx, tenantId, source.serviceRequestId);
        if (source.maintenanceTaskId)
          await lockMaintenanceTask(tx, source.maintenanceTaskId);
        await tx.$queryRaw`SELECT id FROM work_orders WHERE tenant_id = ${tenantId}::uuid AND id = ${id}::uuid FOR UPDATE`;
        const order = await tx.workOrder.findFirst({
          where: { ...workOrderScope(p), id },
          include: workOrderInclude,
        });
        if (!order) throw missing('WORK_ORDER_NOT_FOUND');
        return work({ tx, order, now: new Date() });
      },
      { timeout: 20000, maxWait: 5000 },
    );
  }
  async lockTechnicians(tx: WorkOrderTx, tenantId: string, ids: string[]) {
    for (const id of [
      ...new Set(ids.map((value) => value.toLowerCase())),
    ].sort()) {
      await tx.$queryRaw`SELECT id FROM technicians WHERE tenant_id = ${tenantId}::uuid AND id = ${id}::uuid FOR UPDATE`;
    }
  }
  async recomputeTechnician(tx: WorkOrderTx, tenantId: string, id: string) {
    const technician = await tx.technician.findFirst({
      where: { tenantId, id },
    });
    if (!technician || ['OFF_DUTY', 'INACTIVE'].includes(technician.status))
      return;
    const accepted = await tx.workOrderAssignment.count({
      where: { tenantId, technicianId: id, status: 'ACCEPTED' },
    });
    await tx.technician.update({
      where: { id },
      data: { status: accepted ? 'BUSY' : 'AVAILABLE' },
    });
  }
  async audit(
    context: WorkflowContext,
    status: string,
    actor: string | null,
    action: string,
    reason: string | null,
    technicianId: string | null,
  ) {
    const { tx, order, now } = context;
    await tx.workOrderStatusHistory.create({
      data: {
        tenantId: order.tenantId,
        workOrderId: order.id,
        oldStatus: order.status,
        newStatus: status,
        changedBy: actor,
        reason,
        changedAt: now,
      },
    });
    if (actor !== null)
      await tx.workLog.create({
        data: {
          tenantId: order.tenantId,
          workOrderId: order.id,
          actorUserId: actor,
          technicianId,
          eventType: action.toUpperCase().replaceAll('-', '_'),
          note: reason,
          createdAt: now,
        },
      });
  }
  async cancel(
    context: WorkflowContext,
    actor: string | null,
    reason: string,
    cancelServiceRequest: boolean,
  ) {
    const { tx, order, now } = context;
    const assignment = order.assignments[0];
    if (assignment) {
      await this.lockTechnicians(tx, order.tenantId, [assignment.technicianId]);
      await tx.workOrderAssignment.update({
        where: { id: assignment.id },
        data: { status: 'REMOVED', unassignedAt: now },
      });
      await this.recomputeTechnician(
        tx,
        order.tenantId,
        assignment.technicianId,
      );
    }
    await tx.workOrder.update({
      where: { id: order.id },
      data: { status: 'CANCELLED', cancelledAt: now },
    });
    await this.audit(context, 'CANCELLED', actor, 'cancel', reason, null);
    await enqueueEvent(tx, Events.WorkOrderCancelledV2, {
      tenantId: order.tenantId,
      aggregateId: order.id,
      correlationId: getCorrelationId(),
      payload: {
        workOrderId: order.id,
        workOrderNo: order.workOrderNo,
        serviceRequestId: order.serviceRequestId,
        maintenanceTaskId: order.maintenanceTaskId,
        equipmentId: order.equipmentId,
        reason,
        cancelledAt: now.toISOString(),
        cancelServiceRequest,
      },
    });
  }
  async view(tx: WorkOrderTx, id: string) {
    return tx.workOrder.findUniqueOrThrow({
      where: { id },
      include: workOrderInclude,
    });
  }
  async assignments(p: Principal, id: string) {
    await this.requireReadable(p, id);
    const rows = await this.db.workOrderAssignment.findMany({
      where: { tenantId: requireTenantId(p), workOrderId: id },
      include: { technician: { select: { userId: true } } },
      orderBy: [{ assignedAt: 'desc' }, { id: 'desc' }],
    });
    return rows.map((r) => ({
      id: r.id,
      technicianId: r.technicianId,
      technicianUserId: r.technician.userId,
      assignedBy: r.assignedBy,
      status: r.status,
      assignedAt: r.assignedAt,
      acceptedAt: r.acceptedAt,
      rejectedAt: r.rejectedAt,
      unassignedAt: r.unassignedAt,
      rejectionReason: r.rejectionReason,
    }));
  }
  async logs(p: Principal, id: string) {
    await this.requireReadable(p, id);
    const rows = await this.db.workLog.findMany({
      where: { tenantId: requireTenantId(p), workOrderId: id },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return rows.map((r) => ({
      id: r.id,
      actorUserId: r.actorUserId,
      technicianId: r.technicianId,
      eventType: r.eventType,
      note: r.note,
      createdAt: r.createdAt,
    }));
  }
  async report(p: Principal, id: string) {
    await this.requireReadable(p, id);
    const row = await this.db.serviceReport.findFirst({
      where: { tenantId: requireTenantId(p), workOrderId: id },
    });
    if (!row) throw missing('SERVICE_REPORT_NOT_FOUND');
    return {
      id: row.id,
      workOrderId: row.workOrderId,
      technicianId: row.technicianId,
      problemDescription: row.problemDescription,
      rootCause: row.rootCause,
      solution: row.solution,
      result: row.result,
      customerSummary: row.customerNote,
      submittedAt: row.submittedAt,
    };
  }
  private async requireReadable(p: Principal, id: string) {
    if (
      !(await this.db.workOrder.findFirst({
        where: { ...workOrderScope(p), id },
      }))
    )
      throw missing('WORK_ORDER_NOT_FOUND');
  }
}

import { Injectable } from '@nestjs/common';
import { type Principal, requireTenantId } from '@pbl6/auth';
import {
  enqueueEvent,
  Events,
  type WorkOrderCreatedV1,
} from '@pbl6/event-contracts';
import { getCorrelationId, toPage } from '@pbl6/service-kit';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service';
import { conflict, invalid, literalSearch, missing } from '../common/errors';
import {
  CreateWorkOrderDto,
  ListWorkOrdersDto,
  PatchWorkOrderDto,
} from './dto';
import type { EquipmentRef, RequestRef } from '../references/references.client';

export type WorkOrderTx = Prisma.TransactionClient;
export const currentAssignments = { status: { in: ['ASSIGNED', 'ACCEPTED'] } };
const include = {
  assignments: { where: currentAssignments, include: { technician: true } },
  serviceReports: { select: { id: true } },
};
type WorkOrderRow = Prisma.WorkOrderGetPayload<{ include: typeof include }>;
/** A second staff role grants its own wider read scope; a technician-only account is assignment scoped. */
export const isTechnicianOnly = (p: Principal) =>
  p.roles.length > 0 && p.roles.every((r) => r === 'TECHNICIAN');
export function workOrderScope(p: Principal): Prisma.WorkOrderWhereInput {
  return {
    tenantId: requireTenantId(p),
    ...(isTechnicianOnly(p)
      ? { assignments: { some: { technician: { userId: p.userId } } } }
      : {}),
  };
}
/** Shared with the future cancellation consumer: take this before reading SR or writing its WO. */
export async function lockServiceRequest(
  tx: WorkOrderTx,
  tenantId: string,
  id: string,
) {
  // PostgreSQL returns void; cast it so Prisma can deserialize the lock result.
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${tenantId.toLowerCase() + ':' + id.toLowerCase()}, 0))::text`;
}
export function assertSchedule(start?: Date | null, end?: Date | null) {
  if (start && end && end <= start)
    throw invalid(
      'INVALID_SCHEDULE',
      'scheduledEnd must be later than scheduledStart',
    );
}
export function workOrderView(row: WorkOrderRow, p: Principal) {
  const assignment = row.assignments[0];
  const live = !['COMPLETED', 'CANCELLED'].includes(row.status);
  // Only actions currently implemented by this service are advertised.
  const allowedActions =
    live && p.permissions.has('work_order:manage') ? ['update'] : [];
  return {
    id: row.id,
    workOrderNo: row.workOrderNo,
    serviceRequestId: row.serviceRequestId,
    maintenanceTaskId: row.maintenanceTaskId,
    equipmentId: row.equipmentId,
    customerId: row.customerId,
    customerSiteId: row.customerSiteId,
    locationId: row.locationId,
    type: row.type,
    title: row.title,
    description: row.description,
    priority: row.priority,
    status: row.status,
    scheduledStart: row.scheduledStart,
    scheduledEnd: row.scheduledEnd,
    currentTechnicianId: assignment?.technicianId ?? null,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    cancelledAt: row.cancelledAt,
    currentAssignment: assignment
      ? {
          id: assignment.id,
          technicianId: assignment.technicianId,
          technicianUserId: assignment.technician.userId,
          assignedBy: assignment.assignedBy,
          status: assignment.status,
          assignedAt: assignment.assignedAt,
          acceptedAt: assignment.acceptedAt,
          rejectedAt: assignment.rejectedAt,
          unassignedAt: assignment.unassignedAt,
          rejectionReason: assignment.rejectionReason,
        }
      : null,
    serviceReportId: row.serviceReports[0]?.id ?? null,
    allowedActions,
  };
}

@Injectable()
export class WorkOrdersRepository {
  constructor(private readonly db: PrismaService) {}
  async list(p: Principal, q: ListWorkOrdersDto) {
    const tenantId = requireTenantId(p);
    if (
      q.scheduledFrom &&
      q.scheduledTo &&
      new Date(q.scheduledFrom) > new Date(q.scheduledTo)
    )
      throw invalid(
        'INVALID_SCHEDULE',
        'scheduledFrom must not follow scheduledTo',
      );
    const conditions = [Prisma.sql`w.tenant_id = ${tenantId}::uuid`];
    if (isTechnicianOnly(p))
      conditions.push(
        Prisma.sql`EXISTS (SELECT 1 FROM work_order_assignments a JOIN technicians t ON t.id = a.technician_id AND t.tenant_id = a.tenant_id WHERE a.work_order_id = w.id AND a.tenant_id = w.tenant_id AND t.user_id = ${p.userId}::uuid)`,
      );
    if (q.mine)
      conditions.push(
        Prisma.sql`EXISTS (SELECT 1 FROM work_order_assignments a JOIN technicians t ON t.id = a.technician_id AND t.tenant_id = a.tenant_id WHERE a.work_order_id = w.id AND a.tenant_id = w.tenant_id AND t.user_id = ${p.userId}::uuid AND a.status IN ('ASSIGNED', 'ACCEPTED'))`,
      );
    if (q.technicianId)
      conditions.push(
        Prisma.sql`EXISTS (SELECT 1 FROM work_order_assignments a WHERE a.work_order_id = w.id AND a.tenant_id = w.tenant_id AND a.technician_id = ${q.technicianId}::uuid AND a.status IN ('ASSIGNED', 'ACCEPTED'))`,
      );
    if (q.status)
      conditions.push(Prisma.sql`w.status IN (${Prisma.join(q.status)})`);
    if (q.type) conditions.push(Prisma.sql`w.type = ${q.type}`);
    if (q.priority) conditions.push(Prisma.sql`w.priority = ${q.priority}`);
    if (q.customerId)
      conditions.push(Prisma.sql`w.customer_id = ${q.customerId}::uuid`);
    if (q.equipmentId)
      conditions.push(Prisma.sql`w.equipment_id = ${q.equipmentId}::uuid`);
    if (q.serviceRequestId)
      conditions.push(
        Prisma.sql`w.service_request_id = ${q.serviceRequestId}::uuid`,
      );
    if (q.scheduledFrom)
      conditions.push(
        Prisma.sql`w.scheduled_start >= ${new Date(q.scheduledFrom)}`,
      );
    if (q.scheduledTo)
      conditions.push(
        Prisma.sql`w.scheduled_start <= ${new Date(q.scheduledTo)}`,
      );
    if (q.q) {
      const search = '%' + literalSearch(q.q) + '%';
      conditions.push(
        Prisma.sql`(w.work_order_no ILIKE ${search} OR w.title ILIKE ${search})`,
      );
    }
    const field = q.sort.replace(/^-/, '');
    const ordering =
      field === 'priority'
        ? Prisma.sql`CASE w.priority WHEN 'LOW' THEN 1 WHEN 'NORMAL' THEN 2 WHEN 'HIGH' THEN 3 WHEN 'URGENT' THEN 4 END`
        : field === 'scheduledStart'
          ? Prisma.sql`w.scheduled_start`
          : Prisma.sql`w.created_at`;
    const direction = q.sort.startsWith('-')
      ? Prisma.sql`DESC`
      : Prisma.sql`ASC`;
    const where = Prisma.join(conditions, ' AND ');
    return this.db.$transaction(
      async (tx) => {
        const ids = await tx.$queryRaw<{ id: string }[]>(
          Prisma.sql`SELECT w.id FROM work_orders w WHERE ${where} ORDER BY ${ordering} ${direction} NULLS LAST, w.id ASC LIMIT ${q.pageSize} OFFSET ${(q.page - 1) * q.pageSize}`,
        );
        const [count] = await tx.$queryRaw<{ total: bigint }[]>(
          Prisma.sql`SELECT count(*) AS total FROM work_orders w WHERE ${where}`,
        );
        const rows = await tx.workOrder.findMany({
          where: { tenantId, id: { in: ids.map((i) => i.id) } },
          include,
        });
        const byId = new Map(rows.map((r) => [r.id, r]));
        return toPage(
          ids.map((i) => workOrderView(byId.get(i.id)!, p)),
          Number(count.total),
          q,
        );
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
  async detail(p: Principal, id: string) {
    const row = await this.db.workOrder.findFirst({
      where: { ...workOrderScope(p), id },
      include,
    });
    if (!row) throw missing('WORK_ORDER_NOT_FOUND');
    return workOrderView(row, p);
  }
  async create(
    p: Principal,
    input: CreateWorkOrderDto,
    resolve: () => Promise<{ source: RequestRef; equipment: EquipmentRef }>,
  ) {
    const tenantId = requireTenantId(p);
    assertSchedule(
      input.scheduledStart ? new Date(input.scheduledStart) : null,
      input.scheduledEnd ? new Date(input.scheduledEnd) : null,
    );
    return this.db.$transaction(
      async (tx) => {
        await lockServiceRequest(tx, tenantId, input.serviceRequestId);
        if (
          await tx.workOrder.findFirst({
            where: {
              tenantId,
              serviceRequestId: input.serviceRequestId,
              status: { notIn: ['COMPLETED', 'CANCELLED'] },
            },
          })
        )
          throw conflict(
            'ACTIVE_WORK_ORDER_EXISTS',
            'The request already has an active Work Order',
          );
        const { source, equipment } = await resolve();
        const year = new Intl.DateTimeFormat('en', {
          year: 'numeric',
          timeZone: 'Asia/Ho_Chi_Minh',
        }).format(new Date());
        const key = 'WO-' + year;
        const [sequence] = await tx.$queryRaw<
          { last_value: bigint }[]
        >`INSERT INTO document_sequences (tenant_id, sequence_key, last_value) VALUES (${tenantId}::uuid, ${key}, 1) ON CONFLICT (tenant_id, sequence_key) DO UPDATE SET last_value = document_sequences.last_value + 1 RETURNING last_value`;
        const row = await tx.workOrder.create({
          data: {
            tenantId,
            workOrderNo:
              key + '-' + String(sequence.last_value).padStart(4, '0'),
            serviceRequestId: source.id,
            equipmentId: source.equipmentId,
            customerId: source.customerId,
            customerSiteId: equipment.customerSiteId,
            locationId: equipment.locationId,
            type: source.type,
            priority: input.priority ?? source.priority,
            title: input.title ?? source.title,
            description: input.description ?? null,
            scheduledStart: input.scheduledStart
              ? new Date(input.scheduledStart)
              : null,
            scheduledEnd: input.scheduledEnd
              ? new Date(input.scheduledEnd)
              : null,
            createdBy: p.userId,
          },
          include,
        });
        await tx.workOrderStatusHistory.create({
          data: {
            tenantId,
            workOrderId: row.id,
            oldStatus: null,
            newStatus: 'CREATED',
            changedBy: p.userId,
          },
        });
        await tx.workLog.create({
          data: {
            tenantId,
            workOrderId: row.id,
            actorUserId: p.userId,
            eventType: 'CREATE',
          },
        });
        await enqueueEvent(tx, Events.WorkOrderCreated, {
          tenantId,
          aggregateId: row.id,
          correlationId: getCorrelationId(),
          payload: {
            workOrderId: row.id,
            workOrderNo: row.workOrderNo,
            serviceRequestId: row.serviceRequestId,
            maintenanceTaskId: null,
            equipmentId: row.equipmentId,
            customerId: row.customerId,
            type: row.type as WorkOrderCreatedV1['type'],
            priority: row.priority as WorkOrderCreatedV1['priority'],
          },
        });
        return workOrderView(row, p);
      },
      { timeout: 20000, maxWait: 5000 },
    );
  }
  async patch(p: Principal, id: string, input: PatchWorkOrderDto) {
    const tenantId = requireTenantId(p);
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM work_orders WHERE tenant_id = ${tenantId}::uuid AND id = ${id}::uuid FOR UPDATE`;
      const row = await tx.workOrder.findFirst({
        where: { ...workOrderScope(p), id },
      });
      if (!row) throw missing('WORK_ORDER_NOT_FOUND');
      if (['COMPLETED', 'CANCELLED'].includes(row.status))
        throw conflict(
          'INVALID_STATE_TRANSITION',
          'Cannot update a terminal Work Order',
        );
      const start =
        input.scheduledStart === undefined
          ? row.scheduledStart
          : input.scheduledStart === null
            ? null
            : new Date(input.scheduledStart);
      const end =
        input.scheduledEnd === undefined
          ? row.scheduledEnd
          : input.scheduledEnd === null
            ? null
            : new Date(input.scheduledEnd);
      assertSchedule(start, end);
      return workOrderView(
        await tx.workOrder.update({
          where: { id },
          data: { ...input, scheduledStart: start, scheduledEnd: end },
          include,
        }),
        p,
      );
    });
  }
  async history(p: Principal, id: string) {
    await this.detail(p, id);
    const rows = await this.db.workOrderStatusHistory.findMany({
      where: { tenantId: requireTenantId(p), workOrderId: id },
      orderBy: [{ changedAt: 'asc' }, { id: 'asc' }],
    });
    return rows.map((r) => ({
      id: r.id,
      oldStatus: r.oldStatus,
      newStatus: r.newStatus,
      changedBy: r.changedBy,
      reason: r.reason,
      changedAt: r.changedAt,
    }));
  }
}

import { Injectable } from '@nestjs/common';
import { scopeWhere, type DataScope } from '@pbl6/auth';
import { randomUUID } from 'node:crypto';
import { enqueueEvent, Events } from '@pbl6/event-contracts';
import { getCorrelationId } from '@pbl6/service-kit';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service';
import type { EquipmentRef } from '../asset/asset.client';
import {
  calendarDate,
  dateText,
  occurrence,
  vietnamToday,
  type FrequencyUnit,
} from '../common/calendar';
import { conflict, missing, sameId } from '../common/errors';
import { changes, recordHistory } from '../common/audit';
import type {
  CreatePlanDto,
  ListPlansDto,
  ListTasksDto,
  PatchPlanDto,
} from './dto';

export type Tx = Prisma.TransactionClient;
export async function lockEquipment(
  tx: Tx,
  tenantId: string,
  equipmentId: string,
) {
  const key = `equipment-snapshot:${tenantId.toLowerCase()}:${equipmentId.toLowerCase()}`;
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text`;
}
export async function lockPlan(tx: Tx, tenantId: string, id: string) {
  await tx.$queryRaw`SELECT id FROM maintenance_plans WHERE tenant_id = ${tenantId}::uuid AND id = ${id}::uuid FOR UPDATE`;
}

@Injectable()
export class PlansRepository {
  constructor(private readonly db: PrismaService) {}
  async list(scope: DataScope, q: ListPlansDto) {
    const where = {
      ...scopeWhere(scope),
      ...(q.equipmentId ? { equipmentId: q.equipmentId } : {}),
      ...(q.status ? { status: q.status } : {}),
    };
    const [items, total] = await Promise.all([
      this.db.maintenancePlan.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.db.maintenancePlan.count({ where }),
    ]);
    return { items, total };
  }
  async detail(scope: DataScope, id: string) {
    const row = await this.db.maintenancePlan.findFirst({
      where: { ...scopeWhere(scope), id },
    });
    if (!row) throw missing();
    return row;
  }
  create(
    tenantId: string,
    input: CreatePlanDto,
    equipment: EquipmentRef,
    fixtureId?: string,
    actorId?: string,
    roles: readonly string[] = [],
  ) {
    return this.db.$transaction(async (tx) => {
      await lockEquipment(tx, tenantId, equipment.id);
      let snapshot = await tx.equipmentSnapshot.findUnique({
        where: {
          tenantId_equipmentId: { tenantId, equipmentId: equipment.id },
        },
      });
      if (!snapshot || snapshot.snapshotVersion < equipment.snapshotVersion) {
        const data = {
          tenantId,
          equipmentId: equipment.id,
          customerId: equipment.customerId,
          customerSiteId: equipment.customerSiteId,
          snapshotVersion: equipment.snapshotVersion,
          changedAt: new Date(),
        };
        snapshot = await tx.equipmentSnapshot.upsert({
          where: {
            tenantId_equipmentId: { tenantId, equipmentId: equipment.id },
          },
          create: data,
          update: data,
        });
        const affected = await tx.maintenancePlan.findMany({
          where: {
            tenantId,
            equipmentId: equipment.id,
            snapshotVersion: { lt: snapshot.snapshotVersion },
          },
        });
        await tx.maintenancePlan.updateMany({
          where: {
            tenantId,
            equipmentId: equipment.id,
            snapshotVersion: { lt: snapshot.snapshotVersion },
          },
          data: {
            customerId: snapshot.customerId,
            customerSiteId: snapshot.customerSiteId,
            snapshotVersion: snapshot.snapshotVersion,
          },
        });
        for (const before of affected)
          await recordHistory(
            tx,
            before,
            'EQUIPMENT_SNAPSHOT_REFRESHED',
            changes(
              {
                customerId: before.customerId,
                customerSiteId: before.customerSiteId,
                snapshotVersion: before.snapshotVersion,
              },
              {
                customerId: snapshot.customerId,
                customerSiteId: snapshot.customerSiteId,
                snapshotVersion: snapshot.snapshotVersion,
              },
            ),
            { actorId, roles },
          );
      }
      const anchorDate = calendarDate(input.nextDueDate);
      occurrence(anchorDate, input.frequencyUnit, input.frequencyValue, 1);
      const row = await tx.maintenancePlan.create({
        data: {
          ...(fixtureId ? { id: fixtureId } : {}),
          tenantId,
          equipmentId: equipment.id,
          customerId: snapshot.customerId,
          customerSiteId: snapshot.customerSiteId,
          snapshotVersion: snapshot.snapshotVersion,
          name: input.name.trim(),
          description: input.description ?? null,
          frequencyUnit: input.frequencyUnit,
          frequencyValue: input.frequencyValue,
          anchorDate,
          nextDueDate: anchorDate,
        },
      });
      await recordHistory(
        tx,
        row,
        'PLAN_CREATED',
        changes(
          {},
          {
            name: row.name,
            description: row.description,
            frequencyUnit: row.frequencyUnit,
            frequencyValue: row.frequencyValue,
            anchorDate: dateText(row.anchorDate),
            nextDueDate: dateText(row.nextDueDate),
            status: row.status,
          },
        ),
        { actorId, roles },
      );
      return row;
    });
  }
  patch(
    scope: DataScope,
    id: string,
    input: PatchPlanDto,
    actorId?: string,
    roles: readonly string[] = [],
  ) {
    return this.db.$transaction(async (tx) => {
      await lockPlan(tx, scope.tenantId, id);
      const before = await tx.maintenancePlan.findFirst({
        where: { ...scopeWhere(scope), id },
      });
      if (!before) throw missing();
      const scheduleChanged =
        (input.frequencyUnit !== undefined &&
          input.frequencyUnit !== before.frequencyUnit) ||
        (input.frequencyValue !== undefined &&
          input.frequencyValue !== before.frequencyValue) ||
        (input.nextDueDate !== undefined &&
          input.nextDueDate !== dateText(before.nextDueDate));
      const resuming = before.status === 'PAUSED' && input.status === 'ACTIVE';
      if (
        before.status === 'INACTIVE' &&
        (scheduleChanged || (input.status && input.status !== 'INACTIVE'))
      )
        throw conflict(
          'PLAN_INACTIVE',
          'Inactive plans cannot resume or change their schedule',
        );
      if (resuming && scheduleChanged)
        throw conflict(
          'RESUME_SCHEDULE_CONFLICT',
          'Resume and schedule edits must be separate requests',
        );
      const nextDueDate = resuming
        ? calendarDate(vietnamToday())
        : input.nextDueDate
          ? calendarDate(input.nextDueDate)
          : before.nextDueDate;
      const anchorDate =
        scheduleChanged || resuming ? nextDueDate : before.anchorDate;
      occurrence(
        anchorDate,
        (input.frequencyUnit ?? before.frequencyUnit) as FrequencyUnit,
        input.frequencyValue ?? before.frequencyValue,
        1,
      );
      const row = await tx.maintenancePlan.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name.trim() } : {}),
          ...(input.description !== undefined
            ? { description: input.description }
            : {}),
          ...(input.frequencyUnit !== undefined
            ? { frequencyUnit: input.frequencyUnit }
            : {}),
          ...(input.frequencyValue !== undefined
            ? { frequencyValue: input.frequencyValue }
            : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
          anchorDate,
          nextDueDate,
        },
      });
      const fields = (p: typeof row) => ({
        name: p.name,
        description: p.description,
        frequencyUnit: p.frequencyUnit,
        frequencyValue: p.frequencyValue,
        anchorDate: dateText(p.anchorDate),
        nextDueDate: dateText(p.nextDueDate),
        status: p.status,
      });
      const delta = changes(fields(before), fields(row));
      if (Object.keys(delta as object).length)
        await recordHistory(tx, before, 'PLAN_UPDATED', delta, {
          actorId,
          roles,
        });
      return row;
    });
  }
  async listTasks(scope: DataScope, q: ListTasksDto) {
    const where: Prisma.MaintenanceTaskWhereInput = {
      tenantId: scope.tenantId,
      maintenancePlan: {
        ...scopeWhere(scope),
        ...(q.equipmentId ? { equipmentId: q.equipmentId } : {}),
      },
      ...(q.planId ? { maintenancePlanId: q.planId } : {}),
      ...(q.status ? { status: q.status } : {}),
    };
    const [items, total] = await Promise.all([
      this.db.maintenanceTask.findMany({
        where,
        include: { maintenancePlan: { select: { equipmentId: true } } },
        orderBy: [{ scheduledDate: 'desc' }, { id: 'asc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.db.maintenanceTask.count({ where }),
    ]);
    return { items, total };
  }
  async task(scope: DataScope, id: string) {
    const task = await this.db.maintenanceTask.findFirst({
      where: {
        tenantId: scope.tenantId,
        id,
        maintenancePlan: { ...scopeWhere(scope) },
      },
      include: { maintenancePlan: { select: { equipmentId: true } } },
    });
    if (!task) throw missing();
    return task;
  }
  replacement(
    scope: DataScope,
    id: string,
    requestId: string,
    requestedBy: string,
    roles: readonly string[] = [],
  ) {
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM maintenance_tasks WHERE tenant_id = ${scope.tenantId}::uuid AND id = ${id}::uuid FOR UPDATE`;
      const task = await tx.maintenanceTask.findFirst({
        where: { id, tenantId: scope.tenantId },
        include: { maintenancePlan: true },
      });
      if (!task) throw missing();
      const existing = await tx.maintenanceReplacementRequest.findUnique({
        where: { requestId },
      });
      if (existing) {
        if (
          !sameId(existing.tenantId, scope.tenantId) ||
          !sameId(existing.taskId, id) ||
          !sameId(existing.requestedBy, requestedBy)
        )
          throw conflict('REQUEST_ID_REUSED', 'Request ID is already in use');
        return existing;
      }
      const link = task.workOrderId
        ? await tx.maintenanceWorkOrderLink.findUnique({
            where: { workOrderId: task.workOrderId },
          })
        : null;
      if (task.status !== 'PENDING' || !link || link.state !== 'CANCELLED')
        throw conflict(
          'REPLACEMENT_NOT_ALLOWED',
          'Task must be waiting after a cancelled Work Order',
        );
      if (
        await tx.maintenanceReplacementRequest.findFirst({
          where: { taskId: id, status: 'PENDING' },
        })
      )
        throw conflict(
          'REPLACEMENT_PENDING',
          'A replacement request is already pending',
        );
      const row = await tx.maintenanceReplacementRequest.create({
        data: {
          requestId,
          tenantId: scope.tenantId,
          taskId: id,
          previousWorkOrderId: link.workOrderId,
          replacementWorkOrderId: randomUUID(),
          requestedBy,
        },
      });
      await enqueueEvent(tx, Events.MaintenanceWorkOrderReplacementRequested, {
        tenantId: scope.tenantId,
        aggregateId: id,
        correlationId: getCorrelationId(),
        payload: {
          requestId,
          previousWorkOrderId: row.previousWorkOrderId,
          replacementWorkOrderId: row.replacementWorkOrderId,
          requestedBy,
          maintenanceTaskId: id,
          maintenancePlanId: task.maintenancePlanId,
          equipmentId: task.maintenancePlan.equipmentId,
          customerId: task.customerId,
          customerSiteId: task.customerSiteId,
          scheduledDate: dateText(task.scheduledDate),
          title: task.maintenancePlan.name,
        },
      });
      await tx.maintenanceTask.update({
        where: { id },
        data: { attemptCount: { increment: 1 }, lastError: null },
      });
      await recordHistory(
        tx,
        task.maintenancePlan,
        'REPLACEMENT_REQUESTED',
        changes(
          {},
          {
            requestId: row.requestId,
            previousWorkOrderId: row.previousWorkOrderId,
            replacementWorkOrderId: row.replacementWorkOrderId,
            status: row.status,
          },
        ),
        { taskId: id, actorId: requestedBy, roles },
      );
      return row;
    });
  }
}

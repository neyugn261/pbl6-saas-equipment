import { BadRequestException, Injectable } from '@nestjs/common';
import { dataScope, scopeWhere, type Principal } from '@pbl6/auth';
import { PaginationQueryDto, toPage } from '@pbl6/service-kit';
import {
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import type { Prisma } from '../generated/prisma/client.js';
import { missing } from '../common/errors';
import { calendarDate, dateText, vietnamToday } from '../common/calendar';
import { planResponse, taskResponse } from './plans.service';

export class JourneyQuery extends PaginationQueryDto {
  @IsOptional() @IsUUID() equipmentId?: string;
  @IsOptional() @IsUUID() planId?: string;
  @IsOptional() @IsUUID() taskId?: string;
  @IsOptional() @IsString() @MaxLength(60) eventType?: string;
  @IsOptional() @IsISO8601({ strict: true }) from?: string;
  @IsOptional() @IsISO8601({ strict: true }) to?: string;
}

@Injectable()
export class JourneyService {
  constructor(private readonly db: PrismaService) {}
  async history(
    p: Principal,
    q: JourneyQuery,
    planId?: string,
    taskId?: string,
  ) {
    const scope = dataScope(p);
    if (q.from && q.to && new Date(q.from) > new Date(q.to))
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'from must not be after to',
      });
    if (
      planId &&
      !(await this.db.maintenancePlan.findFirst({
        where: { ...scopeWhere(scope), id: planId },
      }))
    )
      throw missing();
    if (
      taskId &&
      !(await this.db.maintenanceTask.findFirst({
        where: {
          tenantId: scope.tenantId,
          id: taskId,
          maintenancePlan: scopeWhere(scope),
        },
      }))
    )
      throw missing();
    const where: Prisma.MaintenanceHistoryWhereInput = {
      tenantId: scope.tenantId,
      plan: {
        ...scopeWhere(scope),
        ...(q.equipmentId ? { equipmentId: q.equipmentId } : {}),
      },
      ...((planId ?? q.planId) ? { planId: planId ?? q.planId } : {}),
      ...((taskId ?? q.taskId) ? { taskId: taskId ?? q.taskId } : {}),
      ...(q.eventType ? { eventType: q.eventType } : {}),
      ...(q.from || q.to
        ? {
            occurredAt: {
              ...(q.from ? { gte: new Date(q.from) } : {}),
              ...(q.to ? { lte: new Date(q.to) } : {}),
            },
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.db.maintenanceHistory.findMany({
        where,
        orderBy: [{ occurredAt: 'desc' }, { id: 'asc' }],
        take: q.pageSize,
        skip: (q.page - 1) * q.pageSize,
      }),
      this.db.maintenanceHistory.count({ where }),
    ]);
    return toPage(
      rows.map((row) => ({
        id: row.id,
        planId: row.planId,
        taskId: row.taskId,
        eventType: row.eventType,
        actorType: row.actorId ? 'USER' : 'SYSTEM',
        actorId: p.userType === 'CUSTOMER' ? null : row.actorId,
        actorRoles: p.userType === 'CUSTOMER' ? [] : row.actorRoles,
        sourceEventId: p.userType === 'CUSTOMER' ? null : row.sourceEventId,
        changes: row.changes,
        context: row.context,
        occurredAt: row.occurredAt.toISOString(),
        recordedAt: row.recordedAt.toISOString(),
      })),
      total,
      q,
    );
  }
  async task(p: Principal, id: string, q: JourneyQuery) {
    const scope = dataScope(p);
    const row = await this.db.maintenanceTask.findFirst({
      where: {
        id,
        tenantId: scope.tenantId,
        maintenancePlan: scopeWhere(scope),
      },
      include: {
        maintenancePlan: true,
        workOrderLinks: {
          orderBy: [{ occurredAt: 'asc' }, { workOrderId: 'asc' }],
        },
        replacementRequests: {
          orderBy: [{ createdAt: 'asc' }, { requestId: 'asc' }],
        },
      },
    });
    if (!row) throw missing();
    const current = row.workOrderLinks.find(
      (link) => link.workOrderId === row.workOrderId,
    );
    const pending = row.replacementRequests.some(
      (request) => request.status === 'PENDING',
    );
    const waitingFor =
      row.status === 'PENDING'
        ? current?.state === 'CANCELLED'
          ? pending
            ? 'WORK_ORDER_SERVICE'
            : 'SERVICE_MANAGER'
          : 'WORK_ORDER_SERVICE'
        : row.status === 'WORK_ORDER_CREATED'
          ? 'WORK_ORDER_TEAM'
          : row.status === 'FAILED'
            ? 'SERVICE_MANAGER'
            : null;
    return {
      task: taskResponse(row),
      plan: planResponse(row.maintenancePlan),
      workOrders: row.workOrderLinks.map((link) => ({
        workOrderId: link.workOrderId,
        state: link.state,
        occurredAt: link.occurredAt.toISOString(),
      })),
      replacements: row.replacementRequests.map((request) => ({
        requestId: request.requestId,
        previousWorkOrderId: request.previousWorkOrderId,
        replacementWorkOrderId: request.replacementWorkOrderId,
        status: request.status,
        createdAt: request.createdAt.toISOString(),
      })),
      waitingFor,
      allowedActions:
        p.userType === 'TENANT_STAFF' &&
        p.permissions.has('maintenance:manage') &&
        row.status === 'PENDING' &&
        current?.state === 'CANCELLED' &&
        !pending
          ? ['request-replacement']
          : [],
      history: await this.history(p, q, undefined, id),
      legacyHistoryMayBeIncomplete: true,
    };
  }
  async summary(p: Principal, equipmentId?: string) {
    const scope = dataScope(p);
    const where: Prisma.MaintenancePlanWhereInput = {
      ...scopeWhere(scope),
      ...(equipmentId ? { equipmentId } : {}),
    };
    const tasks: Prisma.MaintenanceTaskWhereInput = {
      tenantId: scope.tenantId,
      maintenancePlan: where,
    };
    const today = calendarDate(vietnamToday());
    const [plans, next, groups, overdueTasks, attention, overduePlans] =
      await Promise.all([
        this.db.maintenancePlan.groupBy({
          by: ['status'],
          where,
          _count: true,
        }),
        this.db.maintenancePlan.findFirst({
          where: { ...where, status: 'ACTIVE' },
          orderBy: [{ nextDueDate: 'asc' }, { id: 'asc' }],
        }),
        this.db.maintenanceTask.groupBy({
          by: ['status'],
          where: tasks,
          _count: true,
        }),
        this.db.maintenanceTask.count({
          where: {
            ...tasks,
            status: { in: ['PENDING', 'WORK_ORDER_CREATED'] },
            scheduledDate: { lt: today },
          },
        }),
        this.db.maintenanceTask.findMany({
          where: { ...tasks, status: { in: ['PENDING', 'FAILED'] } },
          include: { maintenancePlan: { select: { equipmentId: true } } },
          orderBy: [{ scheduledDate: 'asc' }, { id: 'asc' }],
          take: 5,
        }),
        this.db.maintenancePlan.count({
          where: { ...where, status: 'ACTIVE', nextDueDate: { lte: today } },
        }),
      ]);
    return {
      asOf: new Date().toISOString(),
      equipmentId: equipmentId ?? null,
      planCounts: Object.fromEntries(plans.map((g) => [g.status, g._count])),
      taskCounts: Object.fromEntries(groups.map((g) => [g.status, g._count])),
      nextDue: next
        ? { planId: next.id, date: dateText(next.nextDueDate), name: next.name }
        : null,
      duePlansAwaitingScheduler: overduePlans,
      overdueOpenTaskCount: overdueTasks,
      attentionPreview: attention.map(taskResponse),
      attentionPreviewLimit: 5,
      attentionTotal: groups
        .filter((g) => ['PENDING', 'FAILED'].includes(g.status))
        .reduce((sum, g) => sum + g._count, 0),
      scheduleMeaning: 'PLAN_DUE_DATE_NOT_CONFIRMED_APPOINTMENT',
    };
  }
}

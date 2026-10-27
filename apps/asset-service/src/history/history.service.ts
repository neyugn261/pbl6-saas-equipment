import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { dataScope, scopeWhere, type Principal } from '@pbl6/auth';
import { PaginationQueryDto, toPage } from '@pbl6/service-kit';
import {
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { Prisma, type EquipmentHistory } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service';

export class HistoryFeedQuery extends PaginationQueryDto {
  @IsOptional() @IsUUID() equipmentId?: string;
  @IsOptional() @IsUUID() customerId?: string;
  @IsOptional() @IsUUID() siteId?: string;
  @IsOptional() @IsUUID() actorId?: string;
  @IsOptional() @IsString() @MaxLength(50) eventType?: string;
  @IsOptional() @IsString() @MaxLength(50) referenceType?: string;
  @IsOptional() @IsUUID() referenceId?: string;
  @IsOptional() @IsISO8601({ strict: true }) from?: string;
  @IsOptional() @IsISO8601({ strict: true }) to?: string;
  @IsOptional() @IsIn(['occurredAt', '-occurredAt']) sort: string =
    '-occurredAt';
}

export function historyResponse(row: EquipmentHistory, customer = false) {
  const metadata =
    row.metadata &&
    typeof row.metadata === 'object' &&
    !Array.isArray(row.metadata)
      ? row.metadata
      : {};
  const safeKeys = [
    'requestNo',
    'fromStatus',
    'toStatus',
    'workOrderNo',
    'result',
    'serviceReportId',
    'customerSummary',
    'fromSiteId',
    'toSiteId',
    'fromLocationId',
    'toLocationId',
    'from',
    'to',
    'installationDate',
    'handoverDate',
  ];
  return {
    id: row.id,
    equipmentId: row.equipmentId,
    eventType: row.eventType,
    referenceType: row.referenceType,
    referenceId: row.referenceId,
    description: customer ? null : row.description,
    metadata: customer
      ? Object.fromEntries(
          Object.entries(metadata).filter(([key]) => safeKeys.includes(key)),
        )
      : row.metadata,
    createdBy: customer ? null : row.createdBy,
    actorType: row.actorType,
    actorRoles: customer ? [] : row.actorRoles,
    changes: row.changes,
    context: row.context,
    reasonInternal: customer ? null : row.reasonInternal,
    customerNote: row.customerNote,
    sourceEventId: customer ? null : row.sourceEventId,
    occurredAt: row.occurredAt.toISOString(),
    recordedAt: row.createdAt.toISOString(),
    completeness: row.context ? 'CAPTURED' : 'LEGACY_SUMMARY',
  };
}

@Injectable()
export class HistoryService {
  constructor(private readonly db: PrismaService) {}
  async latestCompletion(principal: Principal, equipmentId: string) {
    const scope = dataScope(principal);
    const row = await this.db.equipmentHistory.findFirst({
      where: {
        tenantId: scope.tenantId,
        equipmentId,
        eventType: 'WORK_ORDER_COMPLETED',
        equipment: scopeWhere(scope),
      },
      orderBy: [{ occurredAt: 'desc' }, { id: 'asc' }],
    });
    return row ? historyResponse(row, principal.userType === 'CUSTOMER') : null;
  }

  async list(
    principal: Principal,
    query: HistoryFeedQuery,
    equipmentId?: string,
  ) {
    const scope = dataScope(principal);
    if (query.from && query.to && new Date(query.from) > new Date(query.to))
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'from must not be after to',
      });
    if (
      equipmentId &&
      !(await this.db.equipment.findFirst({
        where: { ...scopeWhere(scope), id: equipmentId },
      }))
    )
      throw new NotFoundException({
        code: 'EQUIPMENT_NOT_FOUND',
        message: 'Equipment not found',
      });
    // Customer/site filters describe current ownership; the entry context preserves the historical site.
    const where: Prisma.EquipmentHistoryWhereInput = {
      tenantId: scope.tenantId,
      equipment: {
        ...scopeWhere(scope),
        ...(scope.customerId === null && query.customerId
          ? { customerId: query.customerId }
          : {}),
        ...(query.siteId ? { customerSiteId: query.siteId } : {}),
      },
      ...(equipmentId || query.equipmentId
        ? { equipmentId: equipmentId ?? query.equipmentId }
        : {}),
      ...(query.actorId ? { createdBy: query.actorId } : {}),
      ...(query.eventType ? { eventType: query.eventType } : {}),
      ...(query.referenceType ? { referenceType: query.referenceType } : {}),
      ...(query.referenceId ? { referenceId: query.referenceId } : {}),
      ...(query.from || query.to
        ? {
            occurredAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.db.equipmentHistory.findMany({
        where,
        orderBy: [
          { occurredAt: query.sort === 'occurredAt' ? 'asc' : 'desc' },
          { id: 'asc' },
        ],
        take: query.pageSize,
        skip: (query.page - 1) * query.pageSize,
      }),
      this.db.equipmentHistory.count({ where }),
    ]);
    return toPage(
      rows.map((row) =>
        historyResponse(row, principal.userType === 'CUSTOMER'),
      ),
      total,
      query,
    );
  }

  async detail(principal: Principal, id: string) {
    const scope = dataScope(principal);
    const row = await this.db.equipmentHistory.findFirst({
      where: { id, tenantId: scope.tenantId, equipment: scopeWhere(scope) },
    });
    if (!row)
      throw new NotFoundException({
        code: 'HISTORY_NOT_FOUND',
        message: 'History not found',
      });
    return historyResponse(row, principal.userType === 'CUSTOMER');
  }

  async warranty(principal: Principal, id: string, query: HistoryFeedQuery) {
    const scope = dataScope(principal);
    const row = await this.db.warranty.findFirst({
      where: { id, tenantId: scope.tenantId, equipment: scopeWhere(scope) },
    });
    if (!row)
      throw new NotFoundException({
        code: 'WARRANTY_NOT_FOUND',
        message: 'Warranty not found',
      });
    return {
      warranty: {
        id: row.id,
        equipmentId: row.equipmentId,
        startDate: row.startDate.toISOString().slice(0, 10),
        endDate: row.endDate.toISOString().slice(0, 10),
        warrantyType: row.warrantyType,
        terms: row.terms,
        status: row.status,
      },
      history: await this.list(
        principal,
        { ...query, referenceType: 'WARRANTY', referenceId: id },
        row.equipmentId,
      ),
    };
  }

  async model(principal: Principal, id: string, query: PaginationQueryDto) {
    const { tenantId } = dataScope(principal);
    const model = await this.db.equipmentModel.findFirst({
      where: { tenantId, id },
    });
    if (!model)
      throw new NotFoundException({
        code: 'MODEL_NOT_FOUND',
        message: 'Model not found',
      });
    const where = { tenantId, modelId: id };
    const [rows, total] = await Promise.all([
      this.db.equipmentModelHistory.findMany({
        where,
        orderBy: [{ occurredAt: 'desc' }, { id: 'asc' }],
        take: query.pageSize,
        skip: (query.page - 1) * query.pageSize,
      }),
      this.db.equipmentModelHistory.count({ where }),
    ]);
    return {
      model: { ...model, tenantId: undefined },
      history: toPage(
        rows.map(({ tenantId: _tenant, ...row }) => row),
        total,
        query,
      ),
      legacyHistoryMayBeIncomplete: true,
    };
  }
}

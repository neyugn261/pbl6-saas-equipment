import { calendarDate, dateText, occurrence } from '../common/calendar';
import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { requireTenantId, type Principal } from '@pbl6/auth';
import {
  validMaintenanceProfile,
  maintenanceEndDate,
  type MaintenanceProfileBody,
} from '@pbl6/event-contracts';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../generated/prisma/client.js';
import { ConfigService } from '@nestjs/config';
import { ServiceHttpClient } from '@pbl6/service-kit';

@Injectable()
export class ModelPoliciesService {
  private readonly http: ServiceHttpClient;
  constructor(
    private readonly db: PrismaService,
    config: ConfigService,
  ) {
    this.http = new ServiceHttpClient({
      name: 'asset-service',
      baseUrl: config.getOrThrow<string>('ASSET_SERVICE_URL'),
    });
  }
  async model(p: Principal, modelId: string) {
    const model = await this.http.get<{ id: string; status: string }>(
      `/equipment-models/${modelId}`,
      { accessToken: p.accessToken },
    );
    if (model.id.toLowerCase() !== modelId.toLowerCase())
      throw new NotFoundException();
    return model;
  }
  async list(p: Principal, modelId: string) {
    await this.model(p, modelId);
    return {
      items: await this.db.modelMaintenanceRevision.findMany({
        where: { tenantId: requireTenantId(p), modelId },
        orderBy: { revision: 'desc' },
        take: 100,
      }),
    };
  }
  async current(p: Principal, modelId: string) {
    await this.model(p, modelId);
    const row = await this.db.modelMaintenanceRevision.findFirst({
      where: {
        tenantId: requireTenantId(p),
        modelId,
        isDefault: true,
        status: 'PUBLISHED',
      },
    });
    if (!row)
      throw new NotFoundException({
        code: 'POLICY_NOT_CONFIGURED',
        message: 'No published default policy',
      });
    return row;
  }
  async get(p: Principal, modelId: string, id: string) {
    await this.model(p, modelId);
    const row = await this.db.modelMaintenanceRevision.findFirst({
      where: { id, tenantId: requireTenantId(p), modelId },
    });
    if (!row)
      throw new NotFoundException({
        code: 'POLICY_NOT_FOUND',
        message: 'Policy revision not found',
      });
    return row;
  }
  async preview(
    p: Principal,
    modelId: string,
    id: string,
    day: string,
    overrides: {
      itemId: string;
      frequencyValue: number;
      firstOccurrence: number;
    }[] = [],
    warrantyEndDate?: string,
  ) {
    const row = await this.get(p, modelId, id);
    if (!validMaintenanceProfile(row.body))
      throw new BadRequestException({
        code: 'INVALID_POLICY',
        message: 'Invalid profile',
      });
    const source = row.body as unknown as MaintenanceProfileBody;
    if (
      new Set(overrides.map((o) => o.itemId)).size !== overrides.length ||
      overrides.some((o) => !source.rules.some((r) => r.id === o.itemId))
    )
      throw new BadRequestException({
        code: 'INVALID_OVERRIDE',
        message: 'Unknown or duplicate schedule rule',
      });
    const body = {
      ...source,
      rules: source.rules.map((r) => {
        const o = overrides.find((o) => o.itemId === r.id);
        return o
          ? {
              ...r,
              frequencyValue: o.frequencyValue,
              firstOccurrence: o.firstOccurrence,
            }
          : r;
      }),
    };
    if (!validMaintenanceProfile(body))
      throw new BadRequestException({
        code: 'INVALID_OVERRIDE',
        message: 'Invalid schedule override',
      });
    try {
      return {
        body,
        dates: body.rules.map((rule) => {
          const endDate = maintenanceEndDate(day, rule.term, warrantyEndDate);
          const date = dateText(
            occurrence(
              calendarDate(day),
              rule.frequencyUnit,
              rule.frequencyValue,
              rule.firstOccurrence,
            ),
          );
          if (endDate && date > endDate)
            throw new BadRequestException({
              code: 'MAINTENANCE_FIRST_DUE_AFTER_END',
              message: `Kỳ đầu của lịch "${rule.name}" (${date}) nằm sau ngày kết thúc bảo trì (${endDate}). Hãy điều chỉnh chu kỳ hoặc thời hạn trên Model.`,
            });
          return { itemId: rule.id, date, ...(rule.term ? { endDate } : {}) };
        }),
      };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException({
        code: 'INVALID_SCHEDULE',
        message:
          error instanceof Error && error.message.includes('applied warranty')
            ? 'Lịch bảo trì chọn hết cùng bảo hành cần có chính sách bảo hành áp dụng cho thiết bị.'
            : 'Ngày hoặc thời hạn bảo trì không hợp lệ.',
      });
    }
  }
  async write(
    p: Principal,
    modelId: string,
    action: 'CREATE' | 'UPDATE' | 'PUBLISH' | 'RETIRE',
    id?: string,
    version?: number,
    raw?: unknown,
  ) {
    const model = await this.model(p, modelId);
    if (model.status !== 'ACTIVE')
      throw new ConflictException({
        code: 'MODEL_INACTIVE',
        message: 'Model is inactive',
      });
    if (['CREATE', 'UPDATE'].includes(action) && !validMaintenanceProfile(raw))
      throw new BadRequestException({
        code: 'INVALID_POLICY',
        message: 'Invalid policy fields or limits',
      });
    const tenantId = requireTenantId(p);
    return this.db.$transaction(async (tx) => {
      const key = `policy:${tenantId.toLowerCase()}:${modelId.toLowerCase()}`;
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key},0))::text`;
      let row;
      if (action === 'CREATE') {
        const last = await tx.modelMaintenanceRevision.findFirst({
          where: { tenantId, modelId },
          orderBy: { revision: 'desc' },
        });
        row = await tx.modelMaintenanceRevision.create({
          data: {
            tenantId,
            modelId,
            revision: (last?.revision ?? 0) + 1,
            body: raw as Prisma.InputJsonValue,
            createdBy: p.userId,
          },
        });
      } else {
        const before = await tx.modelMaintenanceRevision.findFirst({
          where: { id, tenantId, modelId },
        });
        if (!before)
          throw new NotFoundException({
            code: 'POLICY_NOT_FOUND',
            message: 'Policy revision not found',
          });
        if (
          before.version !== version ||
          (action === 'UPDATE' || action === 'PUBLISH'
            ? before.status !== 'DRAFT'
            : before.status !== 'PUBLISHED')
        )
          throw new ConflictException({
            code: 'POLICY_VERSION_CONFLICT',
            message: 'Reload the policy; published content is immutable',
          });
        if (action === 'PUBLISH')
          await tx.modelMaintenanceRevision.updateMany({
            where: { tenantId, modelId, isDefault: true },
            data: { isDefault: false },
          });
        row = await tx.modelMaintenanceRevision.update({
          where: { id: before.id },
          data: {
            version: { increment: 1 },
            ...(action === 'UPDATE'
              ? { body: raw as Prisma.InputJsonValue }
              : action === 'PUBLISH'
                ? { status: 'PUBLISHED', isDefault: true }
                : { status: 'RETIRED', isDefault: false }),
          },
        });
      }
      await tx.modelPolicyAudit.create({
        data: {
          tenantId,
          modelId,
          revisionId: row.id,
          actorId: p.userId,
          action,
          payload: {
            revision: row.revision,
            status: row.status,
            body: row.body,
          },
        },
      });
      return row;
    });
  }
}

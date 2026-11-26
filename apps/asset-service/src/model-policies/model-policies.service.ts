import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { requireTenantId, type Principal } from '@pbl6/auth';
import { validWarrantyPolicy } from '@pbl6/event-contracts';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../generated/prisma/client.js';

@Injectable()
export class ModelPoliciesService {
  constructor(private readonly db: PrismaService) {}
  async model(p: Principal, modelId: string) {
    const model = await this.db.equipmentModel.findFirst({
      where: { id: modelId, tenantId: requireTenantId(p) },
    });
    if (!model)
      throw new NotFoundException({
        code: 'MODEL_NOT_FOUND',
        message: 'Model not found',
      });
    return model;
  }
  async list(p: Principal, modelId: string) {
    await this.model(p, modelId);
    return {
      items: await this.db.modelWarrantyRevision.findMany({
        where: { tenantId: requireTenantId(p), modelId },
        orderBy: { revision: 'desc' },
        take: 100,
      }),
    };
  }
  async current(p: Principal, modelId: string) {
    await this.model(p, modelId);
    const row = await this.db.modelWarrantyRevision.findFirst({
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
    const row = await this.db.modelWarrantyRevision.findFirst({
      where: { id, tenantId: requireTenantId(p), modelId },
    });
    if (!row)
      throw new NotFoundException({
        code: 'POLICY_NOT_FOUND',
        message: 'Policy revision not found',
      });
    return row;
  }
  async write(
    p: Principal,
    modelId: string,
    action:
      'CREATE' | 'UPDATE' | 'PUBLISH' | 'RETIRE' | 'REACTIVATE' | 'REVISE',
    id?: string,
    version?: number,
    raw?: unknown,
    activate = false,
  ) {
    const model = await this.model(p, modelId);
    if (model.status !== 'ACTIVE')
      throw new ConflictException({
        code: 'MODEL_INACTIVE',
        message: 'Model is inactive',
      });
    if (
      ['CREATE', 'UPDATE', 'REVISE'].includes(action) &&
      !validWarrantyPolicy(raw)
    )
      throw new BadRequestException({
        code: 'INVALID_POLICY',
        message: 'Invalid policy fields or limits',
      });
    const tenantId = requireTenantId(p);
    return this.db.$transaction(async (tx) => {
      const key = `policy:${tenantId.toLowerCase()}:${modelId.toLowerCase()}`;
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key},0))::text`;
      await tx.$queryRaw`SELECT id FROM equipment_models WHERE tenant_id=${tenantId}::uuid AND id=${modelId}::uuid FOR SHARE`;
      const current = await tx.equipmentModel.findFirst({
        where: { id: modelId, tenantId, status: 'ACTIVE' },
      });
      if (!current)
        throw new ConflictException({
          code: 'MODEL_INACTIVE',
          message: 'Model is inactive',
        });
      const before =
        action === 'CREATE'
          ? null
          : await tx.modelWarrantyRevision.findFirst({
              where: { id, tenantId, modelId },
            });
      if (!before && action !== 'CREATE')
        throw new NotFoundException({
          code: 'POLICY_NOT_FOUND',
          message: 'Policy revision not found',
        });
      const statuses: Record<typeof action, string[]> = {
        UPDATE: ['DRAFT'],
        PUBLISH: ['DRAFT'],
        RETIRE: ['PUBLISHED'],
        REACTIVATE: ['RETIRED', 'PUBLISHED'],
        REVISE: ['PUBLISHED', 'RETIRED'],
        CREATE: [],
      };
      if (
        before &&
        (before.version !== version ||
          !statuses[action].includes(before.status) ||
          (action === 'REACTIVATE' && before.isDefault))
      )
        throw new ConflictException({
          code: 'POLICY_VERSION_CONFLICT',
          message: 'Reload the policy and verify its version and status',
        });
      const makeDefault =
        action === 'PUBLISH' ||
        action === 'REACTIVATE' ||
        (activate &&
          (action === 'CREATE' || action === 'UPDATE' || action === 'REVISE'));
      if (makeDefault)
        await tx.modelWarrantyRevision.updateMany({
          where: { tenantId, modelId, isDefault: true },
          data: { isDefault: false, version: { increment: 1 } },
        });
      let row;
      if (!before || action === 'REVISE') {
        // Advance the edit token so a replay cannot create another revision.
        if (before && !(makeDefault && before.isDefault))
          await tx.modelWarrantyRevision.update({
            where: { id: before.id },
            data: { version: { increment: 1 } },
          });
        const last = await tx.modelWarrantyRevision.findFirst({
          where: { tenantId, modelId },
          orderBy: { revision: 'desc' },
        });
        row = await tx.modelWarrantyRevision.create({
          data: {
            tenantId,
            modelId,
            revision: (last?.revision ?? 0) + 1,
            body: raw as Prisma.InputJsonValue,
            createdBy: p.userId,
            ...(makeDefault ? { status: 'PUBLISHED', isDefault: true } : {}),
          },
        });
      } else {
        row = await tx.modelWarrantyRevision.update({
          where: { id: before.id },
          data: {
            version: { increment: 1 },
            ...(action === 'UPDATE'
              ? { body: raw as Prisma.InputJsonValue }
              : {}),
            ...(makeDefault
              ? { status: 'PUBLISHED', isDefault: true }
              : action === 'RETIRE'
                ? { status: 'RETIRED', isDefault: false }
                : {}),
          },
        });
      }
      await tx.equipmentModelHistory.create({
        data: {
          tenantId,
          modelId,
          actorId: p.userId,
          actorRoles: [...p.roles],
          eventType: 'POLICY_' + action,
          changes: {
            ...(action === 'REVISE' && before
              ? { sourceRevisionId: before.id }
              : {}),
            revisionId: row.id,
            revision: row.revision,
            status: row.status,
            isDefault: row.isDefault,
            body: row.body,
          },
        },
      });
      return row;
    });
  }
}

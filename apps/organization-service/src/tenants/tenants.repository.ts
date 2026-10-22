import { Injectable } from '@nestjs/common';
import { enqueueEvent, Events } from '@pbl6/event-contracts';
import { getCorrelationId, toSkipTake } from '@pbl6/service-kit';
import { codeOrNameMatches } from '../common/validation';
import { Prisma, Tenant } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service';
import type { ListTenantsQueryDto, TenantStatus } from './dto/tenant.dto';

/**
 * Data access for tenants. Every change that other services must learn about
 * writes its event to `outbox_events` in the same transaction (ADR 0005).
 */
@Injectable()
export class TenantsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListTenantsQueryDto): Promise<[Tenant[], number]> {
    const where: Prisma.TenantWhereInput = {
      deletedAt: null,
      status: query.status,
      ...codeOrNameMatches(query.q),
    };
    return this.prisma.$transaction([
      this.prisma.tenant.findMany({ where, orderBy: { code: 'asc' }, ...toSkipTake(query) }),
      this.prisma.tenant.count({ where }),
    ]);
  }

  find(id: string): Promise<Tenant | null> {
    return this.prisma.tenant.findFirst({ where: { id, deletedAt: null } });
  }

  /** Creates the tenant and its `TenantCreated` event together. */
  create(data: Prisma.TenantCreateInput): Promise<Tenant> {
    return this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({ data });
      await enqueueEvent(tx, Events.TenantCreated, {
        tenantId: tenant.id,
        aggregateId: tenant.id,
        payload: {
          tenantId: tenant.id,
          code: tenant.code,
          name: tenant.name,
          status: tenant.status as TenantStatus,
        },
        correlationId: getCorrelationId(),
      });
      return tenant;
    });
  }

  update(id: string, data: Prisma.TenantUpdateInput): Promise<Tenant> {
    return this.prisma.tenant.update({ where: { id }, data });
  }

  /**
   * Changes the status and writes `TenantStatusChanged` together. The row is
   * locked first, so `previousStatus` is the status this change replaced even
   * when two changes race. Returns null when the status is already `status`.
   */
  changeStatus(id: string, status: TenantStatus): Promise<Tenant | null> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM tenants WHERE id = ${id}::uuid FOR UPDATE`;
      const current = await tx.tenant.findUniqueOrThrow({ where: { id } });
      if (current.status === status) return null;
      const tenant = await tx.tenant.update({ where: { id }, data: { status } });
      await enqueueEvent(tx, Events.TenantStatusChanged, {
        tenantId: tenant.id,
        aggregateId: tenant.id,
        payload: {
          tenantId: tenant.id,
          code: tenant.code,
          status,
          previousStatus: current.status as TenantStatus,
          changedAt: tenant.updatedAt.toISOString(),
        },
        correlationId: getCorrelationId(),
      });
      return tenant;
    });
  }
}

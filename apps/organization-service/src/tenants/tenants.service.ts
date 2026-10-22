import { Injectable, Logger } from '@nestjs/common';
import { type Page, toPage } from '@pbl6/service-kit';
import { conflict, notFound } from '../common/errors';
import type { Tenant } from '../generated/prisma/client.js';
import type {
  ChangeTenantStatusDto,
  CreateTenantDto,
  ListTenantsQueryDto,
  UpdateTenantDto,
} from './dto/tenant.dto';
import { type TenantResponse, toTenantResponse } from './tenant.response';
import { TenantsRepository } from './tenants.repository';

/** Tenant administration of the platform (Platform Admin only). */
@Injectable()
export class TenantsService {
  private readonly logger = new Logger(TenantsService.name);

  constructor(private readonly tenants: TenantsRepository) {}

  async list(query: ListTenantsQueryDto): Promise<Page<TenantResponse>> {
    const [rows, total] = await this.tenants.list(query);
    return toPage(rows.map(toTenantResponse), total, query);
  }

  async get(id: string): Promise<TenantResponse> {
    return toTenantResponse(await this.load(id));
  }

  /** The Tenant Admin account is created afterwards through Identity (ADR 0006). */
  async create(input: CreateTenantDto): Promise<TenantResponse> {
    return toTenantResponse(await this.tenants.create(input));
  }

  /** Name and plan only: the code is used at login and never changes. */
  async update(id: string, input: UpdateTenantDto): Promise<TenantResponse> {
    await this.load(id);
    return toTenantResponse(await this.tenants.update(id, input));
  }

  async changeStatus(
    id: string,
    input: ChangeTenantStatusDto,
    changedBy: string,
  ): Promise<TenantResponse> {
    const before = await this.load(id);
    const tenant = await this.tenants.changeStatus(id, input.status);
    if (!tenant) {
      throw conflict(
        'INVALID_STATE_TRANSITION',
        `The tenant is already ${input.status}`,
      );
    }
    // No column keeps the reason; the structured log is the audit trail.
    this.logger.log({
      msg: 'Tenant status changed',
      tenantId: id,
      from: before.status,
      to: tenant.status,
      changedBy,
      reason: input.reason ?? null,
    });
    return toTenantResponse(tenant);
  }

  private async load(id: string): Promise<Tenant> {
    const tenant = await this.tenants.find(id);
    if (!tenant) throw notFound('TENANT_NOT_FOUND', 'Tenant not found');
    return tenant;
  }
}

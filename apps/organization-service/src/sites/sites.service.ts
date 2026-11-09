import { Injectable, ForbiddenException } from '@nestjs/common';
import type { DataScope, Principal } from '@pbl6/auth';
import { BranchesRepository } from '../branches/branches.repository';
import { notFound, unprocessable } from '../common/errors';
import { assertCustomerVisible } from '../common/scope';
import { CustomersService } from '../customers/customers.service';
import type { CustomerSite } from '../generated/prisma/client.js';
import type { CreateSiteDto, UpdateSiteDto } from './dto/site.dto';
import { type SiteResponse, toSiteResponse } from './site.response';
import { SitesRepository } from './sites.repository';

@Injectable()
export class SitesService {
  constructor(
    private readonly sites: SitesRepository,
    private readonly customers: CustomersService,
    private readonly branches: BranchesRepository,
  ) {}

  async list(scope: DataScope, customerId: string): Promise<SiteResponse[]> {
    await this.customers.load(scope, customerId);
    const sites = await this.sites.listSites(scope.tenantId, customerId);
    return sites.map(toSiteResponse);
  }

  async get(scope: DataScope, id: string): Promise<SiteResponse> {
    return toSiteResponse(await this.load(scope, id));
  }

  async create(
    scope: DataScope,
    customerId: string,
    input: CreateSiteDto,
    actor?: Principal,
  ): Promise<SiteResponse> {
    await this.customers.load(scope, customerId);
    if (actor && !actor.roles.includes('TENANT_ADMIN')) {
      const own = await this.branches.primaryBranch(
        scope.tenantId,
        actor.userId,
      );
      await this.assertBranch(scope.tenantId, input.defaultServicingBranchId);
      if (
        input.defaultServicingBranchId &&
        (!own || input.defaultServicingBranchId !== own.id)
      )
        throw new ForbiddenException({
          code: 'BRANCH_ROUTING_FORBIDDEN',
          message: 'Only Tenant Admin can choose another servicing branch',
        });
      if (own && input.defaultServicingBranchId === undefined)
        input = { ...input, defaultServicingBranchId: own.id };
    }
    await this.assertBranch(scope.tenantId, input.defaultServicingBranchId);
    const site = await this.sites.createSite({
      ...input,
      tenantId: scope.tenantId,
      customerId,
    });
    return toSiteResponse(site);
  }

  async update(
    scope: DataScope,
    id: string,
    input: UpdateSiteDto,
    actor?: Principal,
  ): Promise<SiteResponse> {
    const current = await this.load(scope, id);
    await this.assertBranch(scope.tenantId, input.defaultServicingBranchId);
    if (
      actor &&
      !actor.roles.includes('TENANT_ADMIN') &&
      input.defaultServicingBranchId !== undefined &&
      input.defaultServicingBranchId !== current.defaultServicingBranchId
    )
      throw new ForbiddenException({
        code: 'BRANCH_ROUTING_FORBIDDEN',
        message: 'Only Tenant Admin can change site routing',
      });
    await this.assertBranch(scope.tenantId, input.defaultServicingBranchId);
    return toSiteResponse(await this.sites.updateSite(id, input));
  }

  /** Soft delete; its locations are hidden with it, its contacts lose the site. */
  async remove(scope: DataScope, id: string): Promise<void> {
    await this.load(scope, id);
    await this.sites.softDeleteSite(id);
  }

  /** A live site (of a live customer) that the caller may see, else 404. */
  async load(scope: DataScope, id: string): Promise<CustomerSite> {
    const site = await this.sites.findSite(scope.tenantId, id);
    if (!site) throw notFound('SITE_NOT_FOUND', 'Site not found');
    assertCustomerVisible(scope, site.customerId, 'SITE_NOT_FOUND');
    return site;
  }

  private async assertBranch(
    tenantId: string,
    branchId: string | null | undefined,
  ): Promise<void> {
    if (!branchId) return;
    const branch = await this.branches.find(tenantId, branchId);
    if (!branch || branch.status !== 'ACTIVE') {
      throw unprocessable(
        'BRANCH_NOT_FOUND',
        'The default servicing branch is not a branch of this tenant',
      );
    }
  }
}

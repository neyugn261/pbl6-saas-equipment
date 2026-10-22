import { Injectable } from '@nestjs/common';
import type { DataScope } from '@pbl6/auth';
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
  ): Promise<SiteResponse> {
    await this.customers.load(scope, customerId);
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
  ): Promise<SiteResponse> {
    await this.load(scope, id);
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
    if (!(await this.branches.find(tenantId, branchId))) {
      throw unprocessable(
        'BRANCH_NOT_FOUND',
        'The default servicing branch is not a branch of this tenant',
      );
    }
  }
}

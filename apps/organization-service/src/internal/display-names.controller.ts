import { Controller, Get, Query } from '@nestjs/common';
import { AllowUserTypes, CurrentUser, dataScope, requireTenantId, RequirePermissions, type Principal } from '@pbl6/auth';
import { DisplayIdsQuery } from '@pbl6/service-kit';
import { BranchesRepository } from '../branches/branches.repository';
import { CustomersRepository } from '../customers/customers.repository';
import { SitesRepository } from '../sites/sites.repository';

@Controller('internal/display-names')
export class OrganizationDisplayNamesController {
  constructor(
    private readonly branchesRepo: BranchesRepository,
    private readonly customersRepo: CustomersRepository,
    private readonly sitesRepo: SitesRepository,
  ) {}
  @Get('branches')
  @AllowUserTypes('TENANT_STAFF')
  @RequirePermissions('branch:read')
  branches(@CurrentUser() p: Principal, @Query() q: DisplayIdsQuery) {
    return this.branchesRepo.displayNames(requireTenantId(p), q.ids);
  }
  @Get('sites')
  @RequirePermissions('customer:read')
  sites(@CurrentUser() p: Principal, @Query() q: DisplayIdsQuery) {
    return this.sitesRepo.displayNames(dataScope(p), q.ids);
  }
  @Get('customers')
  @RequirePermissions('customer:read')
  customers(@CurrentUser() p: Principal, @Query() q: DisplayIdsQuery) {
    return this.customersRepo.displayNames(dataScope(p), q.ids);
  }
  @Get('locations')
  @RequirePermissions('customer:read')
  locations(@CurrentUser() p: Principal, @Query() q: DisplayIdsQuery) {
    return this.sitesRepo.displayLocationNames(dataScope(p), q.ids);
  }
}

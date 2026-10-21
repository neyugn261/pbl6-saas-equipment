import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import {
  CurrentUser,
  dataScope,
  type Principal,
  RequirePermissions,
} from '@pbl6/auth';
import { IsOptional, IsUUID } from 'class-validator';
import { notFound } from '../common/errors';
import { CustomersService } from '../customers/customers.service';
import { SitesRepository } from '../sites/sites.repository';
import { SitesService } from '../sites/sites.service';

export class SiteRefQueryDto {
  @IsOptional()
  @IsUUID()
  locationId?: string;
}

export interface CustomerRef {
  id: string;
  code: string;
  name: string;
  status: string;
}

export interface SiteRef {
  customerId: string;
  siteId: string;
  siteStatus: string;
  locationId: string | null;
  defaultServicingBranchId: string | null;
}

/**
 * Lookups for Asset and Service Request (ADR 0004): called with the user's
 * forwarded token, so the caller's tenant and customer scope apply. The
 * gateway never routes /internal/*.
 */
@Controller('internal/customers')
export class InternalController {
  constructor(
    private readonly customers: CustomersService,
    private readonly sites: SitesService,
    private readonly repository: SitesRepository,
  ) {}

  @Get(':customerId')
  @RequirePermissions('customer:read')
  async customer(
    @Param('customerId', ParseUUIDPipe) id: string,
    @CurrentUser() user: Principal,
  ): Promise<CustomerRef> {
    const customer = await this.customers.load(dataScope(user), id);
    return {
      id: customer.id,
      code: customer.code,
      name: customer.name,
      status: customer.status,
    };
  }

  /** 404 CUSTOMER_NOT_FOUND, SITE_NOT_FOUND (also a site of another customer) or LOCATION_NOT_FOUND. */
  @Get(':customerId/sites/:siteId')
  @RequirePermissions('customer:read')
  async site(
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @Query() query: SiteRefQueryDto,
    @CurrentUser() user: Principal,
  ): Promise<SiteRef> {
    const scope = dataScope(user);
    await this.customers.load(scope, customerId);
    const site = await this.sites.load(scope, siteId);
    if (site.customerId !== customerId) {
      throw notFound('SITE_NOT_FOUND', 'Site not found');
    }
    if (query.locationId) {
      const location = await this.repository.findLocation(scope.tenantId, query.locationId);
      if (!location || location.customerSiteId !== site.id) {
        throw notFound('LOCATION_NOT_FOUND', 'Location not found');
      }
    }
    return {
      customerId,
      siteId: site.id,
      siteStatus: site.status,
      locationId: query.locationId ?? null,
      defaultServicingBranchId: site.defaultServicingBranchId,
    };
  }
}

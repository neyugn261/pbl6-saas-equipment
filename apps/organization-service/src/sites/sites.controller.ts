import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import {
  AllowUserTypes,
  CurrentUser,
  dataScope,
  type Principal,
  RequirePermissions,
} from '@pbl6/auth';
import { CreateLocationDto, UpdateLocationDto } from './dto/location.dto';
import { CreateSiteDto, UpdateSiteDto } from './dto/site.dto';
import { LocationsService } from './locations.service';
import type { LocationResponse, SiteResponse } from './site.response';
import { SitesService } from './sites.service';

/** Customer sites and locations. Reads follow the customer scope (ADR 0003); writes are staff only. */
@Controller()
export class SitesController {
  constructor(
    private readonly sites: SitesService,
    private readonly locations: LocationsService,
  ) {}

  @Get('customers/:customerId/sites')
  @RequirePermissions('customer:read')
  list(
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @CurrentUser() user: Principal,
  ): Promise<SiteResponse[]> {
    return this.sites.list(dataScope(user), customerId);
  }

  @Post('customers/:customerId/sites')
  @AllowUserTypes('TENANT_STAFF')
  @RequirePermissions('customer:manage')
  create(
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Body() body: CreateSiteDto,
    @CurrentUser() user: Principal,
  ): Promise<SiteResponse> {
    return this.sites.create(dataScope(user), customerId, body);
  }

  @Get('sites/:siteId')
  @RequirePermissions('customer:read')
  get(
    @Param('siteId', ParseUUIDPipe) id: string,
    @CurrentUser() user: Principal,
  ): Promise<SiteResponse> {
    return this.sites.get(dataScope(user), id);
  }

  @Patch('sites/:siteId')
  @AllowUserTypes('TENANT_STAFF')
  @RequirePermissions('customer:manage')
  update(
    @Param('siteId', ParseUUIDPipe) id: string,
    @Body() body: UpdateSiteDto,
    @CurrentUser() user: Principal,
  ): Promise<SiteResponse> {
    return this.sites.update(dataScope(user), id, body);
  }

  @Delete('sites/:siteId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @AllowUserTypes('TENANT_STAFF')
  @RequirePermissions('customer:manage')
  remove(
    @Param('siteId', ParseUUIDPipe) id: string,
    @CurrentUser() user: Principal,
  ): Promise<void> {
    return this.sites.remove(dataScope(user), id);
  }

  @Get('sites/:siteId/locations')
  @RequirePermissions('customer:read')
  listLocations(
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @CurrentUser() user: Principal,
  ): Promise<LocationResponse[]> {
    return this.locations.list(dataScope(user), siteId);
  }

  @Post('sites/:siteId/locations')
  @AllowUserTypes('TENANT_STAFF')
  @RequirePermissions('customer:manage')
  createLocation(
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @Body() body: CreateLocationDto,
    @CurrentUser() user: Principal,
  ): Promise<LocationResponse> {
    return this.locations.create(dataScope(user), siteId, body);
  }

  @Patch('locations/:locationId')
  @AllowUserTypes('TENANT_STAFF')
  @RequirePermissions('customer:manage')
  updateLocation(
    @Param('locationId', ParseUUIDPipe) id: string,
    @Body() body: UpdateLocationDto,
    @CurrentUser() user: Principal,
  ): Promise<LocationResponse> {
    return this.locations.update(dataScope(user), id, body);
  }

  @Delete('locations/:locationId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @AllowUserTypes('TENANT_STAFF')
  @RequirePermissions('customer:manage')
  removeLocation(
    @Param('locationId', ParseUUIDPipe) id: string,
    @CurrentUser() user: Principal,
  ): Promise<void> {
    return this.locations.remove(dataScope(user), id);
  }
}

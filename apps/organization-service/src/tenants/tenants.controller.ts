import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  AllowUserTypes,
  CurrentUser,
  type Principal,
  RequirePermissions,
} from '@pbl6/auth';
import type { Page } from '@pbl6/service-kit';
import {
  ChangeTenantStatusDto,
  CreateTenantDto,
  ListTenantsQueryDto,
  UpdateTenantDto,
} from './dto/tenant.dto';
import type { TenantResponse } from './tenant.response';
import { TenantsService } from './tenants.service';

@Controller('tenants')
@AllowUserTypes('PLATFORM_STAFF')
export class TenantsController {
  constructor(private readonly tenants: TenantsService) {}

  @Get()
  @RequirePermissions('tenant:read')
  list(@Query() query: ListTenantsQueryDto): Promise<Page<TenantResponse>> {
    return this.tenants.list(query);
  }

  @Post()
  @RequirePermissions('tenant:manage')
  create(@Body() body: CreateTenantDto): Promise<TenantResponse> {
    return this.tenants.create(body);
  }

  @Get(':tenantId')
  @RequirePermissions('tenant:read')
  get(@Param('tenantId', ParseUUIDPipe) id: string): Promise<TenantResponse> {
    return this.tenants.get(id);
  }

  @Patch(':tenantId')
  @RequirePermissions('tenant:manage')
  update(
    @Param('tenantId', ParseUUIDPipe) id: string,
    @Body() body: UpdateTenantDto,
  ): Promise<TenantResponse> {
    return this.tenants.update(id, body);
  }

  @Post(':tenantId/status')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('tenant:manage')
  changeStatus(
    @Param('tenantId', ParseUUIDPipe) id: string,
    @Body() body: ChangeTenantStatusDto,
    @CurrentUser() user: Principal,
  ): Promise<TenantResponse> {
    return this.tenants.changeStatus(id, body, user.userId);
  }
}

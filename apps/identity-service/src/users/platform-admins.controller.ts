import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { AllowUserTypes, CurrentUser, RequirePermissions } from '@pbl6/auth';
import type { Principal } from '@pbl6/auth';
import { UsersService } from './users.service';
import { InviteTenantAdminDto } from './dto/invite-tenant-admin.dto';
import { UpdateStatusDto } from './dto/update-status.dto';
import { AssignRolesDto } from './dto/assign-roles.dto';
import type { InviteUserResult, UserProfile } from './users.types';

/** Platform-only tenant provisioning and Tenant Admin recovery. */
@Controller('platform/tenants/:tenantId/admins')
@AllowUserTypes('PLATFORM_STAFF')
@RequirePermissions('tenant:manage')
export class PlatformAdminsController {
  constructor(private readonly users: UsersService) {}

  @Post()
  invite(
    @CurrentUser() principal: Principal,
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Body() body: InviteTenantAdminDto,
  ): Promise<InviteUserResult> {
    return this.users.inviteTenantAdmin(principal, tenantId, body);
  }

  @Post(':id/status')
  @HttpCode(HttpStatus.OK)
  updateStatus(
    @CurrentUser() principal: Principal,
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Param('id', ParseUUIDPipe) userId: string,
    @Body() body: UpdateStatusDto,
  ): Promise<UserProfile> {
    return this.users.updateTenantAdminStatus(
      principal,
      tenantId,
      userId,
      body,
    );
  }

  @Patch(':id/roles')
  updateRoles(
    @CurrentUser() principal: Principal,
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Param('id', ParseUUIDPipe) userId: string,
    @Body() body: AssignRolesDto,
  ): Promise<UserProfile> {
    return this.users.updateTenantAdminRoles(principal, tenantId, userId, body);
  }
}

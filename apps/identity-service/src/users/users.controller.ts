import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  AllowUserTypes,
  CurrentUser,
  Public,
  RequirePermissions,
} from '@pbl6/auth';
import type { Principal } from '@pbl6/auth';
import type { Page } from '@pbl6/service-kit';
import { UsersService } from './users.service';
import { InviteUserDto } from './dto/invite-user.dto';
import { ActivateAccountDto } from './dto/activate-account.dto';
import { AssignRolesDto } from './dto/assign-roles.dto';
import { UpdateStatusDto } from './dto/update-status.dto';
import { ListUsersDto } from './dto/list-users.dto';
import type { UserProfile, UserSummary } from './users.types';
import type { LoginResult } from '../auth/auth.types';
import type { ClientContext } from '../auth/auth.types';

function clientContext(request: Request): ClientContext {
  const userAgent = request.headers['user-agent'];
  return {
    ipAddress: request.ip?.slice(0, 64) ?? null,
    userAgent: userAgent ? userAgent.slice(0, 512) : null,
  };
}

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  /** List users in the caller's tenant. Requires user:read permission. */
  @Get()
  @AllowUserTypes('TENANT_STAFF')
  @RequirePermissions('user:read')
  listUsers(
    @CurrentUser() principal: Principal,
    @Query() query: ListUsersDto,
  ): Promise<Page<UserSummary>> {
    return this.users.listUsers(principal, query);
  }

  /** Get a single user by id. Requires user:read permission. */
  @Get(':id')
  @AllowUserTypes('TENANT_STAFF')
  @RequirePermissions('user:read')
  getUser(
    @CurrentUser() principal: Principal,
    @Param('id') userId: string,
  ): Promise<UserProfile> {
    return this.users.getUser(principal, userId);
  }

  /**
   * Invite a new user. Supports POST /users and POST /users/invite.
   * Requires user:manage permission.
   */
  @Post()
  @AllowUserTypes('TENANT_STAFF')
  @RequirePermissions('user:manage')
  inviteUser(
    @CurrentUser() principal: Principal,
    @Body() body: InviteUserDto,
  ): Promise<{ user: UserProfile; activationToken: string }> {
    return this.users.inviteUser(principal, body);
  }

  @Post('invite')
  @AllowUserTypes('TENANT_STAFF')
  @RequirePermissions('user:manage')
  inviteUserAlias(
    @CurrentUser() principal: Principal,
    @Body() body: InviteUserDto,
  ): Promise<{ user: UserProfile; activationToken: string }> {
    return this.users.inviteUser(principal, body);
  }

  /**
   * Activate an INVITED account. Public endpoint — uses a one-time token.
   */
  @Public()
  @Post('activate')
  @HttpCode(HttpStatus.OK)
  activateAccount(
    @Body() body: ActivateAccountDto,
    @Req() request: Request,
  ): Promise<LoginResult> {
    return this.users.activateAccount(body, clientContext(request));
  }

  /** Replace all roles of a user. Supports PATCH /users/:id/roles and PUT /users/:id/roles. */
  @Patch(':id/roles')
  @AllowUserTypes('TENANT_STAFF')
  @RequirePermissions('role:assign')
  assignRoles(
    @CurrentUser() principal: Principal,
    @Param('id') userId: string,
    @Body() body: AssignRolesDto,
  ): Promise<UserProfile> {
    return this.users.assignRoles(principal, userId, body);
  }

  @Put(':id/roles')
  @AllowUserTypes('TENANT_STAFF')
  @RequirePermissions('role:assign')
  assignRolesPut(
    @CurrentUser() principal: Principal,
    @Param('id') userId: string,
    @Body() body: AssignRolesDto,
  ): Promise<UserProfile> {
    return this.users.assignRoles(principal, userId, body);
  }

  /** Update user status (ACTIVE ↔ SUSPENDED). Supports POST /users/:id/status and PATCH /users/:id/status. */
  @Post(':id/status')
  @AllowUserTypes('TENANT_STAFF')
  @RequirePermissions('user:manage')
  updateStatus(
    @CurrentUser() principal: Principal,
    @Param('id') userId: string,
    @Body() body: UpdateStatusDto,
  ): Promise<UserProfile> {
    return this.users.updateStatus(principal, userId, body);
  }

  @Patch(':id/status')
  @AllowUserTypes('TENANT_STAFF')
  @RequirePermissions('user:manage')
  updateStatusPatch(
    @CurrentUser() principal: Principal,
    @Param('id') userId: string,
    @Body() body: UpdateStatusDto,
  ): Promise<UserProfile> {
    return this.users.updateStatus(principal, userId, body);
  }
}

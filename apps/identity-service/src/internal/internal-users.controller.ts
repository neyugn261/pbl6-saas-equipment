import { Controller, Get, Param, Query } from '@nestjs/common';
import { AllowUserTypes, CurrentUser } from '@pbl6/auth';
import type { Principal } from '@pbl6/auth';
import type { Page } from '@pbl6/service-kit';
import { InternalUsersService } from './internal-users.service';
import { ListInternalUsersDto } from './dto/list-internal-users.dto';
import type { InternalUserListItem, UserSnapshot } from '../users/users.types';

/**
 * Internal API consumed by peer services (ADR 0004).
 * All routes require a valid bearer token; no public routes.
 * Scoped to the caller's tenantId; returns 404 if outside tenant.
 */
@Controller('internal/users')
@AllowUserTypes('TENANT_STAFF')
export class InternalUsersController {
  constructor(private readonly service: InternalUsersService) {}

  /** Get a single user snapshot. Validates tenantId against the caller's token. */
  @Get(':id')
  getUserSnapshot(
    @CurrentUser() principal: Principal,
    @Param('id') userId: string,
  ): Promise<UserSnapshot> {
    return this.service.getUserSnapshot(principal, userId);
  }

  /** List user snapshots in the caller's tenant. */
  @Get()
  listUserSnapshots(
    @CurrentUser() principal: Principal,
    @Query() query: ListInternalUsersDto,
  ): Promise<Page<InternalUserListItem>> {
    return this.service.listUserSnapshots(principal, query);
  }
}

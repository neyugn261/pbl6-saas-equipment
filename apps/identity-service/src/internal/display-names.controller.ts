import { Controller, Get, Query } from '@nestjs/common';
import { AllowUserTypes, CurrentUser, requireTenantId, type Principal } from '@pbl6/auth';
import { DisplayIdsQuery } from '@pbl6/service-kit';
import { UsersRepository } from '../users/users.repository';

/** Same staff-only scope as the existing internal user list; no email or role disclosure. */
@Controller('internal/display-names/users')
@AllowUserTypes('TENANT_STAFF')
export class UserDisplayNamesController {
  constructor(private readonly users: UsersRepository) {}
  @Get()
  list(@CurrentUser() p: Principal, @Query() query: DisplayIdsQuery) {
    return this.users.displayNames(requireTenantId(p), query.ids);
  }
}

import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import {
  AllowUserTypes,
  CurrentUser,
  RequirePermissions,
  requireTenantId,
  type Principal,
} from '@pbl6/auth';
import { BranchesRepository } from '../branches/branches.repository';

@Controller('staff')
@AllowUserTypes('TENANT_STAFF')
export class StaffContextController {
  constructor(private readonly branches: BranchesRepository) {}
  @Get('me/branch')
  @RequirePermissions('branch:read')
  async branch(@CurrentUser() p: Principal) {
    const branch = await this.branches.primaryBranch(
      requireTenantId(p),
      p.userId,
    );
    return {
      tenantId: p.tenantId,
      userId: p.userId,
      branch: branch
        ? { id: branch.id, code: branch.code, name: branch.name }
        : null,
    };
  }
  @Get(':userId/branch')
  @RequirePermissions('branch:manage')
  async userBranch(
    @CurrentUser() p: Principal,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    const branch = await this.branches.primaryBranch(
      requireTenantId(p),
      userId,
    );
    return {
      tenantId: p.tenantId,
      userId,
      branch: branch
        ? { id: branch.id, code: branch.code, name: branch.name }
        : null,
    };
  }
}

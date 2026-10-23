import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { requireTenantId } from '@pbl6/auth';
import type { Principal } from '@pbl6/auth';
import type { Page } from '@pbl6/service-kit';
import { UsersRepository } from '../users/users.repository';
import { isCustomerAdminManageable } from '../users/customer-admin-scope';
import type { ListInternalUsersDto } from './dto/list-internal-users.dto';
import type { InternalUserListItem, UserSnapshot } from '../users/users.types';

@Injectable()
export class InternalUsersService {
  constructor(private readonly usersRepo: UsersRepository) {}

  /** Fetch a single user snapshot by id, scoped to the caller's tenant. */
  async getUserSnapshot(
    principal: Principal,
    userId: string,
  ): Promise<UserSnapshot> {
    if (
      principal.userType === 'CUSTOMER' &&
      !principal.roles.includes('CUSTOMER_ADMIN')
    ) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Customer User cannot use the internal user lookup',
      });
    }
    const tenantId = requireTenantId(principal);
    const user = await this.usersRepo.findUserById(userId);
    if (
      !user ||
      user.tenantId !== tenantId ||
      (principal.userType === 'CUSTOMER' &&
        !isCustomerAdminManageable(user, principal))
    ) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'User not found',
      });
    }
    return this.usersRepo.toSnapshot(user);
  }

  /** List user snapshots in the caller's tenant. */
  async listUserSnapshots(
    principal: Principal,
    query: ListInternalUsersDto,
  ): Promise<Page<InternalUserListItem>> {
    const tenantId = requireTenantId(principal);
    return this.usersRepo.findInternalUsers(tenantId, {
      page: query.page,
      pageSize: query.pageSize,
      status: query.status,
      role: query.role,
      userType: query.userType,
    });
  }
}

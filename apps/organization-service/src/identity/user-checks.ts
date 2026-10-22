import { ForbiddenException } from '@nestjs/common';
import { canAssignRole, type Principal } from '@pbl6/auth';
import { unprocessable } from '../common/errors';
import type { IdentityClient, IdentityUser } from './identity.client';

/** The account in the caller's tenant with the expected type, else 422. */
export async function requireUser(
  identity: IdentityClient,
  caller: Principal,
  userId: string,
  userType: IdentityUser['userType'],
  wrongTypeCode: string,
): Promise<IdentityUser> {
  const user = await identity.findUser(userId, caller.accessToken);
  if (!user || user.tenantId !== caller.tenantId) {
    throw unprocessable('USER_NOT_FOUND', 'No such user in this tenant');
  }
  if (user.userType !== userType) {
    throw unprocessable(wrongTypeCode, `The user is not a ${userType} account`);
  }
  return user;
}

/**
 * The caller may manage an account only when it may assign every role the
 * account holds (ASSIGNABLE_ROLES, ADR 0006): a Customer Admin manages
 * CUSTOMER_USER accounts, never another Customer Admin.
 */
export function assertCanManageUser(caller: Principal, user: IdentityUser): void {
  const blocked = user.roles.filter((role) => !canAssignRole(caller.roles, role));
  if (blocked.length > 0) {
    throw new ForbiddenException({
      code: 'ROLE_NOT_ASSIGNABLE',
      message: 'You may not manage an account with these roles',
      details: { roles: blocked },
    });
  }
}

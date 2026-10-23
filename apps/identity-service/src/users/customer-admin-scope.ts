import type { Principal } from '@pbl6/auth';
import type { UserWithRoles } from './users.repository';

/**
 * Customer Admin can see accounts linked to its customer and unlinked
 * CUSTOMER_USER accounts it invited. A link to another customer always wins
 * over invitation history.
 */
export function isCustomerAdminVisible(
  user: UserWithRoles,
  principal: Principal,
): boolean {
  if (
    principal.userType !== 'CUSTOMER' ||
    !principal.customerId ||
    user.tenantId !== principal.tenantId ||
    user.userType !== 'CUSTOMER' ||
    user.roles.length !== 1 ||
    user.roles[0].role.code !== 'CUSTOMER_USER'
  ) {
    return false;
  }
  if (user.customerLink) {
    return (
      user.customerLink.status === 'ACTIVE' &&
      user.customerLink.customerId === principal.customerId
    );
  }
  return user.roles[0].assignedBy === principal.userId;
}

/** Organization may use the internal lookup only for manageable Customer Users. */
export function isCustomerAdminManageable(
  user: UserWithRoles,
  principal: Principal,
): boolean {
  return isCustomerAdminVisible(user, principal);
}

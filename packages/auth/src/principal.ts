import type { PermissionCode, RoleCode, UserType } from './catalog';
import type { VerifiedClaims } from './claims';

/** The authenticated caller, available in handlers through `@CurrentUser()`. */
export interface Principal {
  userId: string;
  sessionId: string;
  /** NULL only for PLATFORM_STAFF. */
  tenantId: string | null;
  userType: UserType;
  roles: readonly RoleCode[];
  /** Derived from `roles` with the shared catalog. */
  permissions: ReadonlySet<PermissionCode>;
  /** Set only for CUSTOMER accounts linked to a customer (ADR 0003). */
  customerId: string | null;
  /** Raw bearer token, forwarded on synchronous service calls (ADR 0004). */
  accessToken: string;
  expiresAt: Date;
}

export function hasPermission(
  principal: Principal,
  permission: PermissionCode,
): boolean {
  return principal.permissions.has(permission);
}

export type { VerifiedClaims };

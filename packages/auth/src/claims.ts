import {
  isRoleCode,
  type RoleCode,
  USER_TYPES,
  type UserType,
} from './catalog';

/**
 * Claims of the access token issued by Identity Service (HS256).
 * Services authorize from these claims only — never from a tenant or
 * customer id sent by the client.
 */
export interface AccessTokenClaims {
  /** User id (identity_db.users.id). */
  sub: string;
  /** Session id (identity_db.auth_sessions.id) the token was issued for. */
  sid: string;
  /** NULL for PLATFORM_STAFF accounts. */
  tenant_id: string | null;
  user_type: UserType;
  /** Role codes from the fixed catalog. */
  roles: RoleCode[];
  /**
   * Customer of a CUSTOMER account (ADR 0003); NULL for staff accounts and for
   * a CUSTOMER account that is not linked to an active customer.
   */
  customer_id: string | null;
}

/** Claims after signature, issuer, audience and expiry were verified. */
export interface VerifiedClaims extends AccessTokenClaims {
  iat: number;
  exp: number;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}

/**
 * Checks the shape and internal consistency of verified JWT claims.
 * Returns the problem, or null when the claims are valid.
 */
export function claimsProblem(payload: Record<string, unknown>): string | null {
  if (!isUuid(payload.sub)) return 'sub must be a UUID';
  if (!isUuid(payload.sid)) return 'sid must be a UUID';
  if (!USER_TYPES.includes(payload.user_type as UserType)) {
    return 'user_type is unknown';
  }
  const tenantId = payload.tenant_id;
  if (tenantId !== null && !isUuid(tenantId)) {
    return 'tenant_id must be a UUID or null';
  }
  if ((payload.user_type === 'PLATFORM_STAFF') !== (tenantId === null)) {
    return 'tenant_id must be null exactly for PLATFORM_STAFF';
  }
  if (!Array.isArray(payload.roles) || !payload.roles.every(isRoleCode)) {
    return 'roles must be known role codes';
  }
  // Tokens issued before ADR 0003 have no customer_id claim: treat as null.
  const customerId = payload.customer_id ?? null;
  if (customerId !== null) {
    if (!isUuid(customerId)) return 'customer_id must be a UUID or null';
    if (payload.user_type !== 'CUSTOMER') {
      return 'customer_id is only allowed for CUSTOMER accounts';
    }
  }
  if (typeof payload.iat !== 'number' || typeof payload.exp !== 'number') {
    return 'iat and exp are required';
  }
  return null;
}

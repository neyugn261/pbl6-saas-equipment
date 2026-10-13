export const USER_TYPES = [
  'PLATFORM_STAFF',
  'TENANT_STAFF',
  'CUSTOMER',
] as const;
export type UserType = (typeof USER_TYPES)[number];

export type UserStatus = 'INVITED' | 'ACTIVE' | 'SUSPENDED' | 'DISABLED';
export type TenantStatus = 'ACTIVE' | 'SUSPENDED' | 'DISABLED';

/**
 * Claims of the access token. Other services authorize from these claims,
 * never from a tenant id sent by the client.
 */
export interface AccessTokenClaims {
  /** User id (identity_db.users.id). */
  sub: string;
  /** Session id (identity_db.auth_sessions.id) the token was issued for. */
  sid: string;
  /** NULL for PLATFORM_STAFF accounts. */
  tenant_id: string | null;
  user_type: UserType;
  /** Role codes from the fixed catalog, e.g. ["SERVICE_MANAGER"]. */
  roles: string[];
}

/** Claims available to request handlers after JwtAuthGuard. */
export interface AuthenticatedUser extends AccessTokenClaims {
  iat: number;
  exp: number;
}

/** Public view of an account. Never contains credentials or token hashes. */
export interface UserProfile {
  id: string;
  tenantId: string | null;
  userType: UserType;
  email: string;
  fullName: string;
  phone: string | null;
  status: UserStatus;
  roles: string[];
  lastLoginAt: Date | null;
}

export interface TokenPair {
  tokenType: 'Bearer';
  accessToken: string;
  /** Access token lifetime in seconds. */
  expiresIn: number;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
}

export interface LoginResult extends TokenPair {
  user: UserProfile;
}

export interface ClientContext {
  ipAddress: string | null;
  userAgent: string | null;
}

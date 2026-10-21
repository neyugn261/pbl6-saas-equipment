import type { AccessTokenClaims, UserType } from '@pbl6/auth';

export type { AccessTokenClaims, UserType };

export type UserStatus = 'INVITED' | 'ACTIVE' | 'SUSPENDED' | 'DISABLED';
export type TenantStatus = 'ACTIVE' | 'SUSPENDED' | 'DISABLED';

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
  /** Customer of a CUSTOMER account with an active link (ADR 0003), else null. */
  customerId: string | null;
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

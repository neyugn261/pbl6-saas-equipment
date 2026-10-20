import type { UserType } from '@pbl6/auth';
import type { UserStatus } from '../auth/auth.types';

/** Detailed view of a user account, returned to tenant staff. */
export interface UserProfile {
  id: string;
  tenantId: string | null;
  userType: UserType;
  email: string;
  fullName: string;
  phone: string | null;
  status: UserStatus;
  roles: string[];
  customerId: string | null;
  createdAt?: Date;
  lastLoginAt: Date | null;
}

/** Compact view used in list responses. */
export interface UserSummary {
  id: string;
  userType: UserType;
  email: string;
  fullName: string;
  phone: string | null;
  status: UserStatus;
  roles: string[];
  createdAt: Date;
}

/**
 * Snapshot sent to other services via the Internal API (ADR 0004).
 * Matches {id, tenantId, userType, status, roles, email, fullName}.
 * Never includes credentials.
 */
export interface UserSnapshot {
  id: string;
  tenantId: string | null;
  userType: UserType;
  status: UserStatus;
  roles: string[];
  email: string;
  fullName: string;
}

import { randomUUID } from 'node:crypto';
import type { AccessTokenClaims, RoleCode, UserType } from '@pbl6/auth';
import { ROLE_USER_TYPES } from '@pbl6/auth';
import jwt from 'jsonwebtoken';

/** Secret shared by e2e suites (never used outside tests). */
export const TEST_JWT_SECRET = 'e2e-test-secret-e2e-test-secret-0123456789';
export const TEST_JWT_ISSUER = 'pbl6-identity';
export const TEST_JWT_AUDIENCE = 'pbl6';

/** Environment that makes a service's AuthModule accept test tokens. */
export function testJwtEnv(): Record<string, string> {
  return {
    JWT_ACCESS_SECRET: TEST_JWT_SECRET,
    JWT_ISSUER: TEST_JWT_ISSUER,
    JWT_AUDIENCE: TEST_JWT_AUDIENCE,
  };
}

export interface TestTokenInput {
  role: RoleCode | RoleCode[];
  /** Required for tenant roles; ignored for PLATFORM_ADMIN. */
  tenantId?: string;
  /** For customer roles. */
  customerId?: string | null;
  userId?: string;
  sessionId?: string;
  /** Seconds; negative values create an expired token. */
  expiresIn?: number;
  secret?: string;
}

/**
 * Signs an access token exactly like Identity Service does, so other services
 * can be tested without running Identity:
 *
 * ```ts
 * const token = signTestAccessToken({ role: 'SERVICE_MANAGER', tenantId });
 * await request(app).get('/equipment').set('authorization', `Bearer ${token}`);
 * ```
 */
export function signTestAccessToken(input: TestTokenInput): string {
  const roles = Array.isArray(input.role) ? input.role : [input.role];
  const userType: UserType = ROLE_USER_TYPES[roles[0]];
  const claims: AccessTokenClaims = {
    sub: input.userId ?? randomUUID(),
    sid: input.sessionId ?? randomUUID(),
    tenant_id: userType === 'PLATFORM_STAFF' ? null : (input.tenantId ?? null),
    user_type: userType,
    roles,
    customer_id: userType === 'CUSTOMER' ? (input.customerId ?? null) : null,
  };
  if (userType !== 'PLATFORM_STAFF' && !claims.tenant_id) {
    throw new Error(`tenantId is required for role ${roles[0]}`);
  }
  return jwt.sign(claims, input.secret ?? TEST_JWT_SECRET, {
    algorithm: 'HS256',
    issuer: TEST_JWT_ISSUER,
    audience: TEST_JWT_AUDIENCE,
    expiresIn: input.expiresIn ?? 900,
  });
}

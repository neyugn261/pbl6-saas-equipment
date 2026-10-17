import jwt from 'jsonwebtoken';
import { permissionsOf } from './catalog';
import { claimsProblem, type VerifiedClaims } from './claims';
import type { JwtVerificationOptions } from './jwt-options';
import type { Principal } from './principal';

/** The token is missing, malformed, expired, forged or has inconsistent claims. */
export class InvalidAccessTokenError extends Error {
  override readonly name = 'InvalidAccessTokenError';
}

/**
 * Verifies Identity access tokens: HS256 only (no `none`, no algorithm
 * switching), issuer, audience, expiry, then the claim shape.
 */
export class AccessTokenVerifier {
  constructor(private readonly options: JwtVerificationOptions) {}

  verify(token: string): Principal {
    let payload: unknown;
    try {
      payload = jwt.verify(token, this.options.secret, {
        algorithms: ['HS256'],
        issuer: this.options.issuer,
        audience: this.options.audience,
      });
    } catch (error) {
      throw new InvalidAccessTokenError(
        error instanceof Error ? error.message : 'invalid token',
      );
    }
    if (payload === null || typeof payload !== 'object') {
      throw new InvalidAccessTokenError('token payload is not an object');
    }
    const problem = claimsProblem(payload as Record<string, unknown>);
    if (problem) {
      throw new InvalidAccessTokenError(problem);
    }
    const claims = payload as VerifiedClaims;
    return {
      userId: claims.sub,
      sessionId: claims.sid,
      tenantId: claims.tenant_id,
      userType: claims.user_type,
      roles: claims.roles,
      permissions: permissionsOf(claims.roles),
      customerId: claims.customer_id ?? null,
      accessToken: token,
      expiresAt: new Date(claims.exp * 1000),
    };
  }
}

/** Extracts the token of an `Authorization: Bearer <token>` header. */
export function bearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const [scheme, token, extra] = header.split(' ');
  if (scheme !== 'Bearer' || !token || extra !== undefined) return null;
  return token;
}

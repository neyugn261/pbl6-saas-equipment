import { createHash, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { IdentityEnv } from '../config/env.validation';
import { AccessTokenClaims, AuthenticatedUser } from './auth.types';

const REFRESH_TOKEN_BYTES = 32;
const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService<IdentityEnv, true>,
  ) {}

  get accessTokenTtlSeconds(): number {
    return this.config.get('JWT_ACCESS_TTL_SECONDS', { infer: true });
  }

  signAccessToken(claims: AccessTokenClaims): Promise<string> {
    return this.jwt.signAsync({ ...claims });
  }

  /** Throws when the token is malformed, expired or not issued by this service. */
  verifyAccessToken(token: string): Promise<AuthenticatedUser> {
    return this.jwt.verifyAsync<AuthenticatedUser>(token);
  }

  /**
   * Refresh tokens are opaque random strings. Only their SHA-256 hash is
   * stored (auth_sessions.refresh_token_hash), so a database leak does not
   * reveal usable tokens. A fast hash is enough because the input is random.
   */
  generateRefreshToken(): { token: string; hash: string } {
    const token = randomBytes(REFRESH_TOKEN_BYTES).toString('base64url');
    return { token, hash: this.hashRefreshToken(token) };
  }

  hashRefreshToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  refreshTokenExpiry(from = new Date()): Date {
    const days = this.config.get('REFRESH_TOKEN_TTL_DAYS', { infer: true });
    return new Date(from.getTime() + days * DAY_MS);
  }
}

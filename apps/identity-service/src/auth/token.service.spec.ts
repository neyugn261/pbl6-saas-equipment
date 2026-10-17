import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AccessTokenVerifier, InvalidAccessTokenError } from '@pbl6/auth';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';

const settings: Record<string, unknown> = {
  JWT_ACCESS_TTL_SECONDS: 900,
  REFRESH_TOKEN_TTL_DAYS: 7,
  BCRYPT_COST: 4,
};
const config = {
  get: (key: string) => settings[key],
} as unknown as ConfigService<never, true>;

describe('TokenService', () => {
  const jwt = new JwtService({
    secret: 'unit-test-secret-unit-test-secret',
    signOptions: { expiresIn: 900, issuer: 'pbl6-identity', audience: 'pbl6' },
    verifyOptions: {
      algorithms: ['HS256'],
      issuer: 'pbl6-identity',
      audience: 'pbl6',
    },
  });
  const tokens = new TokenService(jwt, config);
  const verifier = new AccessTokenVerifier({
    secret: 'unit-test-secret-unit-test-secret',
    issuer: 'pbl6-identity',
    audience: 'pbl6',
  });

  it('generates unique refresh tokens and stores only a SHA-256 hash', () => {
    const first = tokens.generateRefreshToken();
    const second = tokens.generateRefreshToken();
    expect(first.token).not.toBe(second.token);
    expect(first.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(first.hash).not.toContain(first.token);
    expect(tokens.hashRefreshToken(first.token)).toBe(first.hash);
  });

  it('computes the refresh expiry from REFRESH_TOKEN_TTL_DAYS', () => {
    const from = new Date('2026-01-01T00:00:00Z');
    expect(tokens.refreshTokenExpiry(from).toISOString()).toBe(
      '2026-01-08T00:00:00.000Z',
    );
  });

  it('issues tokens that the shared verifier of other services accepts', async () => {
    const claims = {
      sub: '33333333-3333-4333-8333-333333333333',
      sid: '44444444-4444-4444-8444-444444444444',
      tenant_id: '11111111-1111-4111-8111-111111111111',
      user_type: 'CUSTOMER' as const,
      roles: ['CUSTOMER_USER' as const],
      customer_id: '22222222-2222-4222-8222-222222222222',
    };
    const token = await tokens.signAccessToken(claims);
    expect(verifier.verify(token)).toMatchObject({
      userId: claims.sub,
      sessionId: claims.sid,
      tenantId: claims.tenant_id,
      userType: 'CUSTOMER',
      roles: ['CUSTOMER_USER'],
      customerId: claims.customer_id,
    });
  });

  it('is rejected by the shared verifier when signed with another secret', async () => {
    const forged = await new JwtService({
      secret: 'another-secret-another-secret-another',
      signOptions: { issuer: 'pbl6-identity', audience: 'pbl6' },
    }).signAsync({ sub: 'u1' });
    expect(() => verifier.verify(forged)).toThrow(InvalidAccessTokenError);
  });
});

describe('PasswordService', () => {
  const passwords = new PasswordService(config);

  it('hashes with bcrypt and verifies', async () => {
    const hash = await passwords.hash('S3cret!pass');
    expect(hash).toMatch(/^\$2[aby]\$04\$/);
    await expect(passwords.verify('S3cret!pass', hash)).resolves.toBe(true);
    await expect(passwords.verify('wrong', hash)).resolves.toBe(false);
  });

  it('never accepts an account without a password', async () => {
    await expect(passwords.verify('pbl6-dummy-password', null)).resolves.toBe(
      false,
    );
  });
});

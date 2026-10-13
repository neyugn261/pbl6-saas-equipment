import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
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

  it('round-trips access token claims', async () => {
    const claims = {
      sub: 'u1',
      sid: 's1',
      tenant_id: 't1',
      user_type: 'TENANT_STAFF' as const,
      roles: ['DISPATCHER'],
    };
    const token = await tokens.signAccessToken(claims);
    await expect(tokens.verifyAccessToken(token)).resolves.toMatchObject({
      ...claims,
      iss: 'pbl6-identity',
      aud: 'pbl6',
    });
  });

  it('rejects a token signed with another secret', async () => {
    const forged = await new JwtService({
      secret: 'another-secret-another-secret-xx',
    }).signAsync({ sub: 'u1' }, { issuer: 'pbl6-identity', audience: 'pbl6' });
    await expect(tokens.verifyAccessToken(forged)).rejects.toThrow();
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

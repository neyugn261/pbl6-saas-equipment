import { PORT_VARIABLE, validateEnv } from './env.validation';

const valid = {
  IDENTITY_DATABASE_URL: 'postgresql://user:pass@localhost:5432/identity_db',
  JWT_ACCESS_SECRET: 'x'.repeat(32),
};

describe('validateEnv', () => {
  it('applies defaults for optional settings', () => {
    expect(validateEnv(valid)).toMatchObject({
      NODE_ENV: 'development',
      PORT: 3001,
      JWT_ACCESS_TTL_SECONDS: 900,
      REFRESH_TOKEN_TTL_DAYS: 7,
      BCRYPT_COST: 12,
    });
  });

  it('reads the service-specific port variable', () => {
    expect(validateEnv({ ...valid, [PORT_VARIABLE]: '4101' }).PORT).toBe(4101);
  });

  it('requires the database URL and JWT secret', () => {
    expect(() => validateEnv({})).toThrow(
      /IDENTITY_DATABASE_URL is required[\s\S]*JWT_ACCESS_SECRET is required/,
    );
  });

  it.each(['CHANGE_ME', 'short-secret'])(
    'rejects the weak secret %s',
    (secret) => {
      expect(() =>
        validateEnv({ ...valid, JWT_ACCESS_SECRET: secret }),
      ).toThrow('JWT_ACCESS_SECRET');
    },
  );

  it('allows a low bcrypt cost only in tests', () => {
    expect(() => validateEnv({ ...valid, BCRYPT_COST: '4' })).toThrow(
      'BCRYPT_COST',
    );
    expect(
      validateEnv({ ...valid, NODE_ENV: 'test', BCRYPT_COST: '4' }).BCRYPT_COST,
    ).toBe(4);
  });

  it('rejects a non-PostgreSQL database URL', () => {
    expect(() =>
      validateEnv({ ...valid, IDENTITY_DATABASE_URL: 'mysql://localhost/db' }),
    ).toThrow('postgresql://');
  });
});

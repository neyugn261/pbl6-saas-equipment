import { PORT_VARIABLE, validateEnv } from './env.validation';

const valid = {
  MAINTENANCE_DATABASE_URL:
    'postgresql://user:pass@localhost:5432/maintenance_db',
  JWT_ACCESS_SECRET: 'x'.repeat(32),
};

describe('validateEnv', () => {
  it('uses defaults for optional settings', () => {
    expect(validateEnv(valid)).toEqual({
      ...valid,
      NODE_ENV: 'development',
      PORT: 3003,
      JWT_ISSUER: 'pbl6-identity',
      JWT_AUDIENCE: 'pbl6',
    });
  });

  it('reads the service-specific port variable', () => {
    expect(validateEnv({ ...valid, [PORT_VARIABLE]: '4100' }).PORT).toBe(4100);
  });

  it('rejects an invalid port', () => {
    expect(() => validateEnv({ ...valid, [PORT_VARIABLE]: 'abc' })).toThrow(
      PORT_VARIABLE,
    );
  });

  it('rejects an unknown NODE_ENV', () => {
    expect(() => validateEnv({ ...valid, NODE_ENV: 'staging' })).toThrow(
      'NODE_ENV',
    );
  });

  it('requires a database URL and a non-placeholder JWT secret', () => {
    expect(() => validateEnv({})).toThrow(
      /MAINTENANCE_DATABASE_URL is required[\s\S]*JWT_ACCESS_SECRET is required/,
    );
    expect(() =>
      validateEnv({ ...valid, JWT_ACCESS_SECRET: 'CHANGE_ME' }),
    ).toThrow('JWT_ACCESS_SECRET');
  });
});

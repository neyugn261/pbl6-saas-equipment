import { PORT_VARIABLE, validateEnv } from './env.validation';

const valid = {
  ASSET_DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
  ORGANIZATION_SERVICE_URL: 'http://localhost:3006',
  ASSET_QR_PORTAL_BASE_URL: 'http://localhost:5173/',
  JWT_ACCESS_SECRET: 'x'.repeat(32),
};

describe('validateEnv', () => {
  it('applies defaults for optional settings', () => {
    expect(validateEnv(valid)).toEqual({
      ...valid,
      NODE_ENV: 'development',
      PORT: 3002,
      JWT_ISSUER: 'pbl6-identity',
      JWT_AUDIENCE: 'pbl6',
    });
  });

  it('reads the service-specific port variable', () => {
    expect(validateEnv({ ...valid, [PORT_VARIABLE]: '4100' }).PORT).toBe(4100);
  });

  it('requires the database URL, Organization URL and JWT secret', () => {
    expect(() => validateEnv({})).toThrow(
      /ASSET_DATABASE_URL is required[\s\S]*ORGANIZATION_SERVICE_URL is required[\s\S]*JWT_ACCESS_SECRET is required/,
    );
  });

  it('rejects a non-HTTP Organization URL', () => {
    expect(() => validateEnv({ ...valid, ORGANIZATION_SERVICE_URL: 'file:///tmp/org' })).toThrow(
      'ORGANIZATION_SERVICE_URL',
    );
  });

  it('requires a valid portal base URL for QR deep links', () => {
    expect(() => validateEnv({ ...valid, ASSET_QR_PORTAL_BASE_URL: undefined })).toThrow('ASSET_QR_PORTAL_BASE_URL');
    expect(() => validateEnv({ ...valid, ASSET_QR_PORTAL_BASE_URL: 'file:///tmp/portal' })).toThrow('ASSET_QR_PORTAL_BASE_URL');
  });

  it('rejects a placeholder JWT secret', () => {
    expect(() => validateEnv({ ...valid, JWT_ACCESS_SECRET: 'CHANGE_ME' })).toThrow(
      'JWT_ACCESS_SECRET',
    );
  });

  it('rejects an invalid port and an unknown NODE_ENV', () => {
    expect(() => validateEnv({ ...valid, [PORT_VARIABLE]: 'abc' })).toThrow(PORT_VARIABLE);
    expect(() => validateEnv({ ...valid, NODE_ENV: 'staging' })).toThrow('NODE_ENV');
  });
});

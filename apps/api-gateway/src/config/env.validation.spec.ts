import { PORT_VARIABLE, validateEnv } from './env.validation';

const serviceUrls = {
  IDENTITY_SERVICE_URL: 'http://identity:3001',
  ORGANIZATION_SERVICE_URL: 'http://organization:3006',
  ASSET_SERVICE_URL: 'http://asset:3002',
  SERVICE_REQUEST_SERVICE_URL: 'http://request:3003',
  WORKORDER_SERVICE_URL: 'http://workorder:3004',
  MAINTENANCE_SERVICE_URL: 'http://maintenance:3005',
  INVENTORY_SERVICE_URL: 'http://inventory:3007',
  NOTIFICATION_SERVICE_URL: 'http://notification:3008',
};

describe('validateEnv', () => {
  it('uses the default port when none is configured', () => {
    const result = validateEnv(serviceUrls);
    expect(result.NODE_ENV).toBe('development');
    expect(result.PORT).toBe(3000);
  });

  it('requires explicit service URLs', () => {
    expect(() => validateEnv({})).toThrow('IDENTITY_SERVICE_URL');
    const result = validateEnv(serviceUrls);
    expect(result.IDENTITY_SERVICE_URL).toBe(serviceUrls.IDENTITY_SERVICE_URL);
    expect(result.ORGANIZATION_SERVICE_URL).toBe(
      serviceUrls.ORGANIZATION_SERVICE_URL,
    );
    expect(result.CORS_ORIGINS).toBe('http://localhost:5173');
    expect(result.LOGIN_RATE_LIMIT).toBe(10);
    expect(result.LOGIN_RATE_LIMIT_WINDOW_MS).toBe(15 * 60 * 1000);
  });

  it('reads the service-specific port variable', () => {
    expect(validateEnv({ ...serviceUrls, [PORT_VARIABLE]: '4100' }).PORT).toBe(
      4100,
    );
  });

  it('reads custom service URLs', () => {
    const result = validateEnv({
      ...serviceUrls,
      IDENTITY_SERVICE_URL: 'http://identity:3001',
      CORS_ORIGINS: 'https://app.example.com,https://admin.example.com',
    });
    expect(result.IDENTITY_SERVICE_URL).toBe('http://identity:3001');
    expect(result.CORS_ORIGINS).toBe(
      'https://app.example.com,https://admin.example.com',
    );
  });

  it('rejects an invalid port', () => {
    expect(() =>
      validateEnv({ ...serviceUrls, [PORT_VARIABLE]: 'abc' }),
    ).toThrow(PORT_VARIABLE);
  });

  it('rejects an unknown NODE_ENV', () => {
    expect(() => validateEnv({ ...serviceUrls, NODE_ENV: 'staging' })).toThrow(
      'NODE_ENV',
    );
  });

  it('rejects invalid login rate limit values', () => {
    expect(() =>
      validateEnv({ ...serviceUrls, LOGIN_RATE_LIMIT: '0' }),
    ).toThrow('LOGIN_RATE_LIMIT');
    expect(() =>
      validateEnv({ ...serviceUrls, LOGIN_RATE_LIMIT_WINDOW_MS: 'invalid' }),
    ).toThrow('LOGIN_RATE_LIMIT_WINDOW_MS');
  });

  it('rejects a malformed service URL', () => {
    expect(() =>
      validateEnv({ ...serviceUrls, ASSET_SERVICE_URL: 'asset:3002' }),
    ).toThrow('ASSET_SERVICE_URL');
  });
});

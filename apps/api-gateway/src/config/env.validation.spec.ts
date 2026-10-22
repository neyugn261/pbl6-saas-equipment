import { PORT_VARIABLE, validateEnv } from './env.validation';

describe('validateEnv', () => {
  it('uses the default port when none is configured', () => {
    const result = validateEnv({});
    expect(result.NODE_ENV).toBe('development');
    expect(result.PORT).toBe(3000);
  });

  it('applies default service URLs when none are configured', () => {
    const result = validateEnv({});
    expect(result.IDENTITY_SERVICE_URL).toBe('http://localhost:3001');
    expect(result.ORGANIZATION_SERVICE_URL).toBe('http://localhost:3006');
    expect(result.CORS_ORIGINS).toBe('http://localhost:5173');
    expect(result.LOGIN_RATE_LIMIT).toBe(10);
    expect(result.LOGIN_RATE_LIMIT_WINDOW_MS).toBe(15 * 60 * 1000);
  });

  it('reads the service-specific port variable', () => {
    expect(validateEnv({ [PORT_VARIABLE]: '4100' }).PORT).toBe(4100);
  });

  it('reads custom service URLs', () => {
    const result = validateEnv({
      IDENTITY_SERVICE_URL: 'http://identity:3001',
      CORS_ORIGINS: 'https://app.example.com,https://admin.example.com',
    });
    expect(result.IDENTITY_SERVICE_URL).toBe('http://identity:3001');
    expect(result.CORS_ORIGINS).toBe(
      'https://app.example.com,https://admin.example.com',
    );
  });

  it('rejects an invalid port', () => {
    expect(() => validateEnv({ [PORT_VARIABLE]: 'abc' })).toThrow(
      PORT_VARIABLE,
    );
  });

  it('rejects an unknown NODE_ENV', () => {
    expect(() => validateEnv({ NODE_ENV: 'staging' })).toThrow('NODE_ENV');
  });

  it('rejects invalid login rate limit values', () => {
    expect(() => validateEnv({ LOGIN_RATE_LIMIT: '0' })).toThrow(
      'LOGIN_RATE_LIMIT',
    );
    expect(() =>
      validateEnv({ LOGIN_RATE_LIMIT_WINDOW_MS: 'invalid' }),
    ).toThrow('LOGIN_RATE_LIMIT_WINDOW_MS');
  });
});

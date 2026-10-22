import { PORT_VARIABLE, validateEnv } from './env.validation';

const valid = {
  ORGANIZATION_DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
  JWT_ACCESS_SECRET: 'x'.repeat(32),
  IDENTITY_SERVICE_URL: 'http://localhost:3001',
};

describe('validateEnv', () => {
  it('applies defaults for optional settings', () => {
    expect(validateEnv(valid)).toEqual({
      ...valid,
      NODE_ENV: 'development',
      PORT: 3006,
      JWT_ISSUER: 'pbl6-identity',
      JWT_AUDIENCE: 'pbl6',
      RABBITMQ_URL: undefined,
    });
  });

  it('accepts an AMQP broker URL and refuses other schemes', () => {
    const url = 'amqp://user:pass@localhost:5672';
    expect(validateEnv({ ...valid, RABBITMQ_URL: url }).RABBITMQ_URL).toBe(url);
    expect(() => validateEnv({ ...valid, RABBITMQ_URL: 'http://localhost' })).toThrow('RABBITMQ_URL');
  });

  it('reads the service-specific port variable', () => {
    expect(validateEnv({ ...valid, [PORT_VARIABLE]: '4100' }).PORT).toBe(4100);
  });

  it('requires the database URL and the JWT secret', () => {
    expect(() => validateEnv({})).toThrow(
      /ORGANIZATION_DATABASE_URL is required[\s\S]*JWT_ACCESS_SECRET is required/,
    );
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

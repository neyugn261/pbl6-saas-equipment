import { PORT_VARIABLE, validateEnv } from './env.validation';

const valid = {
  ASSET_SERVICE_URL: 'http://localhost:3002',
  SERVICE_REQUEST_DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
  JWT_ACCESS_SECRET: 'x'.repeat(32),
};

describe('validateEnv', () => {
  it('applies defaults for optional settings', () => {
    expect(validateEnv(valid)).toEqual({
      ...valid,
      NODE_ENV: 'development',
      PORT: 3007,
      JWT_ISSUER: 'pbl6-identity',
      JWT_AUDIENCE: 'pbl6',
    });
  });

  it('reads the service-specific port variable', () => {
    expect(validateEnv({ ...valid, [PORT_VARIABLE]: '4100' }).PORT).toBe(4100);
  });

  it('requires the database URL and the JWT secret', () => {
    expect(() => validateEnv({})).toThrow(
      /SERVICE_REQUEST_DATABASE_URL is required[\s\S]*JWT_ACCESS_SECRET is required/,
    );
  });

  it('rejects a placeholder JWT secret', () => {
    expect(() =>
      validateEnv({ ...valid, JWT_ACCESS_SECRET: 'CHANGE_ME' }),
    ).toThrow('JWT_ACCESS_SECRET');
  });

  it('rejects an invalid port and an unknown NODE_ENV', () => {
    expect(() => validateEnv({ ...valid, [PORT_VARIABLE]: 'abc' })).toThrow(
      PORT_VARIABLE,
    );
    expect(() => validateEnv({ ...valid, NODE_ENV: 'staging' })).toThrow(
      'NODE_ENV',
    );
  });

  it('requires a valid RabbitMQ URL in production', () => {
    expect(() => validateEnv({ ...valid, NODE_ENV: 'production' })).toThrow(
      'RABBITMQ_URL is required in production',
    );
    expect(
      validateEnv({
        ...valid,
        NODE_ENV: 'production',
        RABBITMQ_URL: 'amqps://rabbitmq.internal',
      }).RABBITMQ_URL,
    ).toBe('amqps://rabbitmq.internal');
    expect(() =>
      validateEnv({ ...valid, RABBITMQ_URL: 'https://not-rabbitmq.local' }),
    ).toThrow('RABBITMQ_URL');
  });
});

import { PORT_VARIABLE, validateEnv } from './env.validation';
const valid = {
  WORKORDER_DATABASE_URL:
    'postgresql://user:pass@localhost:5432/workorder_test_db',
  IDENTITY_SERVICE_URL: 'http://identity.test',
  ORGANIZATION_SERVICE_URL: 'http://organization.test',
  ASSET_SERVICE_URL: 'http://asset.test',
  SERVICE_REQUEST_SERVICE_URL: 'http://requests.test',
  JWT_ACCESS_SECRET: 'x'.repeat(32),
};
describe('Work Order environment', () => {
  it('uses the service port and permits broker-free local runs', () => {
    expect(validateEnv(valid).PORT).toBe(3004);
    expect(validateEnv({ ...valid, [PORT_VARIABLE]: '4100' }).PORT).toBe(4100);
  });
  it('rejects missing and unsafe configuration before startup', () => {
    expect(() => validateEnv({})).toThrow('WORKORDER_DATABASE_URL');
    expect(() =>
      validateEnv({ ...valid, IDENTITY_SERVICE_URL: 'file:///tmp/file' }),
    ).toThrow('IDENTITY_SERVICE_URL');
    expect(() =>
      validateEnv({ ...valid, JWT_ACCESS_SECRET: 'CHANGE_ME' }),
    ).toThrow('JWT_ACCESS_SECRET');
    expect(() => validateEnv({ ...valid, [PORT_VARIABLE]: 0 })).toThrow(
      PORT_VARIABLE,
    );
  });
  it('requires RabbitMQ in production', () => {
    expect(() => validateEnv({ ...valid, NODE_ENV: 'production' })).toThrow(
      'RABBITMQ_URL',
    );
    expect(
      validateEnv({
        ...valid,
        NODE_ENV: 'production',
        RABBITMQ_URL: 'amqp://broker.test',
      }).NODE_ENV,
    ).toBe('production');
  });
});

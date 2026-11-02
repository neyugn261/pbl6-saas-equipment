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
  it('validates an optional Inventory proof URL without making existing WO startup depend on Inventory', () => {
    expect(validateEnv(valid).INVENTORY_SERVICE_URL).toBeUndefined();
    expect(
      validateEnv({ ...valid, INVENTORY_SERVICE_URL: 'http://inventory.test' })
        .INVENTORY_SERVICE_URL,
    ).toBe('http://inventory.test');
    expect(() =>
      validateEnv({ ...valid, INVENTORY_SERVICE_URL: 'file:///tmp/inventory' }),
    ).toThrow('INVENTORY_SERVICE_URL');
  });
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
  const storage = {
    WORKORDER_ATTACHMENTS_ENABLED: 'true',
    MINIO_ENDPOINT: 'localhost',
    MINIO_PORT: '9000',
    MINIO_REGION: 'us-east-1',
    MINIO_PUBLIC_ENDPOINT: 'http://localhost:9000',
    MINIO_ACCESS_KEY: 'test-access',
    MINIO_SECRET_KEY: 'test-secret',
    WORKORDER_ATTACHMENT_BUCKET: 'pbl6-wo-test',
  };
  it('requires complete storage settings only when attachment runtime is enabled', () => {
    expect(validateEnv(valid).WORKORDER_ATTACHMENTS_ENABLED).toBe(false);
    expect(() =>
      validateEnv({ ...valid, WORKORDER_ATTACHMENTS_ENABLED: 'true' }),
    ).toThrow('MINIO_REGION');
    expect(
      validateEnv({ ...valid, ...storage, NODE_ENV: 'test' })
        .WORKORDER_ATTACHMENT_WORKER_ENABLED,
    ).toBe(false);
    expect(
      validateEnv({ ...valid, ...storage }).WORKORDER_ATTACHMENT_WORKER_ENABLED,
    ).toBe(true);
  });
  it.each([
    'http://user:pass@localhost:9000',
    'http://localhost:9000/bucket',
    'http://localhost:9000?x=y',
  ])('rejects unsafe signing origin %s', (origin) => {
    expect(() =>
      validateEnv({ ...valid, ...storage, MINIO_PUBLIC_ENDPOINT: origin }),
    ).toThrow('MINIO_PUBLIC_ENDPOINT');
  });
  it('requires HTTPS storage in production and validates booleans/bucket', () => {
    expect(() =>
      validateEnv({
        ...valid,
        ...storage,
        NODE_ENV: 'production',
        RABBITMQ_URL: 'amqp://broker.test',
      }),
    ).toThrow('HTTPS');
    expect(() =>
      validateEnv({
        ...valid,
        ...storage,
        WORKORDER_ATTACHMENTS_ENABLED: 'yes',
      }),
    ).toThrow('WORKORDER_ATTACHMENTS_ENABLED');
    expect(() =>
      validateEnv({
        ...valid,
        ...storage,
        WORKORDER_ATTACHMENT_BUCKET: 'Invalid/Bucket',
      }),
    ).toThrow('WORKORDER_ATTACHMENT_BUCKET');
  });
});

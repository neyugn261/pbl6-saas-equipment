import { PORT_VARIABLE, validateEnv } from './env.validation';
import { testJwtEnv } from '@pbl6/testing';

const base = {
  ...testJwtEnv(),
  INVENTORY_DATABASE_URL:
    'postgresql://test:test@localhost:5432/inventory_test_db',
  ORGANIZATION_SERVICE_URL: 'http://organization.test',
  WORKORDER_SERVICE_URL: 'http://workorders.test',
};

describe('validateEnv', () => {
  it('uses the default port when none is configured', () => {
    expect(validateEnv(base)).toMatchObject({
      NODE_ENV: 'development',
      PORT: 3008,
    });
  });

  it('reads the service-specific port variable', () => {
    expect(validateEnv({ ...base, [PORT_VARIABLE]: '4100' }).PORT).toBe(4100);
  });

  it('rejects an invalid port', () => {
    expect(() => validateEnv({ ...base, [PORT_VARIABLE]: 'abc' })).toThrow(
      PORT_VARIABLE,
    );
  });

  it('rejects an unknown NODE_ENV', () => {
    expect(() => validateEnv({ ...base, NODE_ENV: 'staging' })).toThrow(
      'NODE_ENV',
    );
  });
  it('requires DB, JWT and both reference URLs', () => {
    for (const key of [
      'INVENTORY_DATABASE_URL',
      'JWT_ACCESS_SECRET',
      'ORGANIZATION_SERVICE_URL',
      'WORKORDER_SERVICE_URL',
    ])
      expect(() => validateEnv({ ...base, [key]: '' })).toThrow(key);
  });
  it('rejects invalid optional broker URLs', () => {
    expect(() =>
      validateEnv({ ...base, RABBITMQ_URL: 'http://wrong.test' }),
    ).toThrow('RABBITMQ_URL');
  });
});

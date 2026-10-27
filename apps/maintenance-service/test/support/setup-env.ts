import { testJwtEnv } from '@pbl6/testing';

Object.assign(process.env, testJwtEnv(), {
  NODE_ENV: 'test',
  ASSET_SERVICE_URL: 'http://asset.test',
  RABBITMQ_URL: '',
  MAINTENANCE_SCHEDULER_ENABLED: 'false',
  MAINTENANCE_DATABASE_URL:
    'postgresql://unused:unused@localhost:5432/unused_test_db',
});

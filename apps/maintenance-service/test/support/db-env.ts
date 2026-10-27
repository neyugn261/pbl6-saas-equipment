import { config as loadEnv } from 'dotenv';
import { requireTestDatabaseUrl, testJwtEnv } from '@pbl6/testing';
loadEnv({ path: '../../.env', quiet: true });
Object.assign(process.env, testJwtEnv(), {
  NODE_ENV: 'test',
  MAINTENANCE_DATABASE_URL: requireTestDatabaseUrl(
    'MAINTENANCE_TEST_DATABASE_URL',
  ),
  ASSET_SERVICE_URL: 'http://asset.test',
  MAINTENANCE_SCHEDULER_ENABLED: 'false',
  RABBITMQ_URL: '',
});

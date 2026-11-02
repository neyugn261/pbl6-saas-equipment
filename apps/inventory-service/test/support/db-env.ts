import { config } from 'dotenv';
import { requireTestDatabaseUrl, testJwtEnv } from '@pbl6/testing';
config({ path: '../../.env', quiet: true });
Object.assign(process.env, testJwtEnv(), {
  NODE_ENV: 'test',
  INVENTORY_DATABASE_URL: requireTestDatabaseUrl('INVENTORY_TEST_DATABASE_URL'),
  ORGANIZATION_SERVICE_URL: 'http://organization.test',
  WORKORDER_SERVICE_URL: 'http://workorders.test',
  RABBITMQ_TEST_URL:
    process.env.RABBITMQ_TEST_URL || process.env.RABBITMQ_URL || '',
  RABBITMQ_URL: '',
});

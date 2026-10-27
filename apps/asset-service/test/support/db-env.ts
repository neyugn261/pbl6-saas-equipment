import { config } from 'dotenv';
import { requireTestDatabaseUrl, testJwtEnv } from '@pbl6/testing';
config({ path: '../../.env', quiet: true });
Object.assign(process.env, testJwtEnv(), {
  NODE_ENV: 'test',
  ASSET_DATABASE_URL: requireTestDatabaseUrl('ASSET_TEST_DATABASE_URL'),
  RABBITMQ_URL: '',
  ORGANIZATION_SERVICE_URL: 'http://organization.test',
  ASSET_QR_PORTAL_BASE_URL: 'http://portal.test',
  SERVICE_REQUEST_SERVICE_URL: 'http://requests.test',
  WORKORDER_SERVICE_URL: 'http://workorder.test',
  MAINTENANCE_SERVICE_URL: 'http://maintenance.test',
});

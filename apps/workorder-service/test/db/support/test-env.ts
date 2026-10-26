import { requireTestDatabaseUrl, testJwtEnv } from '@pbl6/testing';
import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env', quiet: true });
loadEnv({ path: '../../.env', quiet: true });
export const testDatabaseUrl = () =>
  requireTestDatabaseUrl('WORKORDER_TEST_DATABASE_URL');
export function applyTestEnv() {
  Object.assign(process.env, testJwtEnv(), {
    NODE_ENV: 'test',
    WORKORDER_DATABASE_URL: testDatabaseUrl(),
    IDENTITY_SERVICE_URL: 'http://identity.test',
    ORGANIZATION_SERVICE_URL: 'http://organization.test',
    ASSET_SERVICE_URL: 'http://asset.test',
    SERVICE_REQUEST_SERVICE_URL: 'http://requests.test',
    RABBITMQ_URL: '',
  });
}

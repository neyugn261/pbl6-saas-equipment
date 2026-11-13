import { requireTestDatabaseUrl, testJwtEnv } from '@pbl6/testing';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: '.env', quiet: true });
loadEnv({ path: '../../.env', quiet: true });

export function testDatabaseUrl(): string {
  // Isolate a review baseline from local test databases containing other branches' migrations.
  // The shared guard still enforces an exact dedicated database name.
  return requireTestDatabaseUrl(process.env.SERVICE_REQUEST_REVIEW_TEST_DATABASE_URL
    ? 'SERVICE_REQUEST_REVIEW_TEST_DATABASE_URL' : 'SERVICE_REQUEST_TEST_DATABASE_URL');
}

export function applyTestEnv(): void {
  Object.assign(process.env, testJwtEnv(), {
    NODE_ENV: 'test',
    SERVICE_REQUEST_DATABASE_URL: testDatabaseUrl(),
    ASSET_SERVICE_URL: 'http://localhost:1',
    WORKORDER_SERVICE_URL: 'http://localhost:1',
    ORGANIZATION_SERVICE_URL: 'http://organization.test',
    RABBITMQ_URL: '',
  });
}

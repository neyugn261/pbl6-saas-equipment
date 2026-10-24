import { requireTestDatabaseUrl, testJwtEnv } from '@pbl6/testing';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: '.env', quiet: true });
loadEnv({ path: '../../.env', quiet: true });

export function testDatabaseUrl(): string {
  return requireTestDatabaseUrl('SERVICE_REQUEST_TEST_DATABASE_URL');
}

export function applyTestEnv(): void {
  Object.assign(process.env, testJwtEnv(), {
    NODE_ENV: 'test',
    SERVICE_REQUEST_DATABASE_URL: testDatabaseUrl(),
    ASSET_SERVICE_URL: 'http://localhost:1',
    RABBITMQ_URL: '',
  });
}

import { requireTestDatabaseUrl, testJwtEnv } from '@pbl6/testing';
import { config as loadEnv } from 'dotenv';

// Same lookup as the service: local .env, then the monorepo root .env.
// Variables already set (CI) always win.
loadEnv({ path: '.env', quiet: true });
loadEnv({ path: '../../.env', quiet: true });

/**
 * The suites TRUNCATE organization tables, so they only run against a
 * database whose name marks it as a test database.
 */
export function testDatabaseUrl(): string {
  return requireTestDatabaseUrl('ORGANIZATION_TEST_DATABASE_URL');
}

export function applyTestEnv(): void {
  Object.assign(process.env, testJwtEnv(), {
    NODE_ENV: 'test',
    ORGANIZATION_DATABASE_URL: testDatabaseUrl(),
    // Replaced by a fake IdentityClient in the suites.
    IDENTITY_SERVICE_URL: 'http://localhost:1',
    // No broker: suites read outbox_events directly or run the relay by hand.
    RABBITMQ_URL: '',
  });
}

import { requireTestDatabaseUrl, TEST_JWT_SECRET } from '@pbl6/testing';
import { config as loadEnv } from 'dotenv';

// Same lookup as the service: local .env, then the monorepo root .env.
// Variables already set (CI) always win.
loadEnv({ path: '.env', quiet: true });
loadEnv({ path: '../../.env', quiet: true });

export { TEST_JWT_SECRET };

/**
 * Environment for the e2e suite. The suite TRUNCATEs identity tables, so it
 * only runs against a database whose name marks it as a test database.
 */
export function testDatabaseUrl(): string {
  return requireTestDatabaseUrl('IDENTITY_TEST_DATABASE_URL');
}

export function applyTestEnv(): void {
  process.env.NODE_ENV = 'test';
  process.env.IDENTITY_DATABASE_URL = testDatabaseUrl();
  process.env.JWT_ACCESS_SECRET = TEST_JWT_SECRET;
  process.env.JWT_ISSUER = 'pbl6-identity';
  process.env.JWT_AUDIENCE = 'pbl6';
  process.env.JWT_ACCESS_TTL_SECONDS = '900';
  process.env.REFRESH_TOKEN_TTL_DAYS = '7';
  process.env.BCRYPT_COST = '4';
  // No broker in e2e: the directory consumer is exercised by calling its handler.
  process.env.RABBITMQ_URL = '';
}

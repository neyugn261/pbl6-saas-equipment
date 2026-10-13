/**
 * Environment for the e2e suite. The suite TRUNCATEs identity tables, so it
 * only runs against a database whose name marks it as a test database.
 */
export function testDatabaseUrl(): string {
  const url = process.env.IDENTITY_TEST_DATABASE_URL;
  if (!url) {
    throw new Error(
      'IDENTITY_TEST_DATABASE_URL is not set. Point it to a dedicated test database, ' +
        'e.g. postgresql://pbl6:pbl6_dev_password@localhost:5432/identity_test_db',
    );
  }
  const name = new URL(url).pathname.replace(/^\//, '');
  if (!/test/i.test(name)) {
    throw new Error(
      `Refusing to run e2e tests against "${name}": the database name must contain "test"`,
    );
  }
  return url;
}

export const TEST_JWT_SECRET = 'e2e-test-secret-e2e-test-secret-0123456789';

export function applyTestEnv(): void {
  process.env.NODE_ENV = 'test';
  process.env.IDENTITY_DATABASE_URL = testDatabaseUrl();
  process.env.JWT_ACCESS_SECRET = TEST_JWT_SECRET;
  process.env.JWT_ISSUER = 'pbl6-identity';
  process.env.JWT_AUDIENCE = 'pbl6';
  process.env.JWT_ACCESS_TTL_SECONDS = '900';
  process.env.REFRESH_TOKEN_TTL_DAYS = '7';
  process.env.BCRYPT_COST = '4';
}

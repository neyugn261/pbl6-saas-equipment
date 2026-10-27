/**
 * Returns a service's dedicated test URL. E2E suites truncate tables, so a
 * merely test-like database name (or another service's DB) is not sufficient.
 */
export function requireTestDatabaseUrl(variable: string): string {
  const url = process.env[variable];
  if (!url) {
    throw new Error(
      `${variable} is not set. Point it to a dedicated test database, e.g. ` +
        'postgresql://pbl6:pbl6_dev_password@localhost:5432/<service>_test_db',
    );
  }
  const match = /^([A-Z][A-Z0-9_]*)_TEST_DATABASE_URL$/.exec(variable);
  if (!match) {
    throw new Error(`${variable} must be a service TEST_DATABASE_URL variable`);
  }
  const expectedName = `${match[1].toLowerCase()}_test_db`;
  let name: string;
  try {
    const parsed = new URL(url);
    if (!['postgresql:', 'postgres:'].includes(parsed.protocol)) {
      throw new Error('Unsupported database protocol');
    }
    name = decodeURIComponent(parsed.pathname.slice(1));
  } catch {
    throw new Error(`${variable} is not a valid URL`);
  }
  if (name !== expectedName) {
    throw new Error(
      `Refusing to run tests against "${name}": expected "${expectedName}"`,
    );
  }
  return url;
}

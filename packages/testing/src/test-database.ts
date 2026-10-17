/**
 * Returns the URL in `variable` after checking that its database name
 * contains "test". E2E suites truncate tables, so they must never run against
 * a development or production database by mistake.
 */
export function requireTestDatabaseUrl(variable: string): string {
  const url = process.env[variable];
  if (!url) {
    throw new Error(
      `${variable} is not set. Point it to a dedicated test database, e.g. ` +
        'postgresql://pbl6:pbl6_dev_password@localhost:5432/<service>_test_db',
    );
  }
  let name: string;
  try {
    name = new URL(url).pathname.replace(/^\//, '');
  } catch {
    throw new Error(`${variable} is not a valid URL`);
  }
  if (!/test/i.test(name)) {
    throw new Error(
      `Refusing to run tests against "${name}": the database name must contain "test"`,
    );
  }
  return url;
}

import { testDatabaseUrl } from './test-env';

describe('Notification test database guard', () => {
  const original = process.env.NOTIFICATION_TEST_DATABASE_URL;
  afterEach(() => {
    if (original === undefined)
      delete process.env.NOTIFICATION_TEST_DATABASE_URL;
    else process.env.NOTIFICATION_TEST_DATABASE_URL = original;
  });
  it.each([
    'notification_db',
    'service_request_test_db',
    'shared_test_db',
    'notification_test_db_backup',
  ])('rejects %s before connecting or migrating', (name) => {
    process.env.NOTIFICATION_TEST_DATABASE_URL = `postgresql://localhost/${name}`;
    expect(() => testDatabaseUrl()).toThrow('expected "notification_test_db"');
  });
  it('rejects missing test configuration without falling back to development', () => {
    delete process.env.NOTIFICATION_TEST_DATABASE_URL;
    expect(() => testDatabaseUrl()).toThrow(
      'NOTIFICATION_TEST_DATABASE_URL is not set',
    );
  });
  it('accepts only the exact service test database', () => {
    process.env.NOTIFICATION_TEST_DATABASE_URL =
      'postgresql://localhost/notification_test_db';
    expect(testDatabaseUrl()).toBe(process.env.NOTIFICATION_TEST_DATABASE_URL);
  });
});

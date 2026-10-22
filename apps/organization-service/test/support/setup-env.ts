import { testJwtEnv } from '@pbl6/testing';

// Runs before each test file is imported: ConfigModule.forRoot validates the
// environment when AppModule is loaded, so it must already be complete — CI
// has no .env file.
Object.assign(process.env, testJwtEnv(), {
  NODE_ENV: 'test',
  ORGANIZATION_DATABASE_URL: 'postgresql://unused:unused@localhost:5432/unused_test_db',
  IDENTITY_SERVICE_URL: 'http://localhost:1',
  // No broker: the outbox relay stays off.
  RABBITMQ_URL: '',
});

import { testJwtEnv } from '@pbl6/testing';

// Runs before each test file is imported: ConfigModule.forRoot validates the
// environment when AppModule is loaded, so it must already be complete — CI
// has no .env file.
Object.assign(process.env, testJwtEnv(), {
  NODE_ENV: 'test',
  ASSET_DATABASE_URL: 'postgresql://unused:unused@localhost:5432/unused_test_db',
  ORGANIZATION_SERVICE_URL: 'http://organization.test',
  ASSET_QR_PORTAL_BASE_URL: 'http://portal.test/',
});

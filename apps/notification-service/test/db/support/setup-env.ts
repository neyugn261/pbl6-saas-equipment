import { testJwtEnv } from '@pbl6/testing';
import { testDatabaseUrl } from './test-env';

Object.assign(process.env, testJwtEnv(), {
  NODE_ENV: 'test',
  NOTIFICATION_DATABASE_URL: testDatabaseUrl(),
  ORGANIZATION_SERVICE_URL: 'http://organization.test',
});

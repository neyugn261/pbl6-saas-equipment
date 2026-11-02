import { testJwtEnv } from '@pbl6/testing';

Object.assign(process.env, testJwtEnv(), {
  NODE_ENV: 'test',
  NOTIFICATION_DATABASE_URL: 'postgresql://localhost/notification_test_db',
});

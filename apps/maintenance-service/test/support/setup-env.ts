import { testJwtEnv } from '@pbl6/testing';

Object.assign(process.env, testJwtEnv(), {
  NODE_ENV: 'test',
  MAINTENANCE_DATABASE_URL:
    'postgresql://unused:unused@localhost:5432/unused_test_db',
});

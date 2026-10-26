import { testJwtEnv } from '@pbl6/testing';
Object.assign(process.env, testJwtEnv(), {
  NODE_ENV: 'test',
  WORKORDER_DATABASE_URL:
    'postgresql://unused:unused@localhost:5432/unused_test_db',
  IDENTITY_SERVICE_URL: 'http://identity.test',
  ORGANIZATION_SERVICE_URL: 'http://organization.test',
  ASSET_SERVICE_URL: 'http://asset.test',
  SERVICE_REQUEST_SERVICE_URL: 'http://requests.test',
  RABBITMQ_URL: '',
});

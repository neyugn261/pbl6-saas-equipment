import { testJwtEnv } from '@pbl6/testing';
Object.assign(process.env, testJwtEnv(), {
  NODE_ENV: 'test',
  INVENTORY_DATABASE_URL:
    'postgresql://test:test@localhost:5432/inventory_test_db',
  ORGANIZATION_SERVICE_URL: 'http://organization.test',
  WORKORDER_SERVICE_URL: 'http://workorders.test',
  RABBITMQ_URL: '',
});

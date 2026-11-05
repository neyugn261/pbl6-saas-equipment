// Dedicated test databases only. Never falls back to a business database URL.
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
const require = createRequire(new URL('../apps/asset-service/package.json', import.meta.url));
require('dotenv').config({ path: '.env', quiet: true });
const { requireTestDatabaseUrl } = require('@pbl6/testing');
const base = new URL(requireTestDatabaseUrl('ASSET_TEST_DATABASE_URL'));
const services = ['identity', 'organization', 'asset', 'maintenance', 'workorder', 'notification', 'service-request', 'inventory'];
for (const service of services) {
  const prefix = service.replaceAll('-', '_').toUpperCase();
  const url = new URL(base);
  url.pathname = `/${service.replaceAll('-', '_')}_test_db`;
  const key = `${prefix}_TEST_DATABASE_URL`;
  process.env[key] ??= url.toString();
  process.env[`${prefix}_DATABASE_URL`] = requireTestDatabaseUrl(key);
}
process.env.npm_config_verifyDepsBeforeRun = 'false';
process.env.npm_config_verify_deps_before_run = 'false';
function run(args) {
  const result = spawnSync(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', ['--config.verifyDepsBeforeRun=false', ...args], {
    stdio: 'inherit', env: process.env, shell: process.platform === 'win32',
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
switch (process.argv[2]) {
  case 'migrate':
    for (const service of services) run(['--filter', `${service}-service`, 'db:migrate']);
    break;
  case 'asset-db': run(['--filter', 'asset-service', 'test:db']); break;
  case 'notification-db':
    process.env.RABBITMQ_TEST_URL ??= process.env.RABBITMQ_URL;
    run(['--filter', 'notification-service', 'test:e2e:db']); break;
  case 'rabbitmq':
    process.env.RABBITMQ_TEST_URL ??= process.env.RABBITMQ_URL;
    if (!process.env.RABBITMQ_TEST_URL) throw new Error('Configure RABBITMQ_TEST_URL');
    run(['--filter', '@pbl6/event-contracts', 'test', '--runInBand']); break;
  case 'http': run(['test:e2e']); break;
  default: throw new Error('Expected migrate | asset-db | notification-db | rabbitmq | http');
}

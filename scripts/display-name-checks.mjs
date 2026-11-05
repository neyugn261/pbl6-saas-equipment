// Runs existing regression scripts against dedicated test databases only.
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
const require = createRequire(new URL('../apps/asset-service/package.json', import.meta.url));
require('dotenv').config({ path: '.env', quiet: true });
const { requireTestDatabaseUrl } = require('@pbl6/testing');
const base = new URL(requireTestDatabaseUrl('ASSET_TEST_DATABASE_URL'));
const suites = [
  ['organization', 'test:e2e:db'], ['workorder', 'test:e2e:db'],
  ['service-request', 'test:e2e:db'], ['inventory', 'test:db'], ['asset', 'test:db'],
  ['notification', 'test:e2e:db'],
];
for (const service of [...suites.map(([name]) => name), 'maintenance', 'identity']) {
  const prefix = service.replaceAll('-', '_').toUpperCase();
  const url = new URL(base); url.pathname = `/${service.replaceAll('-', '_')}_test_db`;
  const key = `${prefix}_TEST_DATABASE_URL`;
  process.env[key] ??= url.toString();
  process.env[`${prefix}_DATABASE_URL`] = requireTestDatabaseUrl(key);
}
process.env.RABBITMQ_TEST_URL ??= process.env.RABBITMQ_URL;
for (const [service, script] of suites) {
  if (process.argv.length > 2 && !process.argv.slice(2).includes(service)) continue;
  const result = spawnSync(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
    ['--config.verifyDepsBeforeRun=false', '--filter', `${service}-service`, script],
    { stdio: 'inherit', env: process.env, shell: process.platform === 'win32' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

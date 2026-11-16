/* HU verification only: isolated databases, no demo env edits, no production data. */
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const req = createRequire(path.join(root, 'apps/identity-service/package.json'));
req('dotenv').config({ path: path.join(root, '.env'), quiet: true });
const { Client } = req('pg');
const { requireTestDatabaseUrl } = req('@pbl6/testing');
const localEnv = path.join(root, 'node_modules/.cache/huy-test/environment.json');
if (fs.existsSync(localEnv)) {
  const local = JSON.parse(fs.readFileSync(localEnv, 'utf8').replace(/^\uFEFF/, ''));
  process.env.IDENTITY_TEST_DATABASE_URL = local.databaseUrl;
}
const services = ['identity', 'organization', 'asset', 'service-request', 'workorder', 'maintenance', 'inventory', 'notification'];
const prefix = (name) => name.replaceAll('-', '_').toUpperCase();
const base = new URL(requireTestDatabaseUrl('IDENTITY_TEST_DATABASE_URL'));
const dir = path.join(root, 'docs/testing/artifacts/huy-2026-11-14');
const modes = {
  unit: ['--filter', 'identity-service', '--filter', 'service-request-service', '--filter', 'notification-service', 'test', '--runInBand'],
  lint: ['--filter', 'identity-service', '--filter', 'service-request-service', '--filter', 'notification-service', 'lint'],
  typecheck: ['--filter', 'identity-service', '--filter', 'service-request-service', '--filter', 'notification-service', 'typecheck'],
  'affected-build': ['--filter', 'identity-service', '--filter', 'service-request-service', '--filter', 'notification-service', 'build'],
  identity: ['--filter', 'identity-service', 'test:e2e'],
  sr: ['--filter', 'service-request-service', 'test:e2e:db'],
  notification: ['--filter', 'notification-service', 'test:e2e:db'],
  build: ['demo:build'],
  // Run `build` first. Do not rebuild shared dist while another suite is reading it.
  gateway: ['exec', 'node', 'scripts/test-branch-service-management.cjs'],
  drift: ['--filter', 'identity-service', '--filter', 'service-request-service', '--filter', 'notification-service', 'db:check-drift'],
  mailpit: ['--filter', 'identity-service', 'test:e2e', '--testPathPatterns=mailpit'],
};
async function main() {
  const mode = process.argv[2];
  if (!modes[mode]) throw new Error(`Choose ${Object.keys(modes).join(', ')}`);
  const adminUrl = new URL(base); adminUrl.pathname = '/postgres';
  const admin = new Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  try {
    await admin.query('SELECT pg_advisory_lock(14042026)');
    for (const name of services) {
      for (const kind of ['test', 'shadow']) {
        // Respect the repository's exact-name safety guard; never weaken it.
        const dbName = `${name.replaceAll('-', '_')}_${kind}_db`;
        const found = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
        if (!found.rowCount) await admin.query(`CREATE DATABASE "${dbName}"`);
        const url = new URL(base); url.pathname = '/' + dbName;
        process.env[`${prefix(name)}_${kind.toUpperCase()}_DATABASE_URL`] = url.toString();
        if (kind === 'test') process.env[`${prefix(name)}_DATABASE_URL`] = url.toString();
      }
    }
  } finally { await admin.query('SELECT pg_advisory_unlock(14042026)'); await admin.end(); }
  process.env.RABBITMQ_TEST_URL ||= process.env.RABBITMQ_URL || '';
  if (mode === 'gateway') process.env.HUY_ACCEPTANCE = 'true';
  // Never inherit a real SMTP endpoint into verification.
  for (const key of ['SMTP_HOST', 'SMTP_FROM', 'SMTP_USER', 'SMTP_PASSWORD', 'IDENTITY_ACTIVATION_ENCRYPTION_KEY', 'IDENTITY_ACTIVATION_URL_BASE']) process.env[key] = '';
  if (mode === 'mailpit') Object.assign(process.env, {
    IDENTITY_MAILPIT_SMOKE: '1', SMTP_PORT: '1125', MAILPIT_API_URL: 'http://127.0.0.1:8125',
  });
  if (mode === 'gateway') Object.assign(process.env, {
    IDENTITY_OTP_SECRET: require('node:crypto').randomBytes(32).toString('hex'),
    IDENTITY_ACTIVATION_ENCRYPTION_KEY: require('node:crypto').randomBytes(32).toString('hex'),
    IDENTITY_ACTIVATION_URL_BASE: 'http://localhost:8080/activate#token=',
    SMTP_HOST: '127.0.0.1', SMTP_PORT: '1125', SMTP_FROM: 'PBL6 Test <no-reply@pbl6.local>',
    MAILPIT_API_URL: 'http://127.0.0.1:8125',
  });
  fs.mkdirSync(dir, { recursive: true });
  const startedAt = new Date().toISOString();
  const args = modes[mode];
  const result = process.platform === 'win32'
    ? spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', 'pnpm.cmd ' + args.join(' ')], { cwd: root, env: process.env, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })
    : spawnSync('pnpm', args, { cwd: root, env: process.env, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  const output = (result.stdout || '') + (result.stderr || '');
  // Logs contain no configured secrets; mask URL credentials defensively.
  const safe = output.replace(/(postgres(?:ql)?:\/\/|amqps?:\/\/)[^\s/@]+:[^\s/@]+@/g, '$1[redacted]@');
  fs.writeFileSync(path.join(dir, mode + '.log'), safe);
  fs.writeFileSync(path.join(dir, mode + '.json'), JSON.stringify({ command: 'node scripts/run-huy-verification.cjs ' + mode, delegatedCommand: 'pnpm ' + args.join(' '), startedAt, finishedAt: new Date().toISOString(), exitCode: result.status, error: result.error?.message ?? null, databaseHost: base.hostname, databasePort: base.port, databases: services.map((name) => name.replaceAll('-', '_') + '_test_db'), baseline: '70829ff', workingTree: 'uncommitted HU changes' }, null, 2) + '\n');
  process.stdout.write(safe);
  process.exitCode = result.status ?? 1;
}
main().catch((error) => { console.error(error.message.replace(/(postgres(?:ql)?:\/\/)[^\s/@]+:[^\s/@]+@/g, '$1[redacted]@')); process.exitCode = 1; });

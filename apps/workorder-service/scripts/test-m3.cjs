// Sequential owner regression. DB suites truncate their dedicated test DB;
// never run this concurrently with other users/suites on the same test DB.
const { spawnSync, execFileSync } = require('node:child_process');
const { writeFileSync, mkdirSync, mkdtempSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { resolve, dirname } = require('node:path');
const { config } = require('dotenv');
const { requireTestDatabaseUrl, testJwtEnv } = require('@pbl6/testing');
config({ path: '.env', quiet: true });
config({ path: '../../.env', quiet: true });

function main() {
  const database = requireTestDatabaseUrl('WORKORDER_TEST_DATABASE_URL');
  // Prisma resets this DB when diffing migrations. Guard it as strictly as E2E.
  const shadow = requireTestDatabaseUrl('WORKORDER_SHADOW_TEST_DATABASE_URL');
  const env = {
    ...process.env,
    ...testJwtEnv(),
    NODE_ENV: 'test',
    WORKORDER_DATABASE_URL: database,
    WORKORDER_SHADOW_DATABASE_URL: shadow,
    WORKORDER_ATTACHMENTS_ENABLED: 'false',
    WORKORDER_ATTACHMENT_WORKER_ENABLED: 'false',
    WORKORDER_ATTACHMENT_STORAGE_TEST: 'false',
    RABBITMQ_URL: '',
    IDENTITY_SERVICE_URL: 'http://identity.test',
    ORGANIZATION_SERVICE_URL: 'http://organization.test',
    ASSET_SERVICE_URL: 'http://asset.test',
    SERVICE_REQUEST_SERVICE_URL: 'http://requests.test',
  };
  // Require real storage settings before any DB mutations. No bucket is
  // provisioned here: each MinIO suite/smoke owns a generated private bucket.
  for (const key of [
    'MINIO_ENDPOINT',
    'MINIO_REGION',
    'MINIO_PUBLIC_ENDPOINT',
    'MINIO_ACCESS_KEY',
    'MINIO_SECRET_KEY',
  ])
    if (!env[key])
      throw new Error(`${key} is required for real storage checks`);
  const pnpm = (args) => ({ command: 'pnpm', args });
  const node = (path) => ({ command: process.execPath, args: [path] });
  const wo = (script) => pnpm(['run', script]);
  const steps = [
    ['packages-build', pnpm(['--dir', '../..', 'build:packages'])],
    ['wo-lint', wo('lint')],
    ['wo-typecheck', wo('typecheck')],
    ['wo-unit', wo('test')],
    ['wo-bootstrap', wo('test:e2e')],
    ['migration-deploy-1', wo('db:migrate')],
    ['migration-deploy-2', wo('db:migrate')],
    ['migration-schema-drift', wo('db:check-drift')],
    [
      'database-schema-drift',
      pnpm([
        'exec',
        'prisma',
        'migrate',
        'diff',
        '--from-config-datasource',
        '--to-schema',
        'prisma/schema.prisma',
        '--exit-code',
      ]),
    ],
    ['wo-db-regression', wo('test:e2e:db')],
    ['real-minio-suites', wo('test:attachments:storage')],
    ['gateway-e2e', pnpm(['--filter', 'api-gateway', 'test:e2e'])],
    ['gateway-build', pnpm(['--filter', 'api-gateway', 'build'])],
    ['wo-build', wo('build')],
    ['attachment-gateway-smoke', node('scripts/smoke-attachment-gateway.cjs')],
    ['report-gateway-smoke', node('scripts/smoke-workorder-report.cjs')],
    ['cleanup-process-restart', node('scripts/smoke-attachment-restart.cjs')],
  ];
  const output = process.env.WORKORDER_M3_EVIDENCE_PATH
    ? resolve(process.env.WORKORDER_M3_EVIDENCE_PATH)
    : resolve(
        mkdtempSync(resolve(tmpdir(), 'pbl6-m3-evidence-')),
        'results.json',
      );
  const evidence = {
    task: 'M3-A6',
    startedAt: new Date().toISOString(),
    sourceHead: execFileSync('git', ['rev-parse', 'HEAD'], {
      encoding: 'utf8',
    }).trim(),
    workingTreeDirty: !!execFileSync('git', ['status', '--porcelain'], {
      encoding: 'utf8',
    }).trim(),
    environment: {
      node: process.version,
      testDatabase: 'workorder_test_db',
      shadowDatabase: 'workorder_shadow_test_db',
      storage: 'real S3/MinIO',
      broker: 'disabled; consumer logic covered by DB fixtures',
    },
    steps: [],
    acceptancePending: [
      'Huy C4: real public SR authorization/composition + customer download',
      'Hatsady E2/E3: web upload/customer file/report dashboard',
      'Nguyen D3-D5: deployed storage endpoint and Android acceptance',
      'Team: authenticated Identity + broker + full business demo',
    ],
  };
  mkdirSync(dirname(output), { recursive: true });
  for (const [name, { command, args }] of steps) {
    console.log(
      JSON.stringify({ task: 'M3-A6', step: name, status: 'RUNNING' }),
    );
    const started = Date.now();
    const result = spawnSync(command, args, {
      env,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
    const exitCode = result.status ?? 1;
    evidence.steps.push({
      name,
      status: exitCode === 0 ? 'PASS' : 'FAIL',
      exitCode,
      durationMs: Date.now() - started,
    });
    evidence.finishedAt = new Date().toISOString();
    evidence.status =
      exitCode === 0 && evidence.steps.length === steps.length
        ? 'PASS_OWNER_REGRESSION'
        : 'INCOMPLETE';
    writeFileSync(output, `${JSON.stringify(evidence, null, 2)}\n`, {
      mode: 0o600,
    });
    if (exitCode !== 0) {
      console.error(
        JSON.stringify({
          task: 'M3-A6',
          step: name,
          status: 'FAIL',
          evidence: output,
        }),
      );
      process.exitCode = exitCode;
      return;
    }
  }
  console.log(
    JSON.stringify({
      task: 'M3-A6',
      status: evidence.status,
      passedSteps: steps.length,
      evidence: output,
      acceptancePending: evidence.acceptancePending,
    }),
  );
}
try {
  main();
} catch {
  console.error(
    'M3_REGRESSION_SETUP_FAILED: check guarded test/shadow DB URLs and test MinIO configuration',
  );
  process.exitCode = 1;
}

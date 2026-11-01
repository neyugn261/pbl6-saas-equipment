const { randomUUID } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { config } = require('dotenv');
const { requireTestDatabaseUrl } = require('@pbl6/testing');
config({ path: '.env', quiet: true });
config({ path: '../../.env', quiet: true });
requireTestDatabaseUrl('WORKORDER_TEST_DATABASE_URL');
// Generated bucket owned by this test invocation; the suite never cleans a
// configured application bucket. Actual URLs/credentials never go to stdout.
const env = {
  ...process.env,
  WORKORDER_ATTACHMENT_STORAGE_TEST: 'true',
  WORKORDER_ATTACHMENTS_ENABLED: 'true',
  WORKORDER_ATTACHMENT_WORKER_ENABLED: 'false',
  WORKORDER_ATTACHMENT_BUCKET: `pbl6-wo-test-${randomUUID()}`,
};
const result = spawnSync(
  process.execPath,
  [
    '--experimental-vm-modules',
    '--disable-warning=ExperimentalWarning',
    'node_modules/jest/bin/jest.js',
    '--config',
    'test/db/jest-e2e.json',
    '--runInBand',
    '--runTestsByPath',
    'test/db/attachment-flow.e2e-spec.ts',
    'test/db/published-attachments.e2e-spec.ts',
  ],
  { env, stdio: 'inherit' },
);
process.exitCode = result.status ?? 1;

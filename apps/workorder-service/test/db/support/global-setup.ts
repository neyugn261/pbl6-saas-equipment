import { execFileSync } from 'node:child_process';
import { testDatabaseUrl } from './test-env';
export default function globalSetup() {
  execFileSync(
    process.execPath,
    ['node_modules/prisma/build/index.js', 'migrate', 'deploy'],
    {
      stdio: 'inherit',
      env: { ...process.env, WORKORDER_DATABASE_URL: testDatabaseUrl() },
    },
  );
}

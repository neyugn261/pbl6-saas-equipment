import { execSync } from 'node:child_process';
import { config as loadEnv } from 'dotenv';
import { requireTestDatabaseUrl } from '@pbl6/testing';

/** Apply Maintenance migrations only to a database whose name contains test. */
export default function globalSetup(): void {
  loadEnv({ path: '../../.env', quiet: true });
  const testUrl = requireTestDatabaseUrl('MAINTENANCE_TEST_DATABASE_URL');
  execSync('pnpm exec prisma migrate deploy', {
    stdio: 'inherit',
    env: { ...process.env, MAINTENANCE_DATABASE_URL: testUrl },
  });
}

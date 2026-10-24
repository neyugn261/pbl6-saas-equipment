import { execSync } from 'node:child_process';
import { config as loadEnv } from 'dotenv';
import { requireTestDatabaseUrl } from '@pbl6/testing';

/** Apply Asset migrations to the dedicated test DB before integration tests. */
export default function globalSetup(): void {
  loadEnv({ path: '../../.env', quiet: true });
  const testUrl = requireTestDatabaseUrl('ASSET_TEST_DATABASE_URL');
  execSync('npx prisma migrate deploy', {
    stdio: 'inherit',
    env: { ...process.env, ASSET_DATABASE_URL: testUrl },
  });
}

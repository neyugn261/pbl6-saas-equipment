import { execSync } from 'node:child_process';
import { config } from 'dotenv';
import { requireTestDatabaseUrl } from '@pbl6/testing';
export default function globalSetup() {
  config({ path: '../../.env', quiet: true });
  const url = requireTestDatabaseUrl('INVENTORY_TEST_DATABASE_URL');
  execSync('npx prisma migrate deploy', {
    stdio: 'inherit',
    env: { ...process.env, INVENTORY_DATABASE_URL: url },
  });
}

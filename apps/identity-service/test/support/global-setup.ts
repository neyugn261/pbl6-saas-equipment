import { execSync } from 'node:child_process';
import { testDatabaseUrl } from './test-env';

/** Applies the real migrations (not db push) to the test database once per run. */
export default function globalSetup(): void {
  execSync('npx prisma migrate deploy', {
    stdio: 'inherit',
    env: { ...process.env, IDENTITY_DATABASE_URL: testDatabaseUrl() },
  });
}

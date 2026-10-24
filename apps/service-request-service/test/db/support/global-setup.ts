import { execSync } from 'node:child_process';
import { testDatabaseUrl } from './test-env';

export default function globalSetup(): void {
  execSync('npx prisma migrate deploy', {
    stdio: 'inherit',
    env: {
      ...process.env,
      SERVICE_REQUEST_DATABASE_URL: testDatabaseUrl(),
    },
  });
}

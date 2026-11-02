import { config as loadEnv } from 'dotenv';
// Test-only imports of existing shared build artifacts. Runtime dependencies
// and the workspace lockfile stay unchanged until their owner reviews wiring.
import { requireTestDatabaseUrl } from '../../../../../packages/testing/dist';

loadEnv({ path: '.env', quiet: true });
loadEnv({ path: '../../.env', quiet: true });
export function testDatabaseUrl(): string {
  return requireTestDatabaseUrl('NOTIFICATION_TEST_DATABASE_URL');
}

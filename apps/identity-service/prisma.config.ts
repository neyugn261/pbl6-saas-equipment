import { config as loadEnv } from 'dotenv';
import { defineConfig } from 'prisma/config';

// Prisma 7 does not load .env files itself. Service-local .env wins over the
// monorepo root .env (dotenv never overrides variables that are already set).
loadEnv({ path: '.env', quiet: true });
loadEnv({ path: '../../.env', quiet: true });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    // Not wrapped in env(): `prisma generate` must work without a database URL (CI).
    url: process.env.IDENTITY_DATABASE_URL,
    shadowDatabaseUrl: process.env.IDENTITY_SHADOW_DATABASE_URL,
  },
});

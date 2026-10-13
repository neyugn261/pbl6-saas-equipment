/**
 * Seed entry point, run by `prisma db seed` (see prisma.config.ts).
 *
 *   pnpm db:seed       permission catalog (provisional, idempotent)
 *   pnpm db:seed:dev   + demo tenant and demo accounts (refuses in production)
 */
import { config as loadEnv } from 'dotenv';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { createPrismaAdapter } from '../src/prisma/create-adapter';
import { CATALOG_STATUS } from './seed/permission-catalog';
import { seedDevData } from './seed/seed-dev-data';
import { seedPermissions } from './seed/seed-permissions';

loadEnv({ path: '.env', quiet: true });
loadEnv({ path: '../../.env', quiet: true });

async function main(): Promise<void> {
  const url = process.env.IDENTITY_DATABASE_URL;
  if (!url) {
    throw new Error('IDENTITY_DATABASE_URL is not set');
  }
  const withDevData = process.argv.includes('--dev');
  if (withDevData && process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to seed demo accounts when NODE_ENV=production');
  }
  const demoPassword = process.env.SEED_DEMO_PASSWORD;
  if (withDevData && (!demoPassword || demoPassword.length < 8)) {
    throw new Error(
      'SEED_DEMO_PASSWORD (at least 8 characters) is required for --dev',
    );
  }

  const prisma = new PrismaClient({ adapter: createPrismaAdapter(url) });
  try {
    await seedPermissions(prisma);
    console.log(
      `Seeded permission catalog (${CATALOG_STATUS}, not approved yet).`,
    );
    if (withDevData) {
      await seedDevData(prisma, demoPassword!);
      console.log('Seeded demo tenant DEMO and demo accounts.');
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});

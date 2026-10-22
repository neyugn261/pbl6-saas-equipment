/**
 * Development data, run by `prisma db seed` (see prisma.config.ts):
 *
 *   pnpm db:seed:dev   tenant DEMO, branches, customers, sites, locations,
 *                      contacts; with Identity running and seeded, also the
 *                      customer memberships and branch staff of its demo accounts
 *
 * Refuses when NODE_ENV=production. Ids: docs/api/fixtures.md.
 */
import { config as loadEnv } from 'dotenv';
import { createPrismaAdapter } from '@pbl6/service-kit/prisma';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { DEMO_EMAILS, DEMO_TENANT, seedDemoData } from './seed/demo-data';
import { lookUpDemoUsers } from './seed/demo-users';

loadEnv({ path: '.env', quiet: true });
loadEnv({ path: '../../.env', quiet: true });

async function main(): Promise<void> {
  const url = process.env.ORGANIZATION_DATABASE_URL;
  if (!url) {
    throw new Error('ORGANIZATION_DATABASE_URL is not set');
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to seed demo data when NODE_ENV=production');
  }
  const userIds = await lookUpDemoUsers(
    process.env.IDENTITY_SERVICE_URL,
    process.env.SEED_DEMO_PASSWORD,
    DEMO_TENANT.code,
    DEMO_EMAILS,
  );
  const prisma = new PrismaClient({ adapter: createPrismaAdapter(url) });
  try {
    const summary = await seedDemoData(prisma, userIds);
    console.log(
      `Seeded tenant DEMO, 2 branches, 2 customers, 3 sites, 4 locations, 2 contacts; ` +
        `${summary.memberships} memberships and ${summary.branchStaff} branch staff linked.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});

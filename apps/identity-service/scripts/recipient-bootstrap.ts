/** Resumable, tenant-scoped bootstrap of Notification's Identity projection. */
import { randomUUID } from 'node:crypto';
import { config as loadEnv } from 'dotenv';
import { Events, enqueueEvent } from '@pbl6/event-contracts';
import { createPrismaAdapter } from '@pbl6/service-kit/prisma';
import { PrismaClient } from '../src/generated/prisma/client.js';
import {
  enqueueRecipientSnapshot,
  lockRecipient,
} from '../src/events/recipient-snapshots';

loadEnv({ path: '.env', quiet: true });
loadEnv({ path: '../../.env', quiet: true });

const tenantId = process.argv[2];
if (
  !tenantId ||
  !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    tenantId,
  )
) {
  throw new Error('Usage: pnpm recipient:bootstrap <tenant-uuid> [--new]');
}
const databaseUrl = process.env.IDENTITY_DATABASE_URL;
if (!databaseUrl) throw new Error('IDENTITY_DATABASE_URL is required');
const prisma = new PrismaClient({ adapter: createPrismaAdapter(databaseUrl) });

async function main(): Promise<void> {
  const run = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1::int AS locked FROM pg_advisory_xact_lock(hashtext(${tenantId}))`;
    const tenant = await tx.tenantDirectory.findUnique({ where: { tenantId } });
    if (!tenant) throw new Error('Tenant is not present in Identity directory');
    if (process.argv.includes('--new')) {
      const active = await tx.recipientBootstrapRun.findFirst({
        where: { tenantId, status: 'RUNNING' },
      });
      if (active)
        throw new Error(`Bootstrap run ${active.id} is already RUNNING`);
    }
    const existing = process.argv.includes('--new')
      ? null
      : await tx.recipientBootstrapRun.findFirst({
          where: { tenantId },
          orderBy: { startedAt: 'desc' },
        });
    if (existing) {
      if (existing.status === 'FAILED') {
        await tx.recipientBootstrapRun.update({
          where: { id: existing.id },
          data: { status: 'RUNNING' },
        });
      }
      return existing;
    }
    const id = randomUUID();
    const users = await tx.user.findMany({
      where: { tenantId, userType: { in: ['TENANT_STAFF', 'CUSTOMER'] } },
      select: { id: true },
    });
    const created = await tx.recipientBootstrapRun.create({
      data: { id, tenantId, expectedUsers: users.length },
    });
    await tx.recipientBootstrapUser.createMany({
      data: users.map((user) => ({ runId: id, userId: user.id })),
    });
    return created;
  });
  console.log(`Bootstrap run ${run.id}: ${run.expectedUsers} recipients`);
  if (run.status === 'COMPLETED') {
    console.log(
      `Bootstrap run ${run.id}: already COMPLETED (use --new to recapture)`,
    );
    return;
  }
  try {
    for (;;) {
      const pending = await prisma.recipientBootstrapUser.findFirst({
        where: { runId: run.id, enqueuedAt: null },
        orderBy: { userId: 'asc' },
      });
      if (!pending) break;
      await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM recipient_bootstrap_runs WHERE id = ${run.id}::uuid FOR UPDATE`;
        const item = await tx.recipientBootstrapUser.findUniqueOrThrow({
          where: { runId_userId: { runId: run.id, userId: pending.userId } },
        });
        if (item.enqueuedAt) return;
        await lockRecipient(tx, item.userId);
        await enqueueRecipientSnapshot(tx, item.userId, run.id);
        await tx.recipientBootstrapUser.update({
          where: { runId_userId: { runId: run.id, userId: item.userId } },
          data: { enqueuedAt: new Date() },
        });
        await tx.recipientBootstrapRun.update({
          where: { id: run.id },
          data: { enqueuedUsers: { increment: 1 } },
        });
      });
    }
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM recipient_bootstrap_runs WHERE id = ${run.id}::uuid FOR UPDATE`;
      const current = await tx.recipientBootstrapRun.findUniqueOrThrow({
        where: { id: run.id },
      });
      if (current.status === 'COMPLETED') return;
      if (current.enqueuedUsers !== current.expectedUsers) {
        throw new Error('Bootstrap recipient count mismatch');
      }
      const completedAt = new Date();
      await enqueueEvent(tx, Events.NotificationRecipientBootstrapCompleted, {
        tenantId,
        aggregateId: run.id,
        payload: {
          bootstrapRunId: run.id,
          expectedUsers: current.expectedUsers,
          startedAt: current.startedAt.toISOString(),
          completedAt: completedAt.toISOString(),
        },
      });
      await tx.recipientBootstrapRun.update({
        where: { id: run.id },
        data: { status: 'COMPLETED', completedAt },
      });
    });
    console.log(`Bootstrap run ${run.id}: COMPLETED`);
  } catch (error) {
    await prisma.recipientBootstrapRun.updateMany({
      where: { id: run.id, status: 'RUNNING' },
      data: { status: 'FAILED' },
    });
    throw error;
  }
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

import { Events, enqueueEvent } from '@pbl6/event-contracts';
import { getCorrelationId } from '@pbl6/service-kit';
import type { Prisma } from '../generated/prisma/client.js';

type Tx = Prisma.TransactionClient;

/** Serialize all recipient changes for a user before changing roles/link/status. */
export async function lockRecipient(tx: Tx, userId: string): Promise<void> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
  if (rows.length !== 1) throw new Error('Recipient user no longer exists');
}

/** Call after the business mutation, inside the same Identity transaction. */
export async function enqueueRecipientSnapshot(
  tx: Tx,
  userId: string,
  bootstrapRunId: string | null = null,
): Promise<void> {
  const user = await tx.user.update({
    where: { id: userId },
    data: { recipientRevision: { increment: 1 } },
    include: {
      roles: { include: { role: { select: { code: true } } } },
      customerLink: true,
    },
  });
  // M3 business notifications have no platform audience or tenant-null row.
  if (user.userType === 'PLATFORM_STAFF') return;
  if (!user.tenantId) throw new Error('Tenant recipient has no tenantId');
  const link = user.userType === 'CUSTOMER' ? user.customerLink : null;
  await enqueueEvent(tx, Events.NotificationRecipientSnapshot, {
    tenantId: user.tenantId,
    aggregateId: user.id,
    payload: {
      userId: user.id,
      userType: user.userType as 'TENANT_STAFF' | 'CUSTOMER',
      accountStatus: user.status as
        'INVITED' | 'ACTIVE' | 'SUSPENDED' | 'DISABLED',
      roles: [...new Set(user.roles.map((item) => item.role.code))].sort(),
      customerMembership: link
        ? {
            membershipId: link.membershipId,
            customerId: link.customerId,
            status: link.status as 'ACTIVE' | 'INACTIVE',
            sourceChangedAt: link.sourceChangedAt.toISOString(),
          }
        : null,
      revision: user.recipientRevision.toString(),
      bootstrapRunId,
    },
    correlationId: getCorrelationId(),
  });
}

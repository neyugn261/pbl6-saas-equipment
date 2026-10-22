import { enqueueEvent, Events } from '@pbl6/event-contracts';
import { getCorrelationId } from '@pbl6/service-kit';
import type { ActiveStatus } from '../common/validation';
import type {
  CustomerUserMembership,
  Prisma,
} from '../generated/prisma/client.js';

/**
 * Writes `CustomerMembershipChanged` for the membership as it now stands, in
 * the caller's transaction. Identity turns it into the `customer_id` claim
 * (ADR 0003) and ignores an event older than the last one it applied.
 */
export async function enqueueMembershipChanged(
  tx: Prisma.TransactionClient,
  membership: CustomerUserMembership,
): Promise<void> {
  await enqueueEvent(tx, Events.CustomerMembershipChanged, {
    tenantId: membership.tenantId,
    aggregateId: membership.id,
    payload: {
      membershipId: membership.id,
      userId: membership.userId,
      customerId: membership.customerId,
      status: membership.status as ActiveStatus,
      changedAt: membership.updatedAt.toISOString(),
    },
    correlationId: getCorrelationId(),
  });
}

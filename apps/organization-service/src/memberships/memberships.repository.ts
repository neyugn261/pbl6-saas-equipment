import { Injectable } from '@nestjs/common';
import type { ActiveStatus } from '../common/validation';
import { CustomerUserMembership } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service';
import { enqueueMembershipChanged } from './membership-events';

export type LinkOutcome =
  | { result: 'linked' | 'unchanged'; membership: CustomerUserMembership }
  | { result: 'linked-to-other-customer' };

/**
 * Customer memberships (`customer_user_memberships`). Every change writes
 * `CustomerMembershipChanged` in the same transaction; Identity turns it into
 * the `customer_id` claim (ADR 0003).
 */
@Injectable()
export class MembershipsRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(tenantId: string, customerId: string): Promise<CustomerUserMembership[]> {
    return this.prisma.customerUserMembership.findMany({
      where: { tenantId, customerId },
      orderBy: { createdAt: 'asc' },
    });
  }

  find(tenantId: string, id: string): Promise<CustomerUserMembership | null> {
    return this.prisma.customerUserMembership.findFirst({ where: { id, tenantId } });
  }

  /**
   * Links the account to the customer. An account has one membership
   * (`user_id` unique): an existing one is re-activated, or moved when
   * `allowMove`; otherwise a link to another customer is reported.
   */
  link(
    tenantId: string,
    customerId: string,
    userId: string,
    allowMove: boolean,
  ): Promise<LinkOutcome> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM customer_user_memberships WHERE user_id = ${userId}::uuid FOR UPDATE`;
      const existing = await tx.customerUserMembership.findUnique({ where: { userId } });
      if (!existing) {
        const created = await tx.customerUserMembership.create({
          data: { tenantId, customerId, userId },
        });
        await enqueueMembershipChanged(tx, created);
        return { result: 'linked', membership: created };
      }
      const sameCustomer = existing.customerId === customerId;
      if (sameCustomer && existing.status === 'ACTIVE') {
        return { result: 'unchanged', membership: existing };
      }
      if (!sameCustomer && (!allowMove || existing.tenantId !== tenantId)) {
        return { result: 'linked-to-other-customer' };
      }
      const updated = await tx.customerUserMembership.update({
        where: { id: existing.id },
        data: { customerId, status: 'ACTIVE' },
      });
      await enqueueMembershipChanged(tx, updated);
      return { result: 'linked', membership: updated };
    });
  }

  /** Null when the membership already has `status`. */
  changeStatus(id: string, status: ActiveStatus): Promise<CustomerUserMembership | null> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM customer_user_memberships WHERE id = ${id}::uuid FOR UPDATE`;
      const current = await tx.customerUserMembership.findUniqueOrThrow({ where: { id } });
      if (current.status === status) return null;
      const updated = await tx.customerUserMembership.update({
        where: { id },
        data: { status },
      });
      await enqueueMembershipChanged(tx, updated);
      return updated;
    });
  }
}

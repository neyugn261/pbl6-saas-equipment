import { Injectable } from '@nestjs/common';
import {
  type EnvelopeOf,
  type EventEnvelope,
  Events,
  type InboxResult,
  isEvent,
  processOnce,
} from '@pbl6/event-contracts';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service';

/** Inbox consumer name and broker queue of the directory read models. */
export const DIRECTORY_CONSUMER = 'identity-service.directory';

/** Event versions this consumer understands (bound on the broker). */
export const DIRECTORY_EVENTS = [
  Events.TenantCreated,
  Events.TenantStatusChanged,
  Events.CustomerMembershipChanged,
] as const;

type Tx = Prisma.TransactionClient;

/**
 * Keeps Identity's local read models in sync with Organization Service:
 * - `tenant_directory` (ADR 0001): tenant code + status used at login;
 * - `user_customer_links` (ADR 0003): customer of each CUSTOMER account,
 *   source of the `customer_id` token claim.
 *
 * Idempotent (inbox) and order-safe: a change older than the stored one
 * (`synced_at` / `source_changed_at`) is ignored, so a late redelivery can
 * never undo a newer change.
 */
@Injectable()
export class DirectoryEventHandler {
  constructor(private readonly prisma: PrismaService) {}

  handle(envelope: EventEnvelope): Promise<InboxResult> {
    return processOnce<Tx>(
      this.prisma,
      {
        eventId: envelope.eventId,
        eventType: envelope.eventType,
        consumer: DIRECTORY_CONSUMER,
      },
      async (tx) => {
        if (isEvent(envelope, Events.TenantCreated)) {
          await this.upsertTenant(tx, envelope.payload, envelope.occurredAt);
        } else if (isEvent(envelope, Events.TenantStatusChanged)) {
          await this.upsertTenant(tx, envelope.payload, envelope.payload.changedAt);
        } else if (isEvent(envelope, Events.CustomerMembershipChanged)) {
          await this.upsertCustomerLink(tx, envelope);
        } else {
          throw new Error(
            `${DIRECTORY_CONSUMER} does not handle ${envelope.eventType} v${envelope.eventVersion}`,
          );
        }
      },
    );
  }

  private async upsertTenant(
    tx: Tx,
    tenant: { tenantId: string; code: string; status: string },
    changedAt: string,
  ): Promise<void> {
    await tx.$executeRawUnsafe(
      `INSERT INTO tenant_directory (tenant_id, code, status, synced_at)
       VALUES ($1::uuid, $2, $3, $4::timestamptz)
       ON CONFLICT (tenant_id) DO UPDATE
          SET code = EXCLUDED.code, status = EXCLUDED.status, synced_at = EXCLUDED.synced_at
        WHERE tenant_directory.synced_at <= EXCLUDED.synced_at`,
      tenant.tenantId,
      tenant.code,
      tenant.status,
      changedAt,
    );
  }

  private async upsertCustomerLink(
    tx: Tx,
    envelope: EnvelopeOf<typeof Events.CustomerMembershipChanged>,
  ): Promise<void> {
    if (envelope.tenantId === null) {
      throw new Error('CustomerMembershipChanged must carry a tenantId');
    }
    const membership = envelope.payload;
    // The trigger trg_user_customer_links_guard rejects a non-CUSTOMER account
    // or another tenant; the error makes the broker retry, then dead-letter.
    await tx.$executeRawUnsafe(
      `INSERT INTO user_customer_links
          (user_id, tenant_id, customer_id, membership_id, status, source_changed_at)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6::timestamptz)
       ON CONFLICT (user_id) DO UPDATE
          SET tenant_id = EXCLUDED.tenant_id,
              customer_id = EXCLUDED.customer_id,
              membership_id = EXCLUDED.membership_id,
              status = EXCLUDED.status,
              source_changed_at = EXCLUDED.source_changed_at,
              synced_at = now()
        WHERE user_customer_links.source_changed_at < EXCLUDED.source_changed_at`,
      membership.userId,
      envelope.tenantId,
      membership.customerId,
      membership.membershipId,
      membership.status,
      membership.changedAt,
    );
  }
}

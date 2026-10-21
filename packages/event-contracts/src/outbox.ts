import { randomUUID } from 'node:crypto';
import { type EventDefinition, type PayloadOf, payloadProblems } from './catalog';
import { InvalidEventError } from './envelope';
import type { SqlExecutor } from './sql';

export interface NewOutboxEvent<D extends EventDefinition> {
  /** NULL only for platform-level events. */
  tenantId: string | null;
  aggregateId: string;
  payload: PayloadOf<D>;
  /** Correlation id of the request that caused the change (service-kit `getCorrelationId()`). */
  correlationId?: string | null;
}

/**
 * Shape stored in `outbox_events.payload`: the event payload plus envelope
 * metadata that has no column of its own (ADR 0005).
 */
export interface StoredOutboxPayload {
  data: unknown;
  meta: { correlationId: string | null };
}

/**
 * Writes an event to `outbox_events` inside the caller's transaction, so the
 * event exists if and only if the business change was committed:
 *
 * ```ts
 * await prisma.$transaction(async (tx) => {
 *   const tenant = await tx.tenant.create({ data });
 *   await enqueueEvent(tx, Events.TenantCreated, {
 *     tenantId: tenant.id, aggregateId: tenant.id,
 *     payload: { tenantId: tenant.id, code, name, status: 'ACTIVE' },
 *     correlationId: getCorrelationId(),
 *   });
 * });
 * ```
 *
 * Returns the event id. Throws `InvalidEventError` for a payload that breaks
 * the catalog contract (the transaction then rolls back).
 */
export async function enqueueEvent<D extends EventDefinition>(
  tx: SqlExecutor,
  definition: D,
  event: NewOutboxEvent<D>,
): Promise<string> {
  const problems = payloadProblems(definition, event.payload);
  if (problems.length > 0) {
    throw new InvalidEventError(problems);
  }
  const id = randomUUID();
  const stored: StoredOutboxPayload = {
    data: event.payload,
    meta: { correlationId: event.correlationId ?? null },
  };
  await tx.$executeRawUnsafe(
    `INSERT INTO outbox_events
       (id, tenant_id, aggregate_type, aggregate_id, event_type, event_version, payload)
     VALUES ($1::uuid, $2::uuid, $3, $4::uuid, $5, $6, $7::jsonb)`,
    id,
    event.tenantId,
    definition.aggregateType,
    event.aggregateId,
    definition.type,
    definition.version,
    JSON.stringify(stored),
  );
  return id;
}

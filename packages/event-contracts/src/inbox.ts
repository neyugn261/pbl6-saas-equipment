import type { SqlExecutor, TransactionalSql } from './sql';

export interface InboxEntry {
  eventId: string;
  eventType: string;
  /** Name of the consuming handler, e.g. `identity-service.tenant-directory`. */
  consumer: string;
}

export type InboxResult = 'processed' | 'duplicate';

/**
 * Runs `handler` at most once per (eventId, consumer): the row in
 * `processed_events` and the handler's writes commit in ONE transaction, so a
 * redelivered event is skipped and a failed handler leaves no inbox row (the
 * event is retried).
 *
 * ```ts
 * await processOnce(prisma, { eventId, eventType, consumer }, async (tx) => {
 *   await tx.tenantDirectory.upsert(...);
 * });
 * ```
 */
export async function processOnce<Tx extends SqlExecutor>(
  db: TransactionalSql<Tx>,
  entry: InboxEntry,
  handler: (tx: Tx) => Promise<void>,
): Promise<InboxResult> {
  return db.$transaction(async (tx) => {
    const inserted = await tx.$executeRawUnsafe(
      `INSERT INTO processed_events (event_id, consumer, event_type)
       VALUES ($1::uuid, $2, $3)
       ON CONFLICT (event_id, consumer) DO NOTHING`,
      entry.eventId,
      entry.consumer,
      entry.eventType,
    );
    if (inserted === 0) {
      return 'duplicate';
    }
    await handler(tx);
    return 'processed';
  });
}

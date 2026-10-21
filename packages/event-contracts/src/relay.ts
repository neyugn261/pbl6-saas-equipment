import type { EventEnvelope } from './envelope';
import type { StoredOutboxPayload } from './outbox';
import { backoffDelay, type RetryPolicy } from './retry';
import type { SqlExecutor, TransactionalSql } from './sql';

/** Sends one envelope to the broker; resolves once the broker confirmed it. */
export interface EventPublisher {
  publish(envelope: EventEnvelope): Promise<void>;
  /**
   * False while the broker is unreachable: the relay then skips its run
   * instead of spending the rows' retry attempts on a known outage.
   */
  isReady?(): boolean;
}

export interface LoggerLike {
  log(message: unknown, ...optional: unknown[]): void;
  warn(message: unknown, ...optional: unknown[]): void;
  error(message: unknown, ...optional: unknown[]): void;
}

export interface OutboxRelayOptions {
  db: TransactionalSql;
  publisher: EventPublisher;
  /** Service name written into every envelope, e.g. `organization-service`. */
  producer: string;
  batchSize?: number;
  pollIntervalMs?: number;
  /** After this many failed publishes the row becomes FAILED (default 10). */
  maxAttempts?: number;
  baseRetryDelayMs?: number;
  maxRetryDelayMs?: number;
  logger?: LoggerLike;
}

interface OutboxRow {
  id: string;
  tenant_id: string | null;
  aggregate_type: string;
  aggregate_id: string;
  event_type: string;
  event_version: number;
  payload: StoredOutboxPayload;
  attempt_count: number;
  occurred_at: Date;
}

export interface RelayRunResult {
  published: number;
  failed: number;
}

const silent: LoggerLike = { log: () => {}, warn: () => {}, error: () => {} };

/** Builds the broker envelope of a stored outbox row. */
export function envelopeFromRow(row: OutboxRow, producer: string): EventEnvelope {
  return {
    eventId: row.id,
    eventType: row.event_type,
    eventVersion: Number(row.event_version),
    producer,
    tenantId: row.tenant_id,
    aggregateType: row.aggregate_type,
    aggregateId: row.aggregate_id,
    occurredAt: new Date(row.occurred_at).toISOString(),
    correlationId: row.payload?.meta?.correlationId ?? null,
    payload: row.payload?.data,
  };
}

/**
 * Publishes PENDING rows of `outbox_events` (at-least-once):
 * - rows are locked with `FOR UPDATE SKIP LOCKED`, so several instances of a
 *   service never publish the same row at the same time;
 * - a failed publish increases `attempt_count`, records `last_error` and moves
 *   `available_at` forward with exponential backoff; after `maxAttempts` the
 *   row becomes FAILED and needs an operator (see docs/architecture/events.md);
 * - a crash after the broker confirmed but before commit republishes the row,
 *   which is why every consumer is idempotent (inbox).
 */
export class OutboxRelay {
  private readonly batchSize: number;
  private readonly pollIntervalMs: number;
  private readonly policy: RetryPolicy;
  private readonly logger: LoggerLike;
  private timer: NodeJS.Timeout | undefined;
  private running: Promise<unknown> | undefined;
  private stopped = true;

  constructor(private readonly options: OutboxRelayOptions) {
    this.batchSize = options.batchSize ?? 50;
    this.pollIntervalMs = options.pollIntervalMs ?? 1000;
    this.policy = {
      maxAttempts: options.maxAttempts ?? 10,
      baseDelayMs: options.baseRetryDelayMs ?? 1000,
      maxDelayMs: options.maxRetryDelayMs ?? 5 * 60 * 1000,
    };
    this.logger = options.logger ?? silent;
  }

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.schedule(0);
  }

  async stop(): Promise<void> {
    this.stopped = true;
    clearTimeout(this.timer);
    await this.running;
  }

  /** Publishes one batch. Exposed for tests and for a manual "flush". */
  async runOnce(): Promise<RelayRunResult> {
    if (this.options.publisher.isReady && !this.options.publisher.isReady()) {
      return { published: 0, failed: 0 };
    }
    return this.options.db.$transaction(
      async (tx) => {
        const rows = await tx.$queryRawUnsafe<OutboxRow[]>(
          `SELECT id, tenant_id, aggregate_type, aggregate_id, event_type,
                  event_version, payload, attempt_count, occurred_at
             FROM outbox_events
            WHERE status = 'PENDING' AND available_at <= now()
            ORDER BY occurred_at, id
            LIMIT $1
              FOR UPDATE SKIP LOCKED`,
          this.batchSize,
        );
        const result: RelayRunResult = { published: 0, failed: 0 };
        for (const row of rows) {
          try {
            await this.options.publisher.publish(
              envelopeFromRow(row, this.options.producer),
            );
            await this.markPublished(tx, row.id);
            result.published += 1;
          } catch (error) {
            await this.markFailed(tx, row, error);
            result.failed += 1;
          }
        }
        return result;
      },
      { timeout: 60_000, maxWait: 10_000 },
    );
  }

  private schedule(delayMs: number): void {
    if (this.stopped) return;
    this.timer = setTimeout(() => {
      this.running = this.runOnce()
        .then((result) => {
          // A full batch means more rows are probably waiting.
          const full = result.published + result.failed >= this.batchSize;
          this.schedule(full ? 0 : this.pollIntervalMs);
        })
        .catch((error: unknown) => {
          this.logger.error(
            { msg: 'Outbox relay run failed', producer: this.options.producer },
            error instanceof Error ? error.stack : String(error),
            OutboxRelay.name,
          );
          this.schedule(this.pollIntervalMs * 5);
        });
    }, delayMs);
  }

  private async markPublished(tx: SqlExecutor, id: string): Promise<void> {
    await tx.$executeRawUnsafe(
      `UPDATE outbox_events
          SET status = 'PUBLISHED', published_at = now(), last_error = NULL
        WHERE id = $1::uuid`,
      id,
    );
  }

  private async markFailed(tx: SqlExecutor, row: OutboxRow, error: unknown): Promise<void> {
    const attempts = Number(row.attempt_count) + 1;
    const message = (error instanceof Error ? error.message : String(error)).slice(0, 1000);
    if (attempts >= this.policy.maxAttempts) {
      this.logger.error(
        { msg: 'Outbox event gave up after max attempts', eventId: row.id, eventType: row.event_type, attempts },
        undefined,
        OutboxRelay.name,
      );
      await tx.$executeRawUnsafe(
        `UPDATE outbox_events
            SET status = 'FAILED', attempt_count = $2, last_error = $3
          WHERE id = $1::uuid`,
        row.id,
        attempts,
        message,
      );
      return;
    }
    this.logger.warn(
      { msg: 'Outbox publish failed, will retry', eventId: row.id, eventType: row.event_type, attempts },
      OutboxRelay.name,
    );
    await tx.$executeRawUnsafe(
      `UPDATE outbox_events
          SET attempt_count = $2, last_error = $3,
              available_at = now() + make_interval(secs => $4::double precision)
        WHERE id = $1::uuid`,
      row.id,
      attempts,
      message,
      backoffDelay(attempts, this.policy) / 1000,
    );
  }
}

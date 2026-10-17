import { Events } from './catalog';
import { InvalidEventError } from './envelope';
import { FakeSql } from './fake-sql.spec-helper';
import { processOnce } from './inbox';
import { enqueueEvent } from './outbox';
import { envelopeFromRow, type EventPublisher, OutboxRelay } from './relay';
import { backoffDelay, decideOnFailure } from './retry';

const TENANT = '11111111-1111-4111-8111-111111111111';
const payload = { tenantId: TENANT, code: 'ACME', name: 'Acme', status: 'ACTIVE' as const };

describe('enqueueEvent', () => {
  it('inserts the event with its contract metadata and correlation id', async () => {
    const sql = new FakeSql();
    const id = await enqueueEvent(sql, Events.TenantCreated, {
      tenantId: TENANT,
      aggregateId: TENANT,
      payload,
      correlationId: 'corr-1',
    });
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(sql.calls[0].query).toContain('INSERT INTO outbox_events');
    expect(sql.calls[0].values).toEqual([
      id,
      TENANT,
      'Tenant',
      TENANT,
      'TenantCreated',
      1,
      JSON.stringify({ data: payload, meta: { correlationId: 'corr-1' } }),
    ]);
  });

  it('refuses a payload that breaks the contract', async () => {
    const sql = new FakeSql();
    await expect(
      enqueueEvent(sql, Events.TenantCreated, {
        tenantId: TENANT,
        aggregateId: TENANT,
        payload: { ...payload, status: 'GONE' as never },
      }),
    ).rejects.toBeInstanceOf(InvalidEventError);
    expect(sql.calls).toHaveLength(0);
  });
});

function row(id: string, attempts = 0) {
  return {
    id,
    tenant_id: TENANT,
    aggregate_type: 'Tenant',
    aggregate_id: TENANT,
    event_type: 'TenantCreated',
    event_version: 1,
    payload: { data: payload, meta: { correlationId: 'corr-1' } },
    attempt_count: attempts,
    occurred_at: new Date('2026-10-17T03:00:00Z'),
  };
}

describe('OutboxRelay', () => {
  it('builds envelopes from stored rows', () => {
    expect(envelopeFromRow(row('a'), 'organization-service')).toEqual({
      eventId: 'a',
      eventType: 'TenantCreated',
      eventVersion: 1,
      producer: 'organization-service',
      tenantId: TENANT,
      aggregateType: 'Tenant',
      aggregateId: TENANT,
      occurredAt: '2026-10-17T03:00:00.000Z',
      correlationId: 'corr-1',
      payload,
    });
  });

  it('marks published rows and backs off failed ones', async () => {
    const sql = new FakeSql();
    sql.rows = [row('ok'), row('bad', 2)];
    const publisher: EventPublisher = {
      publish: async (envelope) => {
        if (envelope.eventId === 'bad') throw new Error('broker said no');
      },
    };
    const relay = new OutboxRelay({ db: sql, publisher, producer: 'organization-service', baseRetryDelayMs: 1000 });
    await expect(relay.runOnce()).resolves.toEqual({ published: 1, failed: 1 });
    expect(sql.calls[0].query).toContain('FOR UPDATE SKIP LOCKED');
    const published = sql.calls.find((c) => c.query.includes("status = 'PUBLISHED'"));
    expect(published?.values).toEqual(['ok']);
    const retried = sql.calls.find((c) => c.query.includes('make_interval'));
    // Third failure: 1 s × 2² = 4 s.
    expect(retried?.values).toEqual(['bad', 3, 'broker said no', 4]);
  });

  it('gives up after maxAttempts', async () => {
    const sql = new FakeSql();
    sql.rows = [row('bad', 9)];
    const relay = new OutboxRelay({
      db: sql,
      publisher: { publish: async () => Promise.reject(new Error('down')) },
      producer: 'p',
      maxAttempts: 10,
    });
    await relay.runOnce();
    expect(sql.calls.some((c) => c.query.includes("status = 'FAILED'"))).toBe(true);
  });

  it('does not touch rows while the broker is not ready', async () => {
    const sql = new FakeSql();
    sql.rows = [row('a')];
    const relay = new OutboxRelay({
      db: sql,
      publisher: { publish: async () => {}, isReady: () => false },
      producer: 'p',
    });
    await expect(relay.runOnce()).resolves.toEqual({ published: 0, failed: 0 });
    expect(sql.transactions).toBe(0);
  });
});

describe('processOnce', () => {
  it('runs the handler for a new event and skips a duplicate', async () => {
    const sql = new FakeSql();
    let runs = 0;
    const entry = { eventId: TENANT, eventType: 'TenantCreated', consumer: 'identity-service.directory' };
    await expect(processOnce(sql, entry, async () => void (runs += 1))).resolves.toBe('processed');
    expect(sql.calls[0].query).toContain('ON CONFLICT (event_id, consumer) DO NOTHING');
    sql.executeResult = 0;
    await expect(processOnce(sql, entry, async () => void (runs += 1))).resolves.toBe('duplicate');
    expect(runs).toBe(1);
  });

  it('propagates handler errors so the transaction rolls back', async () => {
    const sql = new FakeSql();
    await expect(
      processOnce(sql, { eventId: TENANT, eventType: 'x', consumer: 'c' }, async () => {
        throw new Error('handler failed');
      }),
    ).rejects.toThrow('handler failed');
  });
});

describe('retry policy', () => {
  const policy = { maxAttempts: 4, baseDelayMs: 1000, maxDelayMs: 5000 };

  it('doubles the delay up to the cap', () => {
    expect([1, 2, 3, 4, 5].map((attempt) => backoffDelay(attempt, policy))).toEqual([
      1000, 2000, 4000, 5000, 5000,
    ]);
  });

  it('gives up on the last attempt', () => {
    expect(decideOnFailure(1, policy)).toEqual({ action: 'retry', delayMs: 1000, nextAttempt: 2 });
    expect(decideOnFailure(4, policy)).toEqual({ action: 'give-up' });
  });
});

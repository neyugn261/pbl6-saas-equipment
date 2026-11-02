import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, Prisma } from '../../src/generated/prisma/client';
import { processOnce } from '../../../../packages/event-contracts/dist';
import { testDatabaseUrl } from './support/test-env';

// Tests only the accepted schema and shared inbox. Recipients here are random
// fixtures, not a runtime recipient-selection or customer-access policy.
describe('Notification schema/inbox (notification_test_db)', () => {
  let db: PrismaClient;
  let verified = false;
  const tenants = [randomUUID(), randomUUID()];
  const users = [randomUUID(), randomUUID()];
  const consumers: string[] = [];
  const entry = () => {
    const consumer = `notification.test.${randomUUID()}`;
    consumers.push(consumer);
    return {
      eventId: randomUUID(),
      consumer,
      eventType: 'ServiceRequestCreated.v1',
    };
  };
  const row = (eventId: string, userId = users[0], channel = 'IN_APP') => ({
    tenantId: tenants[0],
    userId,
    sourceEventId: eventId,
    type: 'ServiceRequestCreated.v1',
    title: 'Test-only notification',
    content: 'No credentials or customer data',
    channel,
    status: 'PENDING',
  });
  beforeAll(async () => {
    db = new PrismaClient({
      adapter: new PrismaPg({ connectionString: testDatabaseUrl() }),
    });
    await db.$connect();
    const [actual] = await db.$queryRawUnsafe<Array<{ name: string }>>(
      'SELECT current_database() AS name',
    );
    if (actual?.name !== 'notification_test_db')
      throw new Error('Unsafe database');
    verified = true;
  });
  afterAll(async () => {
    if (!db) return;
    try {
      // Only remove this suite's UUID fixtures; never truncate shared tables.
      if (verified) {
        await db.notification.deleteMany({
          where: { tenantId: { in: tenants }, userId: { in: users } },
        });
        await db.processedEvent.deleteMany({
          where: { consumer: { in: consumers } },
        });
      }
    } finally {
      await db.$disconnect();
    }
  });
  it('commits notification and inbox once; redelivery is a no-op', async () => {
    const event = entry();
    const handle = jest.fn(async (tx: Prisma.TransactionClient) => {
      await tx.notification.create({ data: row(event.eventId) });
    });
    expect(await processOnce(db, event, handle)).toBe('processed');
    expect(await processOnce(db, event, handle)).toBe('duplicate');
    expect(handle).toHaveBeenCalledTimes(1);
    expect(
      await db.notification.count({ where: { sourceEventId: event.eventId } }),
    ).toBe(1);
  });
  it('rolls back both inbox and notification when processing fails, then permits retry', async () => {
    const event = entry();
    await expect(
      processOnce(db, event, async (tx) => {
        await tx.notification.create({ data: row(event.eventId) });
        throw new Error('test failure after write');
      }),
    ).rejects.toThrow('test failure after write');
    expect(
      await db.processedEvent.count({ where: { eventId: event.eventId } }),
    ).toBe(0);
    expect(
      await db.notification.count({ where: { sourceEventId: event.eventId } }),
    ).toBe(0);
    expect(
      await processOnce(db, event, async (tx) => {
        await tx.notification.create({ data: row(event.eventId) });
      }),
    ).toBe('processed');
  });
  it('handles concurrent duplicate deliveries atomically', async () => {
    const event = entry();
    const results = await Promise.all(
      Array.from({ length: 4 }, () =>
        processOnce(db, event, async (tx) => {
          await tx.notification.create({ data: row(event.eventId) });
        }),
      ),
    );
    expect(results.filter((value) => value === 'processed')).toHaveLength(1);
    expect(results.filter((value) => value === 'duplicate')).toHaveLength(3);
    expect(
      await db.notification.count({ where: { sourceEventId: event.eventId } }),
    ).toBe(1);
  });
  it('uses the accepted event/user/channel uniqueness, not guessed semantic deduplication', async () => {
    const eventId = randomUUID();
    await db.notification.create({ data: row(eventId) });
    await expect(
      db.notification.create({ data: row(eventId) }),
    ).rejects.toMatchObject({ code: 'P2002' });
    await db.notification.create({ data: row(eventId, users[1]) });
    await db.notification.create({ data: row(eventId, users[0], 'EMAIL') });
    await db.notification.create({ data: row(randomUUID()) });
    expect(
      await db.notification.count({ where: { sourceEventId: eventId } }),
    ).toBe(3);
  });
  it('preserves independent inbox consumer identities', async () => {
    const first = entry();
    const second = { ...entry(), eventId: first.eventId };
    expect(await processOnce(db, first, async () => {})).toBe('processed');
    expect(await processOnce(db, second, async () => {})).toBe('processed');
    expect(
      await db.processedEvent.count({ where: { eventId: first.eventId } }),
    ).toBe(2);
  });
  it('enforces the migration rule that EMAIL cannot have read_at', async () => {
    const eventId = randomUUID();
    await expect(
      db.notification.create({
        data: { ...row(eventId, users[0], 'EMAIL'), readAt: new Date() },
      }),
    ).rejects.toMatchObject({ code: 'P2039' });
    expect(
      await db.notification.count({ where: { sourceEventId: eventId } }),
    ).toBe(0);
  });
  it('keeps read state separate from delivery state in existing schema', async () => {
    const created = await db.notification.create({ data: row(randomUUID()) });
    const read = await db.notification.update({
      where: { id: created.id },
      data: { readAt: new Date() },
    });
    expect(read.status).toBe('PENDING');
    expect(read.readAt).not.toBeNull();
  });
});

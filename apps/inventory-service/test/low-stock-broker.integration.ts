import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { ConfigService } from '@nestjs/config';
import {
  Events,
  OutboxRelay,
  RabbitMqEventBus,
  subscriptionQueues,
  type EventEnvelope,
  type SqlExecutor,
  type TransactionOptions,
} from '@pbl6/event-contracts';
import { PrismaService } from '../src/prisma/prisma.service';
import { InventoryRepository } from '../src/inventory/inventory.repository';

/** Real PostgreSQL producer + real RabbitMQ retries. The subscriber is a test
 * probe, NOT Huy's Notification consumer or its audience/inbox/API/UI. */
describe('Inventory LowStock producer through RabbitMQ', () => {
  const tenantId = randomUUID(),
    partId = randomUUID(),
    warehouseId = randomUUID();
  const db = new PrismaService(new ConfigService()),
    repo = new InventoryRepository(db);
  const queue = `inventory-test.${randomUUID()}`,
    exchange = `pbl6.inventory-test.${randomUUID()}`;
  let bus: RabbitMqEventBus;
  const brokerUrl = process.env.RABBITMQ_TEST_URL;
  const deliveries: EventEnvelope[] = [],
    completed: EventEnvelope[] = [];
  let forcedRetry = false;
  const wait = async (condition: () => boolean) => {
    const until = Date.now() + 15000;
    while (!condition()) {
      if (Date.now() > until) throw new Error('Broker condition timed out');
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  };
  beforeAll(async () => {
    if (!brokerUrl)
      throw new Error(
        'RABBITMQ_TEST_URL (or local RABBITMQ_URL) is required; broker evidence must not be silently skipped',
      );
    await db.$connect();
    await db.part.create({
      data: {
        id: partId,
        tenantId,
        sku: 'BROKER-PROBE',
        name: 'Probe part',
        unit: 'pc',
        allowFractional: true,
      },
    });
    await db.warehouse.create({
      data: {
        id: warehouseId,
        tenantId,
        branchId: randomUUID(),
        code: 'BROKER',
        name: 'Probe warehouse',
      },
    });
    bus = new RabbitMqEventBus({ url: brokerUrl, exchange });
    bus.subscribe({
      queue,
      events: [Events.LowStockDetected],
      retryDelayMs: 100,
      handler: async (event) => {
        deliveries.push(event);
        if (!forcedRetry) {
          forcedRetry = true;
          throw new Error('Inventory test: retry first delivery');
        }
        completed.push(event);
      },
    });
    await bus.start();
    await wait(() => bus.isReady());
    // Publish only this test tenant; never drain another tenant's pending rows.
  }, 20000);
  afterAll(async () => {
    await bus?.close();
    if (brokerUrl) {
      const eventRequire = createRequire(
        require.resolve('@pbl6/event-contracts'),
      );
      const { connect } = eventRequire('amqplib');
      const connection = await connect(brokerUrl),
        channel = await connection.createChannel();
      for (const name of Object.values(subscriptionQueues(queue)))
        await channel.deleteQueue(name);
      await channel.deleteExchange(exchange);
      await channel.close();
      await connection.close();
    }
    await db.stockTransaction.deleteMany({ where: { tenantId } });
    await db.inventoryOperation.deleteMany({ where: { tenantId } });
    await db.outboxEvent.deleteMany({ where: { tenantId } });
    await db.stock.deleteMany({ where: { tenantId } });
    await db.warehouse.deleteMany({ where: { tenantId } });
    await db.part.deleteMany({ where: { tenantId } });
    await db.$disconnect();
  });
  it('publishes two crossings, persists business occurrence IDs and replays the same ID on retry', async () => {
    const movement = async (
      operation: 'RECEIVE' | 'ADJUST',
      quantity: string,
    ) =>
      repo.transact({
        tenantId,
        key: randomUUID(),
        actorId: randomUUID(),
        operation,
        request: {
          warehouseId,
          partId,
          quantity,
          ...(operation === 'ADJUST'
            ? { direction: 'ADJUST_OUT' as const, note: 'broker crossing' }
            : {}),
        },
      });
    await movement('RECEIVE', '10.00');
    await repo.threshold(tenantId, warehouseId, partId, '5.00', randomUUID());
    await movement('ADJUST', '6.00'); // first crossing: 4 < 5
    await movement('ADJUST', '1.00'); // remains low: no new event
    await movement('RECEIVE', '2.00'); // re-arm at equality: 5 >= 5
    await movement('ADJUST', '0.01'); // second crossing: 4.99 < 5
    const events = await db.outboxEvent.findMany({
      where: { tenantId },
      orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
    });
    expect(events).toHaveLength(2);
    const scoped = {
      $transaction: <T>(
        fn: (tx: SqlExecutor) => Promise<T>,
        options?: TransactionOptions,
      ) =>
        db.$transaction(
          (tx) =>
            fn(
              new Proxy(tx, {
                get(target, key) {
                  if (key !== '$queryRawUnsafe')
                    return Reflect.get(target, key);
                  return <R>(sql: string, ...values: unknown[]) =>
                    target.$queryRawUnsafe<R>(
                      sql.replace(
                        "WHERE status = 'PENDING'",
                        "WHERE status = 'PENDING' AND tenant_id = $2::uuid",
                      ),
                      ...values,
                      tenantId,
                    );
                },
              }),
            ),
          options,
        ),
    };
    const relay = new OutboxRelay({
      db: scoped,
      publisher: bus,
      producer: 'inventory-service',
    });
    const failingRelay = new OutboxRelay({
      db: scoped,
      publisher: {
        publish: async () => {
          throw new Error('test transient publish failure');
        },
      },
      producer: 'inventory-service',
      baseRetryDelayMs: 1,
      maxRetryDelayMs: 1,
    });
    expect((await failingRelay.runOnce()).failed).toBe(2);
    expect(
      await db.outboxEvent.count({
        where: { tenantId, status: 'PENDING', attemptCount: 1 },
      }),
    ).toBe(2);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect((await relay.runOnce()).published).toBe(2);
    await wait(() => completed.length >= 2);
    expect(new Set(deliveries.map((e) => e.eventId)).size).toBe(2);
    expect(deliveries.length).toBeGreaterThanOrEqual(3);
    const first = completed[0];
    await bus.publish(first);
    await wait(() => completed.length >= 3);
    expect(completed.at(-1)!.eventId).toBe(first.eventId);
    expect((await relay.runOnce()).published).toBe(0);
    expect(
      await db.outboxEvent.count({ where: { tenantId, status: 'PUBLISHED' } }),
    ).toBe(2);
    const dir = path.resolve(__dirname, '../../../tmp');
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      path.join(dir, 'inventory-low-stock-evidence.json'),
      JSON.stringify(
        {
          timestamp: new Date().toISOString(),
          producer: 'inventory-service',
          database: 'inventory_test_db',
          transport: 'real RabbitMQ with retry and explicit replay',
          events: completed.filter(
            (e, i) => completed.findIndex((x) => x.eventId === e.eventId) === i,
          ),
          deliveryCount: deliveries.length,
          notificationConsumer: 'NOT_RUN: owned by Huy',
          gatewayAndUI: 'NOT_RUN: owned by Nguyen/Hatsady',
        },
        null,
        2,
      ),
    );
  }, 25000);
});

import { randomUUID } from 'node:crypto';
import { connect } from 'amqplib';
import { Events } from './catalog';
import type { EventEnvelope } from './envelope';
import { RabbitMqEventBus, subscriptionQueues } from './rabbitmq';

/**
 * Runs against a real broker only when RABBITMQ_TEST_URL is set, e.g.
 *   RABBITMQ_TEST_URL=amqp://pbl6:pbl6_dev_password@localhost:5672 pnpm test
 * Uses a throw-away exchange and queues and deletes them afterwards.
 */
const url = process.env.RABBITMQ_TEST_URL;
const describeBroker = url ? describe : describe.skip;

// CI runners are slower than a laptop; waits below poll a condition instead of sleeping.
jest.setTimeout(30_000);

const TENANT = '11111111-1111-4111-8111-111111111111';

function tenantCreated(): EventEnvelope {
  return {
    eventId: randomUUID(),
    eventType: 'TenantCreated',
    eventVersion: 1,
    producer: 'organization-service',
    tenantId: TENANT,
    aggregateType: 'Tenant',
    aggregateId: TENANT,
    occurredAt: new Date().toISOString(),
    correlationId: 'it-1',
    payload: { tenantId: TENANT, code: 'ACME', name: 'Acme', status: 'ACTIVE' },
  };
}

function waitFor(predicate: () => boolean, timeoutMs = 20_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const tick = () => {
      if (predicate()) return resolve();
      if (Date.now() > deadline) return reject(new Error('timed out'));
      setTimeout(tick, 25);
    };
    tick();
  });
}

describeBroker('RabbitMqEventBus (real broker)', () => {
  const suffix = randomUUID().slice(0, 8);
  const exchange = `pbl6.test.${suffix}`;
  const queue = `test.${suffix}`;
  let bus: RabbitMqEventBus;
  const received: EventEnvelope[] = [];
  let failuresLeft = 0;

  beforeAll(async () => {
    bus = new RabbitMqEventBus({ url: url!, exchange });
    bus.subscribe({
      queue,
      events: [Events.TenantCreated],
      retryDelayMs: 50,
      maxAttempts: 3,
      handler: async (envelope) => {
        if (failuresLeft > 0) {
          failuresLeft -= 1;
          throw new Error('transient failure');
        }
        received.push(envelope);
      },
    });
    await bus.start();
    await bus.waitUntilConnected();
  });

  afterAll(async () => {
    await bus.close();
    const connection = await connect(url!);
    const channel = await connection.createChannel();
    for (const name of Object.values(subscriptionQueues(queue))) {
      await channel.deleteQueue(name);
    }
    await channel.deleteExchange(exchange);
    await connection.close();
  });

  it('delivers a published event to the subscriber', async () => {
    const event = tenantCreated();
    await bus.publish(event);
    await waitFor(() => received.some((e) => e.eventId === event.eventId));
  });

  it('retries a failed handler through the retry queue', async () => {
    failuresLeft = 2;
    const event = tenantCreated();
    await bus.publish(event);
    await waitFor(() => received.some((e) => e.eventId === event.eventId));
    expect(failuresLeft).toBe(0);
  });

  it('dead-letters an event that keeps failing and an invalid message', async () => {
    failuresLeft = 100;
    await bus.publish(tenantCreated());
    const connection = await connect(url!);
    const channel = await connection.createChannel();
    await channel.publish(exchange, 'TenantCreated.v1', Buffer.from('not json'));
    const { deadLetter } = subscriptionQueues(queue);
    let messageCount = 0;
    const deadline = Date.now() + 20_000;
    while (messageCount < 2 && Date.now() < deadline) {
      messageCount = (await channel.checkQueue(deadLetter)).messageCount;
      if (messageCount < 2) await new Promise((resolve) => setTimeout(resolve, 100));
    }
    expect(messageCount).toBe(2);
    failuresLeft = 0;
    await connection.close();
  });
});

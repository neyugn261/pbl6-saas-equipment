import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import {
  Events,
  RabbitMqEventBus,
  subscriptionQueues,
  type EventEnvelope,
} from '@pbl6/event-contracts';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../src/generated/prisma/client.js';
import {
  NOTIFICATION_BUSINESS_CONSUMER,
  NotificationEventsService,
} from '../../src/events/notification-events.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { testDatabaseUrl } from './support/test-env';

interface CleanupChannel {
  deleteQueue(queue: string): Promise<unknown>;
  deleteExchange(exchange: string): Promise<boolean>;
  close(): Promise<void>;
}

interface CleanupConnection {
  createChannel(): Promise<CleanupChannel>;
  close(): Promise<void>;
}

interface AmqpModule {
  connect(url: string): Promise<CleanupConnection>;
}

const eventContractsRequire = createRequire(
  resolve(process.cwd(), '../../packages/event-contracts/package.json'),
);
const { connect } = eventContractsRequire('amqplib') as AmqpModule;
const rabbitUrl = process.env.RABBITMQ_TEST_URL;
const describeBroker = rabbitUrl ? describe : describe.skip;

jest.setTimeout(30_000);

describeBroker('Notification business consumer (real RabbitMQ + PostgreSQL)', () => {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
  const tenantId = randomUUID();
  const serviceRequestId = randomUUID();
  const eventId = randomUUID();
  const exchange = `pbl6.notification.test.${suffix}`;
  const queue = `notification-service.test.${suffix}`;
  const received: string[] = [];
  let bus: RabbitMqEventBus | undefined;
  let db: PrismaClient | undefined;
  let databaseVerified = false;
  let processor: NotificationEventsService;

  const event: EventEnvelope = {
    eventId,
    eventType: Events.ServiceRequestCreated.type,
    eventVersion: Events.ServiceRequestCreated.version,
    producer: Events.ServiceRequestCreated.producer,
    tenantId,
    aggregateType: Events.ServiceRequestCreated.aggregateType,
    aggregateId: serviceRequestId,
    occurredAt: new Date().toISOString(),
    correlationId: randomUUID(),
    payload: {
      serviceRequestId,
      requestNo: 'SR-RABBIT-TEST',
      customerId: randomUUID(),
      equipmentId: randomUUID(),
      requesterId: randomUUID(),
      type: 'REPAIR',
      priority: 'NORMAL',
      activationToken: 'not-a-real-activation-token',
    },
  };

  beforeAll(async () => {
    if (!rabbitUrl) return;
    db = new PrismaClient({
      adapter: new PrismaPg({ connectionString: testDatabaseUrl() }),
    });
    await db.$connect();
    const [actual] = await db.$queryRawUnsafe<Array<{ name: string }>>(
      'SELECT current_database() AS name',
    );
    if (actual?.name !== 'notification_test_db') {
      throw new Error('Unsafe database');
    }
    databaseVerified = true;
    processor = new NotificationEventsService(db as PrismaService);
    bus = new RabbitMqEventBus({ url: rabbitUrl, exchange });
    bus.subscribe({
      queue,
      events: [Events.ServiceRequestCreated],
      handler: async (envelope) => {
        await processor.handle(envelope);
        received.push(envelope.eventId);
      },
    });
    await bus.start();
    await bus.waitUntilConnected();
  });

  afterAll(async () => {
    await bus?.close();
    if (rabbitUrl) {
      const connection = await connect(rabbitUrl);
      const channel = await connection.createChannel();
      for (const name of Object.values(subscriptionQueues(queue))) {
        await channel.deleteQueue(name);
      }
      await channel.deleteExchange(exchange);
      await channel.close();
      await connection.close();
    }
    if (!db) return;
    try {
      if (databaseVerified) {
        await db.notification.deleteMany({ where: { tenantId } });
        await db.pendingNotificationEvent.deleteMany({
          where: { tenantId, consumer: NOTIFICATION_BUSINESS_CONSUMER },
        });
        await db.processedEvent.deleteMany({
          where: { eventId, consumer: NOTIFICATION_BUSINESS_CONSUMER },
        });
      }
    } finally {
      await db.$disconnect();
    }
  });

  it('commits durable pending state before ACK and deduplicates broker redelivery', async () => {
    if (!bus || !db) throw new Error('RabbitMQ test setup did not complete');
    await bus.publish(event);
    await waitFor(() => received.length === 1);
    await bus.publish(event);
    await waitFor(() => received.length === 2);

    expect(
      await db.processedEvent.count({
        where: { eventId, consumer: NOTIFICATION_BUSINESS_CONSUMER },
      }),
    ).toBe(1);
    const pending = await db.pendingNotificationEvent.findUnique({
      where: {
        sourceEventId_consumer: {
          sourceEventId: eventId,
          consumer: NOTIFICATION_BUSINESS_CONSUMER,
        },
      },
    });
    expect(pending).toMatchObject({
      status: 'RETRYING',
      reason: 'WAITING_FOR_RECIPIENT_BOOTSTRAP',
      attempts: 1,
    });
    expect(pending?.payload).not.toHaveProperty('activationToken');
    expect(pending?.payload).not.toHaveProperty('title');
    expect(
      await db.notification.count({ where: { sourceEventId: eventId } }),
    ).toBe(0);
  });
});

function waitFor(predicate: () => boolean, timeoutMs = 20_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolveWait, reject) => {
    const tick = () => {
      if (predicate()) return resolveWait();
      if (Date.now() > deadline) return reject(new Error('Timed out waiting for RabbitMQ delivery'));
      setTimeout(tick, 25);
    };
    tick();
  });
}

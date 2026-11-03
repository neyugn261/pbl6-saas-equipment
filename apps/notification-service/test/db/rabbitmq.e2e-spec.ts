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
import { RecipientProjectionService } from '../../src/events/recipient-projection.service';
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

describeBroker('Notification consumers (RabbitMQ + PostgreSQL)', () => {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
  const tenantId = randomUUID();
  const serviceRequestId = randomUUID();
  const customerId = randomUUID();
  const requesterId = randomUUID();
  const managerId = randomUUID();
  const bootstrapRunId = randomUUID();
  const eventId = randomUUID();
  const exchange = `pbl6.notification.test.${suffix}`;
  const queue = `notification-service.test.${suffix}`;
  const recipientQueue = `${queue}.recipients`;
  const bootstrapQueue = `${queue}.bootstrap`;
  const received: string[] = [];
  const receivedSnapshots: string[] = [];
  const receivedMarkers: string[] = [];
  const projectionEventIds: string[] = [];
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
      customerId,
      equipmentId: randomUUID(),
      requesterId,
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
    const recipients = new RecipientProjectionService(
      db as PrismaService,
      processor,
    );
    bus = new RabbitMqEventBus({ url: rabbitUrl, exchange });
    bus.subscribe({
      queue,
      events: [Events.ServiceRequestCreated],
      handler: async (envelope) => {
        await processor.handle(envelope);
        received.push(envelope.eventId);
      },
    });
    bus.subscribe({
      queue: recipientQueue,
      events: [Events.NotificationRecipientSnapshot],
      handler: async (envelope) => {
        await recipients.applySnapshot(envelope);
        receivedSnapshots.push(envelope.eventId);
      },
    });
    bus.subscribe({
      queue: bootstrapQueue,
      events: [Events.NotificationRecipientBootstrapCompleted],
      handler: async (envelope) => {
        await recipients.applyBootstrapCompleted(envelope);
        receivedMarkers.push(envelope.eventId);
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
      for (const subscription of [queue, recipientQueue, bootstrapQueue]) {
        for (const name of Object.values(subscriptionQueues(subscription))) {
          await channel.deleteQueue(name);
        }
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
          where: { eventId: { in: [eventId, ...projectionEventIds] } },
        });
        await db.serviceRequestSnapshot.deleteMany({ where: { tenantId } });
        await db.recipientBootstrapRun.deleteMany({ where: { tenantId } });
        await db.recipientSnapshot.deleteMany({ where: { tenantId } });
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

  it('accepts the catalog bootstrap run after snapshots and releases exhausted pending fan-out exactly once', async () => {
    if (!bus || !db) throw new Error('RabbitMQ test setup did not complete');
    const businessReceipts = received.length;
    await bus.publish(event);
    await waitFor(() => received.length === businessReceipts + 1);
    // Reproduce the durable backlog left by the rejected marker, including a
    // future retry time. A valid bootstrap must reconcile it without a timer.
    await db.pendingNotificationEvent.update({
      where: {
        sourceEventId_consumer: {
          sourceEventId: eventId,
          consumer: NOTIFICATION_BUSINESS_CONSUMER,
        },
      },
      data: {
        status: 'MANUAL_REVIEW',
        attempts: 10,
        nextAttemptAt: new Date(Date.now() + 60_000),
      },
    });

    const occurredAt = new Date().toISOString();
    const snapshotDefinition = Events.NotificationRecipientSnapshot;
    const snapshots: EventEnvelope[] = [
      {
        userId: managerId,
        userType: 'TENANT_STAFF',
        roles: ['SERVICE_MANAGER'],
        customerMembership: null,
      },
      {
        userId: requesterId,
        userType: 'CUSTOMER',
        roles: ['CUSTOMER_USER'],
        customerMembership: {
          membershipId: randomUUID(),
          customerId,
          status: 'ACTIVE',
          sourceChangedAt: occurredAt,
        },
      },
    ].map((recipient) => ({
      eventId: randomUUID(),
      eventType: snapshotDefinition.type,
      eventVersion: snapshotDefinition.version,
      producer: snapshotDefinition.producer,
      aggregateType: snapshotDefinition.aggregateType,
      aggregateId: recipient.userId,
      tenantId,
      occurredAt,
      correlationId: randomUUID(),
      payload: {
        ...recipient,
        accountStatus: 'ACTIVE',
        revision: '1',
        bootstrapRunId,
      },
    }));
    projectionEventIds.push(...snapshots.map((snapshot) => snapshot.eventId));
    for (const snapshot of snapshots) await bus.publish(snapshot);
    await waitFor(() => receivedSnapshots.length === 2);
    expect(
      await db.recipientBootstrapRun.findUnique({
        where: { bootstrapRunId },
      }),
    ).toMatchObject({
      receivedUsers: 2,
      markerReceived: false,
      status: 'RUNNING',
    });
    expect(
      await db.notification.count({ where: { sourceEventId: eventId } }),
    ).toBe(0);

    const definition = Events.NotificationRecipientBootstrapCompleted;
    const marker: EventEnvelope = {
      eventId: randomUUID(),
      eventType: definition.type,
      eventVersion: definition.version,
      producer: definition.producer,
      aggregateType: definition.aggregateType,
      aggregateId: bootstrapRunId,
      tenantId,
      occurredAt,
      correlationId: randomUUID(),
      payload: {
        bootstrapRunId,
        expectedUsers: 2,
        startedAt: occurredAt,
        completedAt: occurredAt,
      },
    };
    projectionEventIds.push(marker.eventId);
    await bus.publish(marker);
    await waitFor(() => receivedMarkers.length === 1);
    expect(
      await db.recipientBootstrapRun.findUnique({
        where: { bootstrapRunId },
      }),
    ).toMatchObject({
      expectedUsers: 2,
      receivedUsers: 2,
      markerReceived: true,
      status: 'COMPLETED',
    });
    expect(
      await db.pendingNotificationEvent.findUnique({
        where: {
          sourceEventId_consumer: {
            sourceEventId: eventId,
            consumer: NOTIFICATION_BUSINESS_CONSUMER,
          },
        },
      }),
    ).toMatchObject({ status: 'RESOLVED' });
    expect(
      (await db.notification.findMany({ where: { sourceEventId: eventId } }))
        .map((row) => row.userId)
        .sort(),
    ).toEqual([managerId, requesterId].sort());

    for (const snapshot of snapshots) await bus.publish(snapshot);
    await bus.publish(marker);
    await bus.publish(event);
    await waitFor(
      () =>
        receivedSnapshots.length === 4 &&
        receivedMarkers.length === 2 &&
        received.length === businessReceipts + 2,
    );
    expect(
      await db.recipientBootstrapReceipt.count({ where: { bootstrapRunId } }),
    ).toBe(2);
    expect(
      await db.notification.count({ where: { sourceEventId: eventId } }),
    ).toBe(2);
  });
});

function waitFor(predicate: () => boolean, timeoutMs = 20_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolveWait, reject) => {
    const tick = () => {
      if (predicate()) return resolveWait();
      if (Date.now() > deadline)
        return reject(new Error('Timed out waiting for RabbitMQ delivery'));
      setTimeout(tick, 25);
    };
    tick();
  });
}

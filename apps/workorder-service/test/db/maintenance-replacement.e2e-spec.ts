import { randomUUID } from 'node:crypto';
import { INestApplication, Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { configureApp } from '@pbl6/service-kit';
import { signTestAccessToken } from '@pbl6/testing';
import {
  InvalidEventError,
  type EventEnvelope,
  type MaintenanceTaskDueV1,
  type MaintenanceWorkOrderReplacementRequestedV1,
} from '@pbl6/event-contracts';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { REFERENCES } from '../../src/references/references.client';
import { lockMaintenanceTask } from '../../src/common/maintenance-source';
import {
  MaintenanceEventsConsumer,
  MAINTENANCE_REPLACEMENT_CONSUMER,
} from '../../src/events/maintenance-events.consumer';

const tenantId = randomUUID(),
  customerId = randomUUID(),
  equipmentId = randomUUID();
const manager = signTestAccessToken({ role: 'SERVICE_MANAGER', tenantId });
type Replacement = EventEnvelope<MaintenanceWorkOrderReplacementRequestedV1>;

describe('Explicit Maintenance replacement — real PostgreSQL and business idempotency', () => {
  let app: INestApplication<App>,
    db: PrismaService,
    consumer: MaintenanceEventsConsumer;
  const refs = {
    user: jest.fn(),
    branch: jest.fn(),
    equipment: jest.fn(),
    request: jest.fn(),
  };
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(REFERENCES)
      .useValue(refs)
      .compile();
    app = module.createNestApplication({ logger: false });
    configureApp(app, { logger: new Logger('maintenance-replacement-db') });
    await app.init();
    db = app.get(PrismaService);
    consumer = app.get(MaintenanceEventsConsumer);
  });
  afterAll(async () => {
    await app?.close();
  });
  beforeEach(async () => {
    await db.$executeRawUnsafe(
      'TRUNCATE report_attachments, service_reports, work_order_attachments, work_logs, work_order_assignments, work_order_status_history, work_orders, technician_skills, skills, technicians, document_sequences, outbox_events, processed_events',
    );
    jest.resetAllMocks();
    for (const method of Object.values(refs))
      method.mockRejectedValue(new Error('No fabricated upstream credentials'));
  });
  const clone = (event: Replacement): Replacement => ({
    ...event,
    eventId: randomUUID(),
    payload: { ...event.payload },
  });
  const cancel = (id: string) =>
    request(app.getHttpServer())
      .post(`/work-orders/${id}/cancel`)
      .auth(manager, { type: 'bearer' })
      .send({ reason: 'Explicit replacement test' })
      .expect(200);
  async function fixture(
    cancelled = true,
    siteId: string | null = randomUUID(),
  ) {
    const payload: MaintenanceTaskDueV1 = {
      maintenanceTaskId: randomUUID(),
      maintenancePlanId: randomUUID(),
      equipmentId,
      customerId,
      customerSiteId: siteId,
      scheduledDate: '2028-02-29',
      title: 'Scheduled inspection',
    };
    const due: EventEnvelope<MaintenanceTaskDueV1> = {
      eventId: randomUUID(),
      eventType: 'MaintenanceTaskDue',
      eventVersion: 1,
      tenantId,
      producer: 'maintenance-service',
      aggregateType: 'MaintenanceTask',
      aggregateId: payload.maintenanceTaskId,
      occurredAt: new Date().toISOString(),
      correlationId: 'replacement-db',
      payload,
    };
    await consumer.handle(due);
    const previous = await db.workOrder.findFirstOrThrow({
      where: { maintenanceTaskId: payload.maintenanceTaskId },
    });
    if (cancelled) await cancel(previous.id);
    const event: Replacement = {
      ...due,
      eventId: randomUUID(),
      eventType: 'MaintenanceWorkOrderReplacementRequested',
      payload: {
        ...payload,
        requestId: randomUUID(),
        previousWorkOrderId: previous.id,
        replacementWorkOrderId: randomUUID(),
        requestedBy: randomUUID(),
      },
    };
    return { due, previous, event };
  }
  async function counts() {
    return {
      orders: await db.workOrder.count(),
      history: await db.workOrderStatusHistory.count(),
      outbox: await db.outboxEvent.count(),
      inbox: await db.processedEvent.count(),
      sequence: (await db.documentSequence.findFirstOrThrow()).lastValue,
    };
  }
  async function rejected(
    event: Replacement,
    kind: typeof Error | typeof InvalidEventError = InvalidEventError,
  ) {
    const before = await counts();
    await expect(consumer.handle(event)).rejects.toBeInstanceOf(kind);
    expect(await counts()).toEqual(before);
  }
  it('creates the supplied WO ID with durable request/predecessor, null system actor and atomic Created outbox', async () => {
    const { event } = await fixture();
    expect(await consumer.handle(event)).toBe('processed');
    const row = await db.workOrder.findUniqueOrThrow({
      where: { id: event.payload.replacementWorkOrderId },
    });
    expect(row).toMatchObject({
      tenantId,
      equipmentId,
      customerId,
      customerSiteId: event.payload.customerSiteId,
      maintenanceTaskId: event.aggregateId,
      serviceRequestId: null,
      maintenanceReplacementRequestId: event.payload.requestId,
      replacesWorkOrderId: event.payload.previousWorkOrderId,
      title: event.payload.title,
      status: 'CREATED',
      type: 'MAINTENANCE',
      priority: 'NORMAL',
      createdBy: null,
      scheduledEnd: null,
    });
    expect(row.scheduledStart?.toISOString()).toBe('2028-02-28T17:00:00.000Z');
    expect(row.workOrderNo).toMatch(/-0002$/);
    expect(
      await db.workOrderStatusHistory.findFirstOrThrow({
        where: { workOrderId: row.id },
      }),
    ).toMatchObject({
      oldStatus: null,
      newStatus: 'CREATED',
      changedBy: null,
      reason: expect.stringContaining(event.payload.requestedBy),
    });
    expect(await db.workLog.count({ where: { workOrderId: row.id } })).toBe(0);
    expect(
      await db.processedEvent.findFirstOrThrow({
        where: { eventId: event.eventId },
      }),
    ).toMatchObject({ consumer: MAINTENANCE_REPLACEMENT_CONSUMER });
    expect(
      await db.outboxEvent.findFirstOrThrow({ where: { aggregateId: row.id } }),
    ).toMatchObject({
      eventType: 'WorkOrderCreated',
      eventVersion: 1,
      tenantId,
      payload: {
        data: {
          workOrderId: row.id,
          maintenanceTaskId: event.aggregateId,
          serviceRequestId: null,
        },
        meta: { correlationId: event.correlationId },
      },
    });
    for (const method of Object.values(refs))
      expect(method).not.toHaveBeenCalled();
  });
  it('deduplicates concurrent same-event and new-event-ID deliveries, including mixed-case UUIDs', async () => {
    const { event } = await fixture();
    const other = clone(event);
    other.tenantId = tenantId.toUpperCase();
    other.aggregateId = other.aggregateId.toUpperCase();
    for (const key of [
      'maintenanceTaskId',
      'previousWorkOrderId',
      'replacementWorkOrderId',
      'requestId',
      'equipmentId',
      'customerId',
      'customerSiteId',
    ] as const) {
      const value = other.payload[key];
      if (value) other.payload[key] = value.toUpperCase();
    }
    await Promise.all([
      consumer.handle(event),
      consumer.handle(event),
      consumer.handle(other),
    ]);
    expect(await db.workOrder.count()).toBe(2);
    expect(
      await db.outboxEvent.count({ where: { eventType: 'WorkOrderCreated' } }),
    ).toBe(2);
    expect((await db.documentSequence.findFirstOrThrow()).lastValue).toBe(2n);
    expect(await consumer.handle(event)).toBe('duplicate');
  });
  it('supports null site/correlation and a completed target remains an idempotent replay', async () => {
    const { event } = await fixture(true, null);
    event.correlationId = null;
    await consumer.handle(event);
    await db.workOrder.update({
      where: { id: event.payload.replacementWorkOrderId },
      data: { status: 'COMPLETED' },
    });
    await consumer.handle(clone(event));
    expect(await db.workOrder.count()).toBe(2);
    expect(
      await db.workOrderStatusHistory.count({
        where: { workOrderId: event.payload.replacementWorkOrderId },
      }),
    ).toBe(1);
    expect(
      (
        await db.outboxEvent.findFirstOrThrow({
          where: { aggregateId: event.payload.replacementWorkOrderId },
        })
      ).payload,
    ).toMatchObject({ meta: { correlationId: null } });
  });
  it('keeps replay idempotent after cancellation/rescheduling, and allows the next explicit link only', async () => {
    const { event, due } = await fixture();
    await consumer.handle(event);
    await request(app.getHttpServer())
      .patch(`/work-orders/${event.payload.replacementWorkOrderId}`)
      .auth(manager, { type: 'bearer' })
      .send({ scheduledStart: '2030-01-01T08:00:00+07:00' })
      .expect(200);
    await cancel(event.payload.replacementWorkOrderId);
    await consumer.handle(clone(event));
    const next = clone(event);
    next.payload = {
      ...event.payload,
      requestId: randomUUID(),
      previousWorkOrderId: event.payload.replacementWorkOrderId,
      replacementWorkOrderId: randomUUID(),
    };
    await consumer.handle(next);
    await consumer.handle(clone(event));
    await consumer.handle({ ...due, eventId: randomUUID() });
    expect(await db.workOrder.count()).toBe(3);
    expect(
      await db.workOrder.count({ where: { status: { not: 'CANCELLED' } } }),
    ).toBe(1);
    // A second branch from the old cancelled predecessor is invalid even after its first successor was cancelled.
    const stale = clone(event);
    stale.payload.requestId = randomUUID();
    stale.payload.replacementWorkOrderId = randomUUID();
    await rejected(stale);
  });
  it('accepts only one of two concurrent replacement intents for the same predecessor', async () => {
    const { event } = await fixture();
    const other = clone(event);
    other.payload.requestId = randomUUID();
    other.payload.replacementWorkOrderId = randomUUID();
    const results = await Promise.allSettled([
      consumer.handle(event),
      consumer.handle(other),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
    expect(await db.workOrder.count()).toBe(2);
    expect((await db.documentSequence.findFirstOrThrow()).lastValue).toBe(2n);
  });
  it('rejects reuse of a request ID for another predecessor after cancellation', async () => {
    const { event } = await fixture();
    await consumer.handle(event);
    await cancel(event.payload.replacementWorkOrderId);
    const reused = clone(event);
    reused.payload.previousWorkOrderId = event.payload.replacementWorkOrderId;
    reused.payload.replacementWorkOrderId = randomUUID();
    await rejected(reused);
  });
  it.each([
    'tenant',
    'task',
    'equipment',
    'customer',
    'site',
    'sourceType',
    'srSource',
  ])('rejects %s source mismatch without an inbox commit', async (name) => {
    const { event } = await fixture();
    if (name === 'tenant') event.tenantId = randomUUID();
    if (name === 'task') {
      event.payload.maintenanceTaskId = randomUUID();
      event.aggregateId = event.payload.maintenanceTaskId;
    }
    if (name === 'equipment') event.payload.equipmentId = randomUUID();
    if (name === 'customer') event.payload.customerId = randomUUID();
    if (name === 'site') event.payload.customerSiteId = null;
    if (name === 'sourceType')
      await db.workOrder.update({
        where: { id: event.payload.previousWorkOrderId },
        data: { type: 'REPAIR' },
      });
    if (name === 'srSource')
      await db.workOrder.update({
        where: { id: event.payload.previousWorkOrderId },
        data: { maintenanceTaskId: null, serviceRequestId: randomUUID() },
      });
    await rejected(event);
  });
  it.each([
    'aggregate',
    'producer',
    'aggregateType',
    'invalidRequestId',
    'invalidActor',
    'impossibleDate',
    'sameWorkOrderId',
  ])('rejects invalid %s metadata or payload', async (name) => {
    const { event } = await fixture();
    if (name === 'aggregate') event.aggregateId = randomUUID();
    if (name === 'producer') event.producer = 'asset-service';
    if (name === 'aggregateType') event.aggregateType = 'Equipment';
    if (name === 'invalidRequestId') event.payload.requestId = 'invalid';
    if (name === 'invalidActor') event.payload.requestedBy = 'invalid';
    if (name === 'impossibleDate') event.payload.scheduledDate = '2026-02-29';
    if (name === 'sameWorkOrderId')
      event.payload.replacementWorkOrderId = event.payload.previousWorkOrderId;
    await rejected(event);
  });
  it('retries a missing predecessor using the same event ID after the reference is available', async () => {
    const { event } = await fixture();
    const realId = event.payload.previousWorkOrderId;
    event.payload.previousWorkOrderId = randomUUID();
    await rejected(event, Error);
    event.payload.previousWorkOrderId = realId;
    expect(await consumer.handle(event)).toBe('processed');
  });
  it.each(['CREATED', 'COMPLETED'])(
    'does not replace a %s predecessor',
    async (status) => {
      const { event } = await fixture(false);
      await db.workOrder.update({
        where: { id: event.payload.previousWorkOrderId },
        data: { status },
      });
      await rejected(event, Error);
    },
  );
  it('blocks a second WO even when another completed WO exists for the same task', async () => {
    const { event } = await fixture();
    await db.workOrder.create({
      data: {
        tenantId,
        equipmentId,
        customerId,
        workOrderNo: 'BLOCKING',
        maintenanceTaskId: event.aggregateId,
        type: 'MAINTENANCE',
        title: 'Already completed',
        status: 'COMPLETED',
      },
    });
    await rejected(event, Error);
  });
  it('rejects target ID collisions and changed replay identity', async () => {
    const { event } = await fixture();
    await consumer.handle(event);
    const changed = clone(event);
    changed.payload.requestId = randomUUID();
    await rejected(changed);
    const changedSource = clone(event);
    changedSource.payload.previousWorkOrderId = randomUUID();
    await rejected(changedSource);
    const other = await fixture();
    other.event.payload.replacementWorkOrderId =
      event.payload.replacementWorkOrderId;
    await rejected(other.event);
  });
  it('serializes a replacement against cancellation through the same source lock', async () => {
    const { event } = await fixture(false);
    let started!: () => void, release!: () => void;
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    const proceed = new Promise<void>((resolve) => {
      release = resolve;
    });
    const cancelling = db.$transaction(async (tx) => {
      await lockMaintenanceTask(tx, event.aggregateId);
      started();
      await proceed;
      await tx.workOrder.update({
        where: { id: event.payload.previousWorkOrderId },
        data: { status: 'CANCELLED' },
      });
    });
    await ready;
    const replacing = consumer.handle(event);
    release();
    await cancelling;
    await replacing;
    expect(await db.workOrder.count()).toBe(2);
  });
  it('rolls back the supplied WO ID, request/predecessor claims, sequence, history and inbox on outbox failure', async () => {
    const { event } = await fixture();
    const before = await counts();
    await db.$executeRawUnsafe(
      "ALTER TABLE outbox_events ADD CONSTRAINT replacement_reject_created CHECK (event_type <> 'WorkOrderCreated') NOT VALID",
    );
    try {
      await expect(consumer.handle(event)).rejects.toThrow();
      expect(await counts()).toEqual(before);
    } finally {
      await db.$executeRawUnsafe(
        'ALTER TABLE outbox_events DROP CONSTRAINT replacement_reject_created',
      );
    }
    expect(await consumer.handle(event)).toBe('processed');
    expect(
      (
        await db.workOrder.findUniqueOrThrow({
          where: { id: event.payload.replacementWorkOrderId },
        })
      ).workOrderNo,
    ).toMatch(/-0002$/);
  });
  it('enforces durable request and predecessor uniqueness at the DB boundary', async () => {
    const { event } = await fixture();
    await consumer.handle(event);
    await cancel(event.payload.replacementWorkOrderId);
    const row = await db.workOrder.findUniqueOrThrow({
      where: { id: event.payload.replacementWorkOrderId },
    });
    const { id: _id, ...data } = row;
    await expect(
      db.workOrder.create({
        data: {
          ...data,
          id: randomUUID(),
          workOrderNo: 'DUPLICATE-REQUEST',
          replacesWorkOrderId: randomUUID(),
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
    await expect(
      db.workOrder.create({
        data: {
          ...data,
          id: randomUUID(),
          workOrderNo: 'DUPLICATE-PREDECESSOR',
          maintenanceReplacementRequestId: randomUUID(),
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });
  it.each([
    'missingPair',
    'serviceRequestOrigin',
    'wrongType',
    'selfReference',
  ])('rejects %s replacement metadata through the DB CHECK', async (name) => {
    const { event } = await fixture();
    const id = randomUUID();
    const data = {
      id,
      tenantId,
      equipmentId,
      customerId,
      workOrderNo: 'CHECK-REPLACEMENT',
      maintenanceTaskId: event.aggregateId as string | null,
      serviceRequestId: null as string | null,
      type: 'MAINTENANCE',
      title: 'Constraint test',
      maintenanceReplacementRequestId: event.payload.requestId as string | null,
      replacesWorkOrderId: event.payload.previousWorkOrderId,
    };
    if (name === 'missingPair') data.maintenanceReplacementRequestId = null;
    if (name === 'serviceRequestOrigin') {
      data.maintenanceTaskId = null;
      data.serviceRequestId = randomUUID();
    }
    if (name === 'wrongType') data.type = 'REPAIR';
    if (name === 'selfReference') data.replacesWorkOrderId = id;
    await expect(db.workOrder.create({ data })).rejects.toThrow();
    expect(await db.workOrder.count()).toBe(1);
  });
});

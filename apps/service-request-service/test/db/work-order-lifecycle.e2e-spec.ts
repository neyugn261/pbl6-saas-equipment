import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { App } from 'supertest/types';
import type {
  EventEnvelope,
  WorkOrderCreatedV1,
  WorkOrderCompletedV2,
  WorkOrderCancelledV2,
} from '@pbl6/event-contracts';
import { WorkOrderEventsConsumer } from '../../src/events/work-order-events.consumer';
import { PrismaService } from '../../src/prisma/prisma.service';
import { createTestApp, resetDatabase } from './support/test-app';

describe('durable Work Order lifecycle', () => {
  let app: INestApplication<App>;
  let db: PrismaService;
  let consumer: WorkOrderEventsConsumer;
  beforeAll(async () => {
    ({ app, prisma: db } = await createTestApp());
    consumer = app.get(WorkOrderEventsConsumer);
  });
  afterAll(async () => app?.close());
  beforeEach(async () => resetDatabase(db));

  async function fixture() {
    return db.serviceRequest.create({
      data: {
        tenantId: randomUUID(),
        customerId: randomUUID(),
        equipmentId: randomUUID(),
        requesterId: randomUUID(),
        requestNo: 'SR-LIFECYCLE',
        type: 'REPAIR',
        title: 'Lifecycle',
        description: 'Fixture',
        status: 'ACCEPTED',
      },
    });
  }
  function created(
    row: Awaited<ReturnType<typeof fixture>>,
    id = randomUUID(),
  ): EventEnvelope<WorkOrderCreatedV1> {
    return {
      eventId: randomUUID(),
      eventType: 'WorkOrderCreated',
      eventVersion: 1,
      producer: 'workorder-service',
      tenantId: row.tenantId,
      aggregateType: 'WorkOrder',
      aggregateId: id,
      occurredAt: new Date().toISOString(),
      correlationId: null,
      payload: {
        workOrderId: id,
        workOrderNo: `WO-${id.slice(0, 8)}`,
        serviceRequestId: row.id,
        maintenanceTaskId: null,
        equipmentId: row.equipmentId,
        customerId: row.customerId,
        type: 'REPAIR',
        priority: 'NORMAL',
      },
    };
  }
  function cancelled(
    e: EventEnvelope<WorkOrderCreatedV1>,
    intent = false,
  ): EventEnvelope<WorkOrderCancelledV2> {
    return {
      ...e,
      eventId: randomUUID(),
      eventType: 'WorkOrderCancelled',
      eventVersion: 2,
      payload: {
        workOrderId: e.payload.workOrderId,
        workOrderNo: e.payload.workOrderNo,
        serviceRequestId: e.payload.serviceRequestId,
        maintenanceTaskId: null,
        equipmentId: e.payload.equipmentId,
        reason: 'Cancelled by manager',
        cancelledAt: '2026-10-28T00:00:00.000Z',
        cancelServiceRequest: intent,
      },
    };
  }
  function completed(
    e: EventEnvelope<WorkOrderCreatedV1>,
    result: WorkOrderCompletedV2['result'],
  ): EventEnvelope<WorkOrderCompletedV2> {
    return {
      ...e,
      eventId: randomUUID(),
      eventType: 'WorkOrderCompleted',
      eventVersion: 2,
      payload: {
        ...e.payload,
        serviceReportId: randomUUID(),
        result,
        completedAt: '2026-10-28T00:00:00.000Z',
        customerSummary: 'Safe result',
      },
    };
  }
  async function state(id: string) {
    const row = await db.serviceRequest.findUniqueOrThrow({ where: { id } });
    return { status: row.status, activeWorkOrderId: row.activeWorkOrderId };
  }
  async function counts(id: string) {
    return {
      history: await db.requestStatusHistory.count({
        where: { requestId: id },
      }),
      outbox: await db.outboxEvent.count({ where: { aggregateId: id } }),
    };
  }

  it('keeps A terminal across semantic replay and permits B', async () => {
    const row = await fixture();
    const a = created(row);
    const end = cancelled(a);
    await consumer.handle(a);
    await consumer.handle(end);
    const before = await counts(row.id);
    await consumer.handle({ ...a, eventId: randomUUID() });
    await consumer.handle({ ...end, eventId: randomUUID() });
    expect(await state(row.id)).toEqual({
      status: 'ACCEPTED',
      activeWorkOrderId: null,
    });
    expect(await counts(row.id)).toEqual(before);
    const b = created(row);
    await consumer.handle(b);
    expect(await state(row.id)).toEqual({
      status: 'PROCESSING',
      activeWorkOrderId: b.payload.workOrderId,
    });
    await consumer.handle({ ...a, eventId: randomUUID() });
    expect(await state(row.id)).toEqual({
      status: 'PROCESSING',
      activeWorkOrderId: b.payload.workOrderId,
    });
  });

  it.each([false, true])(
    'persists cancellation before Created, intent=%s',
    async (intent) => {
      const row = await fixture();
      const a = created(row);
      await consumer.handle(cancelled(a, intent));
      expect(await state(row.id)).toEqual({
        status: 'ACCEPTED',
        activeWorkOrderId: null,
      });
      expect(await counts(row.id)).toEqual({ history: 0, outbox: 0 });
      await consumer.handle(a);
      expect(await state(row.id)).toEqual({
        status: intent ? 'CANCELLED' : 'ACCEPTED',
        activeWorkOrderId: null,
      });
      expect(await counts(row.id)).toEqual({ history: 2, outbox: 2 });
    },
  );

  it('persists completion before Created with the customer summary', async () => {
    const row = await fixture();
    const a = created(row);
    await consumer.handle(completed(a, 'RESOLVED'));
    await consumer.handle(a);
    const actual = await db.serviceRequest.findUniqueOrThrow({
      where: { id: row.id },
    });
    expect(actual.status).toBe('RESOLVED');
    expect(actual.resolutionSummary).toBe('Safe result');
    expect(await counts(row.id)).toEqual({ history: 2, outbox: 2 });
  });

  it('reconciles B when A finishes and quarantines contradictory terminal evidence', async () => {
    const row = await fixture();
    const a = created(row);
    const b = created(row);
    await consumer.handle(a);
    await consumer.handle(b);
    expect(await state(row.id)).toEqual({
      status: 'PROCESSING',
      activeWorkOrderId: a.payload.workOrderId,
    });
    await consumer.handle(cancelled(a));
    expect(await state(row.id)).toEqual({
      status: 'PROCESSING',
      activeWorkOrderId: b.payload.workOrderId,
    });
    await consumer.handle(completed(a, 'RESOLVED'));
    expect(
      await db.workOrderLifecycleConflict.count({
        where: { requestId: row.id, reason: 'TERMINAL_PHASE_CONFLICT' },
      }),
    ).toBe(1);
    expect(await state(row.id)).toEqual({
      status: 'PROCESSING',
      activeWorkOrderId: b.payload.workOrderId,
    });
  });

  it('serializes simultaneous Created and Cancelled without duplicate effects', async () => {
    const row = await fixture();
    const a = created(row);
    await Promise.all([consumer.handle(a), consumer.handle(cancelled(a))]);
    expect(await state(row.id)).toEqual({
      status: 'ACCEPTED',
      activeWorkOrderId: null,
    });
    expect(await counts(row.id)).toEqual({ history: 2, outbox: 2 });
    const ledger = await db.workOrderLifecycle.findUniqueOrThrow({
      where: {
        tenantId_workOrderId: {
          tenantId: row.tenantId,
          workOrderId: a.payload.workOrderId,
        },
      },
    });
    expect(ledger.appliedPhase).toBe('CANCELLED');
  });

  it('rolls back inbox and ledger if a legacy PROCESSING request cannot be verified', async () => {
    const row = await fixture();
    await db.serviceRequest.update({
      where: { id: row.id },
      data: { status: 'PROCESSING', activeWorkOrderId: null },
    });
    const a = created(row);
    await expect(consumer.handle(a)).rejects.toThrow(/legacy Service Request/);
    expect(
      await db.workOrderLifecycle.count({ where: { requestId: row.id } }),
    ).toBe(0);
    expect(
      await db.processedEvent.count({ where: { eventId: a.eventId } }),
    ).toBe(0);
    expect(await counts(row.id)).toEqual({ history: 0, outbox: 0 });
  });

  it('records a reused event ID with different business content as a conflict', async () => {
    const row = await fixture();
    const a = created(row);
    await consumer.handle(a);
    await consumer.handle({
      ...a,
      payload: { ...a.payload, priority: 'HIGH' },
    });
    expect(
      await db.workOrderLifecycleConflict.count({
        where: { requestId: row.id, reason: 'EVENT_ID_CONFLICT' },
      }),
    ).toBe(1);
    expect(await counts(row.id)).toEqual({ history: 1, outbox: 1 });
  });
});

import { randomUUID } from 'node:crypto';
import {
  Events,
  type EventEnvelope,
  type WorkOrderCreatedV1,
} from '@pbl6/event-contracts';
import type { PrismaService } from '../prisma/prisma.service';
import { WorkOrderEventsConsumer } from './work-order-events.consumer';

function created(): EventEnvelope<WorkOrderCreatedV1> {
  const workOrderId = randomUUID();
  return {
    eventId: randomUUID(),
    eventType: 'WorkOrderCreated',
    eventVersion: 1,
    producer: 'workorder-service',
    tenantId: randomUUID(),
    aggregateType: 'WorkOrder',
    aggregateId: workOrderId,
    occurredAt: new Date().toISOString(),
    correlationId: 'audit-m2',
    payload: {
      workOrderId,
      workOrderNo: 'WO-TEST',
      serviceRequestId: randomUUID(),
      maintenanceTaskId: null,
      equipmentId: randomUUID(),
      customerId: randomUUID(),
      type: 'REPAIR',
      priority: 'NORMAL',
    },
  };
}

describe('WorkOrderEventsConsumer contract and state protection', () => {
  function setup(status = 'PROCESSING', event = created()) {
    const row = {
      id: event.payload.serviceRequestId,
      tenantId: event.tenantId,
      equipmentId: event.payload.equipmentId,
      customerId: event.payload.customerId,
      status,
      activeWorkOrderId: event.payload.workOrderId,
    };
    const tx = {
      $executeRawUnsafe: jest.fn().mockResolvedValue(1),
      $queryRawUnsafe: jest.fn().mockResolvedValue([{ id: row.id }]),
      serviceRequest: {
        findFirst: jest.fn().mockResolvedValue(row),
        update: jest.fn(),
      },
      requestStatusHistory: { create: jest.fn() },
      workOrderLifecycle: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest
          .fn()
          .mockImplementation(({ data }) =>
            Promise.resolve({ ...data, appliedPhase: null }),
          ),
        update: jest
          .fn()
          .mockImplementation(({ data }) =>
            Promise.resolve({ ...data, terminalPhase: null }),
          ),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      workOrderLifecycleConflict: { upsert: jest.fn() },
    };
    const db = {
      $transaction: jest.fn((work: (value: typeof tx) => Promise<void>) =>
        work(tx),
      ),
    };
    return {
      tx,
      db,
      event,
      consumer: new WorkOrderEventsConsumer(db as unknown as PrismaService),
    };
  }

  it('consumes a business duplicate Created without writing another transition', async () => {
    const { consumer, event, tx } = setup();
    await consumer.handle(event);
    expect(tx.serviceRequest.update).not.toHaveBeenCalled();
    expect(tx.requestStatusHistory.create).not.toHaveBeenCalled();
  });

  it('persists a different Created while another Work Order is active', async () => {
    const { consumer, event, tx } = setup();
    const workOrderId = randomUUID();
    await consumer.handle({
      ...event,
      eventId: randomUUID(),
      aggregateId: workOrderId,
      payload: { ...event.payload, workOrderId },
    });
    expect(tx.workOrderLifecycle.create).toHaveBeenCalledTimes(1);
    expect(tx.serviceRequest.update).not.toHaveBeenCalled();
    expect(tx.requestStatusHistory.create).not.toHaveBeenCalled();
  });

  it.each(['CLOSED', 'REJECTED', 'CANCELLED'])(
    'ignores Created and Completed for terminal %s',
    async (status) => {
      const { consumer, event, tx } = setup(status);
      await consumer.handle(event);
      await consumer.handle({
        ...event,
        eventId: randomUUID(),
        eventType: 'WorkOrderCompleted',
        eventVersion: 2,
        payload: {
          ...event.payload,
          serviceReportId: randomUUID(),
          result: 'RESOLVED',
          completedAt: new Date().toISOString(),
          customerSummary: 'Customer-safe summary',
        },
      });
      expect(tx.serviceRequest.update).not.toHaveBeenCalled();
    },
  );

  it.each([false, true])(
    'persists cancellation before Created (cancelServiceRequest=%s)',
    async (cancelServiceRequest) => {
      const { consumer, event, tx } = setup('ACCEPTED');
      await consumer.handle({
        ...event,
        eventType: 'WorkOrderCancelled',
        eventVersion: 2,
        payload: {
          workOrderId: event.payload.workOrderId,
          workOrderNo: 'WO-TEST',
          serviceRequestId: event.payload.serviceRequestId,
          maintenanceTaskId: null,
          equipmentId: event.payload.equipmentId,
          reason: null,
          cancelledAt: new Date().toISOString(),
          cancelServiceRequest,
        },
      });
      expect(tx.workOrderLifecycle.create).toHaveBeenCalledTimes(1);
      expect(tx.serviceRequest.update).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['eventId', 'invalid'],
    ['tenantId', null],
    ['correlationId', 12],
    ['producer', 'asset-service'],
    ['aggregateType', 'Equipment'],
    ['eventVersion', 99],
  ])(
    'rejects invalid envelope %s before opening an inbox transaction',
    async (field, value) => {
      const { consumer, event, db } = setup();
      await expect(
        consumer.handle({ ...event, [field]: value } as EventEnvelope),
      ).rejects.toThrow();
      expect(db.$transaction).not.toHaveBeenCalled();
    },
  );

  it('rejects an incompatible v2 payload instead of treating it as v1', async () => {
    const { consumer, event, db } = setup();
    await expect(
      consumer.handle({
        ...event,
        eventType: Events.WorkOrderCompletedV2.type,
        eventVersion: 2,
        payload: {
          ...event.payload,
          serviceReportId: randomUUID(),
          result: 'RESOLVED',
          completedAt: new Date().toISOString(),
        },
      }),
    ).rejects.toThrow();
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('rejects ambiguous Work Order origin references', async () => {
    const { consumer, event, db } = setup();
    await expect(
      consumer.handle({
        ...event,
        payload: { ...event.payload, maintenanceTaskId: randomUUID() },
      }),
    ).rejects.toThrow();
    expect(db.$transaction).not.toHaveBeenCalled();
  });
});

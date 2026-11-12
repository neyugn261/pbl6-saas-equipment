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
      requestNo: 'SR-TEST',
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

  it('applies UNRESOLVED completion, moves status to ACCEPTED and records unresolvedReason in history', async () => {
    const { consumer, event, tx } = setup('PROCESSING');
    tx.serviceRequest.update.mockImplementation(({ data }) =>
      Promise.resolve({
        id: event.payload.serviceRequestId,
        tenantId: event.tenantId,
        requestNo: 'SR-TEST',
        equipmentId: event.payload.equipmentId,
        customerId: event.payload.customerId,
        ...data,
      }),
    );
    const completedEvent = {
      ...event,
      eventId: randomUUID(),
      eventType: 'WorkOrderCompleted',
      eventVersion: 2,
      payload: {
        ...event.payload,
        serviceReportId: randomUUID(),
        result: 'UNRESOLVED' as const,
        unresolvedReason:
          'Damaged motor coils; replacement parts unavailable on site',
        completedAt: new Date().toISOString(),
        customerSummary: 'Could not resolve on site',
      },
    };
    const lifecycleRow = {
      tenantId: event.tenantId,
      workOrderId: event.payload.workOrderId,
      requestId: event.payload.serviceRequestId,
      equipmentId: event.payload.equipmentId,
      customerId: event.payload.customerId,
      appliedPhase: 'CREATED',
      terminalPhase: null,
      terminalPayload: null,
    };
    tx.workOrderLifecycle.findUnique.mockResolvedValue(lifecycleRow);
    tx.workOrderLifecycle.update.mockImplementation(({ data }) =>
      Promise.resolve({
        ...lifecycleRow,
        ...data,
      }),
    );

    await consumer.handle(completedEvent);
    expect(tx.serviceRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'ACCEPTED',
          activeWorkOrderId: null,
          resolutionResult: 'UNRESOLVED',
        }),
      }),
    );
    expect(tx.requestStatusHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          oldStatus: 'PROCESSING',
          newStatus: 'ACCEPTED',
          reason:
            'Damaged motor coils; replacement parts unavailable on site',
        }),
      }),
    );
  });

  it('applies INSPECTION Created for a REVIEWING Service Request, transitioning to PROCESSING', async () => {
    const base = created();
    const inspectionEvent = {
      ...base,
      payload: {
        ...base.payload,
        type: 'INSPECTION' as const,
      },
    };
    const { consumer, tx } = setup('REVIEWING', inspectionEvent);
    tx.serviceRequest.update.mockImplementation(({ data }) =>
      Promise.resolve({
        id: inspectionEvent.payload.serviceRequestId,
        tenantId: inspectionEvent.tenantId,
        requestNo: 'SR-TEST',
        equipmentId: inspectionEvent.payload.equipmentId,
        customerId: inspectionEvent.payload.customerId,
        ...data,
      }),
    );
    await consumer.handle(inspectionEvent);
    expect(tx.serviceRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'PROCESSING',
          activeWorkOrderId: inspectionEvent.payload.workOrderId,
        }),
      }),
    );
    expect(tx.requestStatusHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          oldStatus: 'REVIEWING',
          newStatus: 'PROCESSING',
        }),
      }),
    );
  });

  it('completes INSPECTION Work Order by returning Service Request to REVIEWING instead of RESOLVED', async () => {
    const base = created();
    const inspectionEvent = {
      ...base,
      payload: {
        ...base.payload,
        type: 'INSPECTION' as const,
      },
    };
    const { consumer, tx } = setup('PROCESSING', inspectionEvent);
    tx.serviceRequest.update.mockImplementation(({ data }) =>
      Promise.resolve({
        id: inspectionEvent.payload.serviceRequestId,
        tenantId: inspectionEvent.tenantId,
        requestNo: 'SR-TEST',
        equipmentId: inspectionEvent.payload.equipmentId,
        customerId: inspectionEvent.payload.customerId,
        ...data,
      }),
    );
    const completedEvent = {
      ...inspectionEvent,
      eventId: randomUUID(),
      eventType: 'WorkOrderCompleted',
      eventVersion: 2,
      payload: {
        ...inspectionEvent.payload,
        serviceReportId: randomUUID(),
        result: 'RESOLVED' as const,
        completedAt: new Date().toISOString(),
        customerSummary:
          'Inspection completed: main bearing requires replacement',
      },
    };
    const lifecycleRow = {
      tenantId: inspectionEvent.tenantId,
      workOrderId: inspectionEvent.payload.workOrderId,
      requestId: inspectionEvent.payload.serviceRequestId,
      equipmentId: inspectionEvent.payload.equipmentId,
      customerId: inspectionEvent.payload.customerId,
      createdPayload: {
        workOrderId: inspectionEvent.payload.workOrderId,
        workOrderNo: inspectionEvent.payload.workOrderNo,
        serviceRequestId: inspectionEvent.payload.serviceRequestId,
        maintenanceTaskId: null,
        equipmentId: inspectionEvent.payload.equipmentId,
        customerId: inspectionEvent.payload.customerId,
        type: 'INSPECTION',
        priority: inspectionEvent.payload.priority,
      },
      appliedPhase: 'CREATED',
      terminalPhase: null,
      terminalPayload: null,
    };
    tx.workOrderLifecycle.findUnique.mockResolvedValue(lifecycleRow);
    tx.workOrderLifecycle.update.mockImplementation(({ data }) =>
      Promise.resolve({
        ...lifecycleRow,
        ...data,
      }),
    );

    await consumer.handle(completedEvent);
    expect(tx.serviceRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'REVIEWING',
          activeWorkOrderId: null,
          resolutionResult: 'RESOLVED',
          resolvedAt: null,
        }),
      }),
    );
    expect(tx.requestStatusHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          oldStatus: 'PROCESSING',
          newStatus: 'REVIEWING',
          reason: expect.stringContaining('Inspection completed'),
        }),
      }),
    );
  });
});

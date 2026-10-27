import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { App } from 'supertest/types';
import type { EventEnvelope, WorkOrderCreatedV1 } from '@pbl6/event-contracts';
import { WorkOrderEventsConsumer } from '../../src/events/work-order-events.consumer';
import { PrismaService } from '../../src/prisma/prisma.service';
import { createTestApp, resetDatabase } from './support/test-app';

/**
 * Opt-in diagnostic, NOT part of the green regression suite.
 * Expected to fail until the group approves durable Work Order lifecycle
 * tracking. Run with test:e2e:db --testRegex=work-order-ordering.repro.ts.
 * Never weaken the desired assertion to match the known bad behavior.
 */
describe('M2-WO-D01 — BLOCKED durable lifecycle decision', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });
  afterAll(async () => {
    await app?.close();
  });

  it('must not resurrect an ended Work Order from a new-ID duplicate Created event', async () => {
    await resetDatabase(prisma);
    const row = await prisma.serviceRequest.create({
      data: {
        tenantId: randomUUID(),
        customerId: randomUUID(),
        equipmentId: randomUUID(),
        requesterId: randomUUID(),
        requestNo: 'SR-REPRO-1',
        type: 'REPAIR',
        title: 'Ordering diagnostic',
        description: 'Test-only fixture',
        status: 'ACCEPTED',
      },
    });
    const workOrderId = randomUUID();
    const created: EventEnvelope<WorkOrderCreatedV1> = {
      eventId: randomUUID(),
      eventType: 'WorkOrderCreated',
      eventVersion: 1,
      producer: 'workorder-service',
      tenantId: row.tenantId,
      aggregateType: 'WorkOrder',
      aggregateId: workOrderId,
      occurredAt: new Date().toISOString(),
      correlationId: 'M2-WO-D01',
      payload: {
        workOrderId,
        workOrderNo: 'WO-REPRO-1',
        serviceRequestId: row.id,
        maintenanceTaskId: null,
        equipmentId: row.equipmentId,
        customerId: row.customerId,
        type: 'REPAIR',
        priority: 'NORMAL',
      },
    };
    const consumer = app.get(WorkOrderEventsConsumer);
    await consumer.handle(created);
    await consumer.handle({
      ...created,
      eventId: randomUUID(),
      eventType: 'WorkOrderCancelled',
      eventVersion: 2,
      payload: {
        workOrderId,
        workOrderNo: created.payload.workOrderNo,
        serviceRequestId: row.id,
        maintenanceTaskId: null,
        equipmentId: row.equipmentId,
        reason: null,
        cancelledAt: new Date().toISOString(),
        cancelServiceRequest: false,
      },
    });
    await consumer.handle({ ...created, eventId: randomUUID() });
    const actual = await prisma.serviceRequest.findUniqueOrThrow({
      where: { id: row.id },
    });
    expect({
      status: actual.status,
      activeWorkOrderId: actual.activeWorkOrderId,
    }).toEqual({
      status: 'ACCEPTED',
      activeWorkOrderId: null,
    });
  });
});

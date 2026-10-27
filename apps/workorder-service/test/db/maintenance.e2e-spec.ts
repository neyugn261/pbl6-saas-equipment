import { randomUUID } from 'node:crypto';
import { INestApplication, Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { configureApp } from '@pbl6/service-kit';
import { signTestAccessToken } from '@pbl6/testing';
import {
  InvalidEventError,
  type EventEnvelope,
  type MaintenanceTaskDueV1,
} from '@pbl6/event-contracts';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { REFERENCES } from '../../src/references/references.client';
import {
  MaintenanceEventsConsumer,
  MAINTENANCE_CONSUMER,
} from '../../src/events/maintenance-events.consumer';

const tenantId = randomUUID(),
  customerId = randomUUID(),
  equipmentId = randomUUID();
const foreignTenant = randomUUID(),
  techUser = randomUUID();
const manager = signTestAccessToken({ role: 'SERVICE_MANAGER', tenantId });
const technician = signTestAccessToken({
  role: 'TECHNICIAN',
  tenantId,
  userId: techUser,
});

describe('Maintenance Task to WO — real PostgreSQL, contract events; no upstream calls', () => {
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
    configureApp(app, { logger: new Logger('maintenance-db') });
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
      method.mockRejectedValue(
        new Error(
          'An event consumer must not call upstream using a fabricated token',
        ),
      );
  });
  function due(
    changes: Partial<MaintenanceTaskDueV1> = {},
  ): EventEnvelope<MaintenanceTaskDueV1> {
    const payload: MaintenanceTaskDueV1 = {
      maintenanceTaskId: randomUUID(),
      maintenancePlanId: randomUUID(),
      equipmentId,
      customerId,
      customerSiteId: randomUUID(),
      scheduledDate: '2028-02-29',
      title: 'Bảo trì định kỳ',
      ...changes,
    };
    return {
      eventId: randomUUID(),
      eventType: 'MaintenanceTaskDue',
      eventVersion: 1,
      producer: 'maintenance-service',
      tenantId,
      aggregateType: 'MaintenanceTask',
      aggregateId: payload.maintenanceTaskId,
      occurredAt: new Date().toISOString(),
      correlationId: 'maintenance-test',
      payload,
    };
  }
  const replay = (event: EventEnvelope<MaintenanceTaskDueV1>) => ({
    ...event,
    eventId: randomUUID(),
  });
  const action = (id: string, name: string, token = manager, body?: object) => {
    const r = request(app.getHttpServer())
      .post('/work-orders/' + id + '/' + name)
      .auth(token, { type: 'bearer' });
    return body === undefined ? r : r.send(body);
  };
  it('commits snapshot, Vietnam calendar date, sequence, null actor history, inbox and Created v1 atomically', async () => {
    const event = due();
    expect(await consumer.handle(event)).toBe('processed');
    const row = await db.workOrder.findFirstOrThrow();
    expect(row).toMatchObject({
      tenantId,
      equipmentId,
      customerId,
      customerSiteId: event.payload.customerSiteId,
      maintenanceTaskId: event.aggregateId,
      serviceRequestId: null,
      type: 'MAINTENANCE',
      priority: 'NORMAL',
      title: event.payload.title,
      status: 'CREATED',
      createdBy: null,
      locationId: null,
      description: null,
      scheduledEnd: null,
    });
    expect(row.scheduledStart?.toISOString()).toBe('2028-02-28T17:00:00.000Z');
    expect(row.workOrderNo).toMatch(/^WO-\d{4}-0001$/);
    expect(await db.workOrderStatusHistory.findFirstOrThrow()).toMatchObject({
      workOrderId: row.id,
      oldStatus: null,
      newStatus: 'CREATED',
      changedBy: null,
    });
    expect(await db.workLog.count()).toBe(0);
    expect(await db.processedEvent.findFirstOrThrow()).toMatchObject({
      eventId: event.eventId,
      consumer: MAINTENANCE_CONSUMER,
    });
    const outbox = await db.outboxEvent.findFirstOrThrow();
    expect(outbox).toMatchObject({
      tenantId,
      aggregateType: 'WorkOrder',
      aggregateId: row.id,
      eventType: 'WorkOrderCreated',
      eventVersion: 1,
      status: 'PENDING',
    });
    expect(outbox.payload).toEqual({
      data: {
        workOrderId: row.id,
        workOrderNo: row.workOrderNo,
        serviceRequestId: null,
        maintenanceTaskId: event.aggregateId,
        equipmentId,
        customerId,
        type: 'MAINTENANCE',
        priority: 'NORMAL',
      },
      meta: { correlationId: event.correlationId },
    });
    for (const method of Object.values(refs))
      expect(method).not.toHaveBeenCalled();
  });
  it('handles the same event concurrently once through the inbox', async () => {
    const event = due();
    expect(
      (
        await Promise.all([consumer.handle(event), consumer.handle(event)])
      ).sort(),
    ).toEqual(['duplicate', 'processed']);
    expect(await db.workOrder.count()).toBe(1);
    expect(await db.processedEvent.count()).toBe(1);
    expect(await db.outboxEvent.count()).toBe(1);
  });
  it('serializes different event IDs and mixed-case task UUIDs without a second number/history/outbox', async () => {
    const event = due(),
      other = replay(event);
    other.aggregateId = other.aggregateId.toUpperCase();
    other.payload = { ...other.payload, maintenanceTaskId: other.aggregateId };
    await Promise.all([consumer.handle(event), consumer.handle(other)]);
    expect(await db.workOrder.count()).toBe(1);
    expect(await db.outboxEvent.count()).toBe(1);
    expect(await db.workOrderStatusHistory.count()).toBe(1);
    expect(await db.processedEvent.count()).toBe(2);
    expect((await db.documentSequence.findFirstOrThrow()).lastValue).toBe(1n);
  });
  it('ignores changed replay snapshots rather than overwriting an existing WO', async () => {
    const event = due();
    await consumer.handle(event);
    const previous = await db.workOrder.findFirstOrThrow();
    const other = replay(event);
    other.payload = {
      ...event.payload,
      customerId: randomUUID(),
      title: 'Changed snapshot',
      scheduledDate: '2030-12-31',
    };
    await consumer.handle(other);
    expect(await db.workOrder.findFirstOrThrow()).toEqual(previous);
  });
  it('supports null site and correlation and preserves canonical PostgreSQL UUID values', async () => {
    const event = due({ customerSiteId: null });
    event.tenantId = tenantId.toUpperCase();
    event.payload.equipmentId = equipmentId.toUpperCase();
    event.correlationId = null;
    await consumer.handle(event);
    expect(await db.workOrder.findFirstOrThrow()).toMatchObject({
      tenantId,
      equipmentId,
      customerSiteId: null,
    });
    expect((await db.outboxEvent.findFirstOrThrow()).payload).toMatchObject({
      meta: { correlationId: null },
    });
  });
  it('does not automatically recreate a cancelled WO when old or new due delivery arrives', async () => {
    const event = due();
    await consumer.handle(event);
    const row = await db.workOrder.findFirstOrThrow();
    await action(row.id, 'cancel', manager, {
      reason: 'Manager will decide replacement',
    }).expect(200);
    expect(await consumer.handle(event)).toBe('duplicate');
    await consumer.handle(replay(event));
    expect(await db.workOrder.count()).toBe(1);
    expect((await db.workOrder.findFirstOrThrow()).status).toBe('CANCELLED');
    expect(
      await db.outboxEvent.count({ where: { eventType: 'WorkOrderCreated' } }),
    ).toBe(1);
    expect(await db.workLog.count()).toBe(1); // only the real manager's cancellation
    expect(
      (
        await db.outboxEvent.findFirstOrThrow({
          where: { eventType: 'WorkOrderCancelled' },
        })
      ).payload,
    ).toMatchObject({
      data: {
        serviceRequestId: null,
        maintenanceTaskId: event.aggregateId,
        cancelServiceRequest: false,
      },
    });
  });
  it('completes a maintenance WO with v2 result and never duplicates it on due replay', async () => {
    const event = due();
    await consumer.handle(event);
    const row = await db.workOrder.findFirstOrThrow();
    const tech = await db.technician.create({
      data: {
        tenantId,
        userId: techUser,
        branchId: randomUUID(),
        employeeCode: 'MAINT-TECH',
      },
    });
    await action(row.id, 'assign', manager, { technicianId: tech.id }).expect(
      200,
    );
    await action(row.id, 'accept', technician).expect(200);
    await action(row.id, 'start', technician).expect(200);
    await action(row.id, 'complete', technician, {
      problemDescription: 'Scheduled checks',
      solution: 'Checked equipment',
      result: 'RESOLVED',
      customerSummary: 'Maintenance completed',
    }).expect(200);
    await consumer.handle(replay(event));
    expect(await db.workOrder.count()).toBe(1);
    expect((await db.workOrder.findFirstOrThrow()).status).toBe('COMPLETED');
    expect(await db.serviceReport.count()).toBe(1);
    expect(await db.workOrderAssignment.findFirstOrThrow()).toMatchObject({
      status: 'COMPLETED',
    });
    expect(await db.technician.findFirstOrThrow()).toMatchObject({
      status: 'AVAILABLE',
    });
    expect(
      await db.outboxEvent.findFirstOrThrow({
        where: { eventType: 'WorkOrderCompleted' },
      }),
    ).toMatchObject({
      eventVersion: 2,
      payload: {
        data: {
          maintenanceTaskId: event.aggregateId,
          serviceRequestId: null,
          customerSummary: 'Maintenance completed',
        },
      },
    });
  });
  it('enforces the database constraint even for a completed task but permits a separately authorized replacement after cancellation', async () => {
    const event = due();
    await consumer.handle(event);
    const row = await db.workOrder.findFirstOrThrow();
    await db.workOrder.update({
      where: { id: row.id },
      data: { status: 'COMPLETED' },
    });
    const replacement = {
      tenantId,
      workOrderNo: 'WO-CONSTRAINT-REPLACEMENT',
      maintenanceTaskId: event.aggregateId,
      equipmentId,
      customerId,
      type: 'MAINTENANCE',
      title: 'Constraint test',
      createdBy: null,
    };
    await expect(
      db.workOrder.create({ data: replacement }),
    ).rejects.toMatchObject({ code: 'P2002' });
    await db.workOrder.update({
      where: { id: row.id },
      data: { status: 'CANCELLED' },
    });
    await db.workOrder.create({ data: replacement });
    expect(await db.workOrder.count()).toBe(2); // constraint only, not a replacement API
  });
  it('rejects a task UUID already owned by another tenant and rolls back its inbox', async () => {
    const event = due();
    await consumer.handle(event);
    const other = replay(event);
    other.tenantId = foreignTenant;
    await expect(consumer.handle(other)).rejects.toThrow('tenant mismatch');
    expect(await db.workOrder.count()).toBe(1);
    expect(
      await db.processedEvent.count({ where: { eventId: other.eventId } }),
    ).toBe(0);
    other.tenantId = tenantId;
    expect(await consumer.handle(other)).toBe('processed');
  });
  it.each([
    'tenant',
    'aggregate',
    'producer',
    'aggregateType',
    'invalidPayload',
    'impossibleDate',
    'nonLeapDay',
    'yearZero',
  ])('refuses %s without consuming inbox or sequence', async (name) => {
    const event = due();
    if (name === 'tenant') event.tenantId = null;
    if (name === 'aggregate') event.aggregateId = randomUUID();
    if (name === 'producer') event.producer = 'asset-service';
    if (name === 'aggregateType') event.aggregateType = 'Equipment';
    if (name === 'invalidPayload') event.payload.equipmentId = 'invalid';
    if (name === 'impossibleDate') event.payload.scheduledDate = '2026-04-31';
    if (name === 'nonLeapDay') event.payload.scheduledDate = '2026-02-29';
    if (name === 'yearZero') event.payload.scheduledDate = '0000-01-01';
    await expect(consumer.handle(event)).rejects.toBeInstanceOf(
      InvalidEventError,
    );
    expect(await db.workOrder.count()).toBe(0);
    expect(await db.processedEvent.count()).toBe(0);
    expect(await db.documentSequence.count()).toBe(0);
  });
  it('rolls back inbox, sequence, WO and history when Created outbox fails, then retries the same event successfully', async () => {
    const event = due();
    await db.$executeRawUnsafe(
      "ALTER TABLE outbox_events ADD CONSTRAINT maintenance_reject_created CHECK (event_type <> 'WorkOrderCreated')",
    );
    try {
      await expect(consumer.handle(event)).rejects.toThrow();
      for (const count of [
        await db.workOrder.count(),
        await db.workOrderStatusHistory.count(),
        await db.processedEvent.count(),
        await db.documentSequence.count(),
        await db.outboxEvent.count(),
      ])
        expect(count).toBe(0);
    } finally {
      await db.$executeRawUnsafe(
        'ALTER TABLE outbox_events DROP CONSTRAINT maintenance_reject_created',
      );
    }
    expect(await consumer.handle(event)).toBe('processed');
    expect((await db.workOrder.findFirstOrThrow()).workOrderNo).toMatch(
      /-0001$/,
    );
  });
  it('allocates unique numbers for concurrent maintenance and SR creation in the same tenant', async () => {
    const events = Array.from({ length: 4 }, () => due());
    const source = {
      id: randomUUID(),
      status: 'ACCEPTED',
      equipmentId,
      customerId,
      type: 'REPAIR',
      priority: 'NORMAL',
      title: 'SR concurrent',
    };
    refs.request.mockResolvedValue(source);
    refs.equipment.mockResolvedValue({
      id: equipmentId,
      customerId,
      customerSiteId: null,
      locationId: null,
    });
    await Promise.all([
      ...events.map((event) => consumer.handle(event)),
      request(app.getHttpServer())
        .post('/work-orders')
        .auth(manager, { type: 'bearer' })
        .send({ serviceRequestId: source.id })
        .expect(201),
    ]);
    const rows = await db.workOrder.findMany();
    expect(rows).toHaveLength(5);
    expect(new Set(rows.map((row) => row.workOrderNo)).size).toBe(5);
    expect((await db.documentSequence.findFirstOrThrow()).lastValue).toBe(5n);
    expect(await db.outboxEvent.count()).toBe(5);
  });
  it('keeps event-created WO reads in normal tenant/assignment scope', async () => {
    await consumer.handle(due());
    const row = await db.workOrder.findFirstOrThrow();
    const read = (token: string) =>
      request(app.getHttpServer())
        .get('/work-orders/' + row.id)
        .auth(token, { type: 'bearer' });
    await read(manager).expect(200);
    await read(
      signTestAccessToken({ role: 'SERVICE_MANAGER', tenantId: foreignTenant }),
    ).expect(404);
    await read(technician).expect(404);
    await read(
      signTestAccessToken({ role: 'CUSTOMER_ADMIN', tenantId, customerId }),
    ).expect(403);
  });
  it('ignores events of another type or version without writes', async () => {
    const event = due();
    event.eventVersion = 2;
    await consumer.handle(event);
    event.eventVersion = 1;
    event.eventType = 'WorkOrderCreated';
    await consumer.handle(event);
    expect(await db.processedEvent.count()).toBe(0);
    expect(await db.workOrder.count()).toBe(0);
  });
});

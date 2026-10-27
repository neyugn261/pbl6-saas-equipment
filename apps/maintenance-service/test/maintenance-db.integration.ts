import { randomUUID } from 'node:crypto';
import { INestApplication, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { signTestAccessToken } from '@pbl6/testing';
import { configureApp, UpstreamUnavailableError } from '@pbl6/service-kit';
import {
  Events,
  InvalidEventError,
  OutboxRelay,
  type EventDefinition,
  type EventEnvelope,
} from '@pbl6/event-contracts';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { ASSET_CLIENT } from '../src/asset/asset.client';
import { SchedulerService } from '../src/scheduler/scheduler.service';
import {
  EquipmentEventsConsumer,
  EQUIPMENT_CONSUMER,
} from '../src/events/equipment-events.consumer';
import {
  WorkOrderEventsConsumer,
  WORK_ORDER_CONSUMER,
} from '../src/events/work-order-events.consumer';
import { calendarDate, vietnamToday } from '../src/common/calendar';

describe('Maintenance API, scheduler and inbox on PostgreSQL (explicit fake Asset)', () => {
  let app: INestApplication;
  let db: PrismaService;
  let tenantId: string,
    customerId: string,
    equipmentId: string,
    siteId: string,
    actorId: string,
    manager: string;
  const tenants: string[] = [];
  const eventIds: string[] = [];
  const asset = { equipment: jest.fn() };
  let scheduler: SchedulerService,
    equipmentConsumer: EquipmentEventsConsumer,
    workOrders: WorkOrderEventsConsumer;
  const headers = (token = manager) => ({ authorization: 'Bearer ' + token });
  const customerToken = (id = customerId) =>
    signTestAccessToken({ role: 'CUSTOMER_ADMIN', tenantId, customerId: id });
  const create = (extra: object = {}) =>
    request(app.getHttpServer())
      .post('/maintenance-plans')
      .set(headers())
      .send({
        equipmentId,
        name: 'Monthly pump inspection',
        frequencyUnit: 'MONTH',
        frequencyValue: 1,
        nextDueDate: '2026-01-31',
        ...extra,
      });
  const tick = (day = '2026-02-28') => scheduler.tick(day, tenantId);
  const env = (
    definition: EventDefinition,
    payload: unknown,
    overrides: Partial<EventEnvelope> = {},
  ): EventEnvelope => {
    const eventId = randomUUID();
    eventIds.push(eventId);
    return {
      eventId,
      eventType: definition.type,
      eventVersion: definition.version,
      producer: definition.producer,
      tenantId,
      aggregateType: definition.aggregateType,
      aggregateId:
        definition.aggregateType === 'Equipment'
          ? equipmentId
          : (payload as { workOrderId: string }).workOrderId,
      occurredAt: '2026-03-01T01:00:00Z',
      correlationId: 'maintenance-db-test',
      payload,
      ...overrides,
    };
  };
  const wo = (taskId: string, workOrderId = randomUUID()) => ({
    workOrderId,
    workOrderNo: 'WO-TEST-001',
    equipmentId,
    customerId,
    serviceRequestId: null,
    maintenanceTaskId: taskId,
    type: 'MAINTENANCE',
    priority: 'NORMAL',
  });
  const completed = (source: ReturnType<typeof wo>, result = 'RESOLVED') => {
    const { type: _type, priority: _priority, ...origin } = source;
    return env(Events.WorkOrderCompletedV2, {
      ...origin,
      serviceReportId: randomUUID(),
      result,
      customerSummary: 'Inspection complete',
      completedAt: '2026-03-02T01:00:00Z',
    });
  };
  const cancelled = (source: ReturnType<typeof wo>) => {
    const {
      type: _type,
      priority: _priority,
      customerId: _customerId,
      ...origin
    } = source;
    return env(Events.WorkOrderCancelledV2, {
      ...origin,
      reason: 'Internal scheduling reason',
      cancelledAt: '2026-03-01T02:00:00Z',
      cancelServiceRequest: false,
    });
  };
  async function taskFixture() {
    const plan = (await create().expect(201)).body;
    await tick();
    const task = await db.maintenanceTask.findFirstOrThrow({
      where: { maintenancePlanId: plan.id },
    });
    return { plan, task };
  }
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ASSET_CLIENT)
      .useValue(asset)
      .compile();
    app = module.createNestApplication({ logger: false });
    configureApp(app, { logger: new Logger('maintenance-db') });
    await app.init();
    db = app.get(PrismaService);
    scheduler = app.get(SchedulerService);
    equipmentConsumer = app.get(EquipmentEventsConsumer);
    workOrders = app.get(WorkOrderEventsConsumer);
  });
  beforeEach(() => {
    tenantId = randomUUID();
    customerId = randomUUID();
    equipmentId = randomUUID();
    siteId = randomUUID();
    actorId = randomUUID();
    tenants.push(tenantId);
    manager = signTestAccessToken({
      role: 'SERVICE_MANAGER',
      tenantId,
      userId: actorId,
    });
    asset.equipment.mockReset().mockImplementation(async (id: string) => ({
      id,
      customerId,
      customerSiteId: siteId,
      snapshotVersion: 0,
      status: 'ACTIVE',
    }));
  });
  afterAll(async () => {
    if (db) {
      const where = { tenantId: { in: tenants } };
      await db.maintenanceReplacementRequest.deleteMany({ where });
      await db.maintenanceWorkOrderLink.deleteMany({ where });
      await db.maintenanceTask.deleteMany({ where });
      await db.maintenanceHistory.deleteMany({ where });
      await db.maintenancePlan.deleteMany({ where });
      await db.equipmentSnapshot.deleteMany({ where });
      await db.outboxEvent.deleteMany({ where });
      await db.processedEvent.deleteMany({
        where: { eventId: { in: eventIds } },
      });
    }
    await app?.close();
  });
  it('creates scoped snapshot Plans and validates permissions and reference ownership', async () => {
    const { body: plan } = await create().expect(201);
    expect(plan).toMatchObject({
      customerId,
      customerSiteId: siteId,
      status: 'ACTIVE',
      nextDueDate: '2026-01-31',
    });
    expect(plan).not.toHaveProperty('tenantId');
    expect(asset.equipment.mock.calls[0][1].accessToken).toBe(manager);
    await request(app.getHttpServer())
      .get(`/maintenance-plans/${plan.id}`)
      .expect(401);
    for (const role of [
      'CUSTOMER_USER',
      'TECHNICIAN',
      'INVENTORY_STAFF',
    ] as const) {
      const token = signTestAccessToken({ role, tenantId, customerId });
      await request(app.getHttpServer())
        .get('/maintenance-plans')
        .set(headers(token))
        .expect(403);
    }
    const customer = customerToken();
    await request(app.getHttpServer())
      .get(`/maintenance-plans/${plan.id}`)
      .set(headers(customer))
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/maintenance-plans/${plan.id}`)
      .set(headers(customer))
      .send({ name: 'illegal' })
      .expect(403);
    const stranger = signTestAccessToken({
      role: 'SERVICE_MANAGER',
      tenantId: randomUUID(),
    });
    for (const token of [stranger, customerToken(randomUUID())]) {
      await request(app.getHttpServer())
        .get(`/maintenance-plans/${plan.id}`)
        .set(headers(token))
        .expect(404);
      const list = await request(app.getHttpServer())
        .get('/maintenance-plans')
        .set(headers(token))
        .expect(200);
      expect(list.body.total).toBe(0);
    }
    const list = await request(app.getHttpServer())
      .get(
        `/maintenance-plans?equipmentId=${equipmentId}&status=ACTIVE&pageSize=1`,
      )
      .set(headers())
      .expect(200);
    expect(list.body.total).toBe(1);
    expect(list.body.items).toHaveLength(1);
  });
  it('rejects invalid dates/frequencies, blank names, nulls and client-supplied snapshots', async () => {
    for (const data of [
      { nextDueDate: '2026-02-29' },
      { nextDueDate: '0000-01-01' },
      { frequencyValue: 0 },
      { frequencyValue: 1.5 },
      { name: '  ' },
      { name: null },
      { frequencyUnit: 'HOUR' },
      { customerId },
      { tenantId },
      { status: 'ACTIVE' },
    ])
      await create(data).expect(400);
    expect(await db.maintenancePlan.count({ where: { tenantId } })).toBe(0);
  });
  it('does not write a Plan on missing/retired equipment or upstream failure', async () => {
    asset.equipment.mockResolvedValueOnce(null);
    await create().expect(422);
    asset.equipment.mockResolvedValueOnce({
      id: equipmentId,
      customerId,
      status: 'RETIRED',
      snapshotVersion: 0,
    });
    await create().expect(422);
    asset.equipment.mockRejectedValueOnce(
      new UpstreamUnavailableError('asset-service', new Error('offline')),
    );
    await create().expect(503);
    expect(await db.maintenancePlan.count({ where: { tenantId } })).toBe(0);
  });
  it('merges an earlier-delivered move with an older Asset lookup and rejects replay/out-of-order moves', async () => {
    const site2 = randomUUID();
    const move = env(Events.EquipmentMoved, {
      equipmentId,
      customerId,
      customerSiteId: site2,
      locationId: null,
      snapshotVersion: 2,
      changedAt: '2026-02-01T00:00:00Z',
    });
    await equipmentConsumer.handle(move);
    const plan = (await create().expect(201)).body;
    expect(plan.customerSiteId).toBe(site2);
    await equipmentConsumer.handle(move);
    await equipmentConsumer.handle(
      env(Events.EquipmentMoved, {
        equipmentId,
        customerId,
        customerSiteId: siteId,
        locationId: null,
        snapshotVersion: 1,
        changedAt: '2026-01-01T00:00:00Z',
      }),
    );
    expect(
      (await db.maintenancePlan.findUniqueOrThrow({ where: { id: plan.id } }))
        .snapshotVersion,
    ).toBe(2);
    const wrong = { ...move, eventId: randomUUID(), tenantId: randomUUID() };
    await expect(equipmentConsumer.handle(wrong)).rejects.toBeInstanceOf(
      InvalidEventError,
    );
    expect(
      await db.processedEvent.count({ where: { eventId: wrong.eventId } }),
    ).toBe(0);
    expect(
      await db.processedEvent.count({
        where: { eventId: move.eventId, consumer: EQUIPMENT_CONSUMER },
      }),
    ).toBe(1);
  });
  it('uses one transaction for due Task, outbox and advancement; repeated/concurrent ticks cannot duplicate', async () => {
    const plan = (await create().expect(201)).body;
    const other = new SchedulerService(db, new ConfigService());
    const counts = await Promise.all([
      tick('2026-05-20'),
      other.tick('2026-05-20', tenantId),
    ]);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(1);
    expect(await tick('2026-05-20')).toBe(0);
    const tasks = await db.maintenanceTask.findMany({ where: { tenantId } });
    expect(tasks).toHaveLength(1);
    expect(tasks[0].scheduledDate).toEqual(calendarDate('2026-04-30'));
    expect(
      (await db.maintenancePlan.findUniqueOrThrow({ where: { id: plan.id } }))
        .nextDueDate,
    ).toEqual(calendarDate('2026-05-31'));
    expect(
      await db.outboxEvent.count({
        where: { tenantId, eventType: 'MaintenanceTaskDue' },
      }),
    ).toBe(1);
    const list = await request(app.getHttpServer())
      .get(`/maintenance-tasks?planId=${plan.id}&status=PENDING`)
      .set(headers(customerToken()))
      .expect(200);
    expect(list.body.total).toBe(1);
    await request(app.getHttpServer())
      .get(`/maintenance-tasks/${tasks[0].id}`)
      .set(headers(customerToken(randomUUID())))
      .expect(404);
  });
  it('serializes Plan creation with moves and updates every Plan without snapshot regression', async () => {
    await create().expect(201);
    const site3 = randomUUID();
    const move = (version: number, site: string) =>
      env(Events.EquipmentMoved, {
        equipmentId,
        customerId,
        customerSiteId: site,
        locationId: null,
        snapshotVersion: version,
        changedAt: '2026-02-01T00:00:00Z',
      });
    await Promise.all([
      create().expect(201),
      equipmentConsumer.handle(move(3, site3)),
    ]);
    await equipmentConsumer.handle(move(2, siteId));
    const rows = await db.maintenancePlan.findMany({ where: { tenantId } });
    expect(rows).toHaveLength(2);
    expect(
      rows.every(
        (row) => row.snapshotVersion === 3 && row.customerSiteId === site3,
      ),
    ).toBe(true);
  });
  it('rolls back Task and nextDueDate when the outbox insert fails', async () => {
    const plan = (await create().expect(201)).body;
    const broken = {
      $transaction: (fn: (tx: unknown) => Promise<number>) =>
        db.$transaction(async (tx) =>
          fn(
            new Proxy(tx, {
              get(target, key) {
                if (key === '$executeRawUnsafe')
                  return async () => {
                    throw new Error('injected outbox failure');
                  };
                return Reflect.get(target, key);
              },
            }),
          ),
        ),
    } as unknown as PrismaService;
    await expect(
      new SchedulerService(broken, new ConfigService()).tick(
        '2026-02-28',
        tenantId,
      ),
    ).rejects.toThrow('injected outbox failure');
    expect(await db.maintenanceTask.count({ where: { tenantId } })).toBe(0);
    expect(
      (await db.maintenancePlan.findUniqueOrThrow({ where: { id: plan.id } }))
        .nextDueDate,
    ).toEqual(calendarDate('2026-01-31'));
  });
  it('keeps outbox pending without spending publish attempts during a known broker outage', async () => {
    await taskFixture();
    const publisher = { isReady: () => false, publish: jest.fn() };
    const relay = new OutboxRelay({
      db,
      publisher,
      producer: 'maintenance-service',
    });
    await relay.runOnce();
    const event = await db.outboxEvent.findFirstOrThrow({
      where: { tenantId },
    });
    expect(event.status).toBe('PENDING');
    expect(event.attemptCount).toBe(0);
    expect(publisher.publish).not.toHaveBeenCalled();
  });
  it('pauses without catch-up, resumes from today, preserves tasks on schedule edits and makes INACTIVE terminal', async () => {
    const { plan, task } = await taskFixture();
    const patch = (body: object) =>
      request(app.getHttpServer())
        .patch(`/maintenance-plans/${plan.id}`)
        .set(headers())
        .send(body);
    await patch({ status: 'PAUSED' }).expect(200);
    expect(await tick('2028-01-31')).toBe(0);
    const resumed = await patch({ status: 'ACTIVE' }).expect(200);
    expect(resumed.body.nextDueDate).toBe(vietnamToday());
    await patch({
      frequencyUnit: 'WEEK',
      frequencyValue: 2,
      nextDueDate: '2027-01-01',
    }).expect(200);
    expect(
      (await db.maintenanceTask.findUniqueOrThrow({ where: { id: task.id } }))
        .scheduledDate,
    ).toEqual(task.scheduledDate);
    await patch({ status: 'INACTIVE' }).expect(200);
    await patch({ status: 'ACTIVE' }).expect(409);
    await patch({ nextDueDate: '2027-02-01' }).expect(409);
    await patch({}).expect(400);
    expect(await tick('2029-01-01')).toBe(0);
  });
  it('skips a Plan whose snapshot is known locally to be stale', async () => {
    const plan = (await create().expect(201)).body;
    await db.equipmentSnapshot.update({
      where: { tenantId_equipmentId: { tenantId, equipmentId } },
      data: { snapshotVersion: 3 },
    });
    expect(await tick()).toBe(0);
    expect(
      await db.maintenanceTask.count({ where: { maintenancePlanId: plan.id } }),
    ).toBe(0);
  });
  it('handles completion before Created, inbox duplicates and late cancellation without regressing the task', async () => {
    const { plan, task } = await taskFixture();
    const source = wo(task.id);
    const done = completed(source);
    await workOrders.handle(done);
    await workOrders.handle(done);
    await workOrders.handle(env(Events.WorkOrderCreated, source));
    await workOrders.handle(cancelled(source));
    expect(
      await db.maintenanceTask.findUniqueOrThrow({ where: { id: task.id } }),
    ).toMatchObject({ status: 'COMPLETED', workOrderId: source.workOrderId });
    expect(
      (await db.maintenancePlan.findUniqueOrThrow({ where: { id: plan.id } }))
        .lastCompletedAt,
    ).toEqual(new Date('2026-03-02T01:00:00Z'));
    expect(
      await db.processedEvent.count({
        where: { eventId: done.eventId, consumer: WORK_ORDER_CONSUMER },
      }),
    ).toBe(1);
  });
  it('marks UNRESOLVED FAILED and leaves lastCompletedAt unchanged', async () => {
    const { plan, task } = await taskFixture();
    await workOrders.handle(completed(wo(task.id), 'UNRESOLVED'));
    expect(
      (await db.maintenanceTask.findUniqueOrThrow({ where: { id: task.id } }))
        .status,
    ).toBe('FAILED');
    expect(
      (await db.maintenancePlan.findUniqueOrThrow({ where: { id: plan.id } }))
        .lastCompletedAt,
    ).toBeNull();
  });
  it('keeps lastCompletedAt monotonic across late successful events and retains the fixed schedule', async () => {
    const { plan, task } = await taskFixture();
    await tick('2026-03-31');
    const newerTask = await db.maintenanceTask.findFirstOrThrow({
      where: { tenantId, scheduledDate: calendarDate('2026-03-31') },
    });
    const newer = completed(wo(newerTask.id), 'PARTIALLY_RESOLVED');
    newer.payload = {
      ...(newer.payload as object),
      completedAt: '2026-04-01T00:00:00Z',
    };
    await workOrders.handle(newer);
    await workOrders.handle(completed(wo(task.id)));
    const updated = await db.maintenancePlan.findUniqueOrThrow({
      where: { id: plan.id },
    });
    expect(updated.lastCompletedAt).toEqual(new Date('2026-04-01T00:00:00Z'));
    expect(updated.anchorDate).toEqual(calendarDate('2026-01-31'));
    expect(updated.nextDueDate).toEqual(calendarDate('2026-04-30'));
  });
  it('records cancellation before Created; replacement is explicit, durable and idempotent', async () => {
    const { task } = await taskFixture();
    const original = wo(task.id);
    await workOrders.handle(cancelled(original));
    await workOrders.handle(env(Events.WorkOrderCreated, original));
    expect(
      (await db.maintenanceTask.findUniqueOrThrow({ where: { id: task.id } }))
        .status,
    ).toBe('PENDING');
    const requestId = randomUUID();
    const replace = (id: string) =>
      request(app.getHttpServer())
        .post(`/maintenance-tasks/${task.id}/replacement`)
        .set(headers())
        .send({ requestId: id });
    const response = await replace(requestId).expect(201);
    const replay = await replace(requestId).expect(201);
    expect(replay.body.replacementWorkOrderId).toBe(
      response.body.replacementWorkOrderId,
    );
    await replace(randomUUID()).expect(409);
    expect(
      await db.outboxEvent.count({
        where: {
          tenantId,
          eventType: 'MaintenanceWorkOrderReplacementRequested',
        },
      }),
    ).toBe(1);
    const replacement = wo(task.id, response.body.replacementWorkOrderId);
    await workOrders.handle(env(Events.WorkOrderCreated, replacement));
    await workOrders.handle(cancelled(original));
    expect(
      await db.maintenanceTask.findUniqueOrThrow({ where: { id: task.id } }),
    ).toMatchObject({
      status: 'WORK_ORDER_CREATED',
      workOrderId: replacement.workOrderId,
    });
    await workOrders.handle(completed(replacement));
    await workOrders.handle(env(Events.WorkOrderCreated, original));
    expect(
      (await db.maintenanceTask.findUniqueOrThrow({ where: { id: task.id } }))
        .status,
    ).toBe('COMPLETED');
  });
  it('exposes complete Plan/Task audit, frozen context, exact counts and a scoped cancellation journey', async () => {
    const { task, plan } = await taskFixture();
    const source = wo(task.id);
    const event = cancelled(source);
    await workOrders.handle(event);
    await workOrders.handle(event);
    const read = (path: string, token = manager) =>
      request(app.getHttpServer()).get(path).set(headers(token));
    const journey = (
      await read(`/maintenance-tasks/${task.id}/journey`).expect(200)
    ).body;
    expect(journey).toMatchObject({
      waitingFor: 'SERVICE_MANAGER',
      allowedActions: ['request-replacement'],
      workOrders: [{ workOrderId: source.workOrderId, state: 'CANCELLED' }],
    });
    expect(
      journey.history.items.filter(
        (row: { eventType: string }) =>
          row.eventType === 'WORK_ORDER_CANCELLED',
      ),
    ).toHaveLength(1);
    expect(JSON.stringify(journey)).not.toContain('Internal scheduling reason');
    await request(app.getHttpServer())
      .patch(`/maintenance-plans/${plan.id}`)
      .set(headers())
      .send({ frequencyValue: 2, name: 'Revised plan' })
      .expect(200);
    const audit = (
      await read(`/maintenance-plans/${plan.id}/history`).expect(200)
    ).body;
    expect(
      audit.items.find(
        (row: { eventType: string }) => row.eventType === 'PLAN_UPDATED',
      ),
    ).toMatchObject({
      actorId,
      actorRoles: ['SERVICE_MANAGER'],
      changes: { frequencyValue: { before: 1, after: 2 } },
    });
    expect(
      audit.items.find(
        (row: { eventType: string }) => row.eventType === 'TASK_GENERATED',
      ).context.planName,
    ).toBe('Monthly pump inspection');
    const summary = (
      await read(`/maintenance-summary?equipmentId=${equipmentId}`).expect(200)
    ).body;
    expect(summary).toMatchObject({
      taskCounts: { PENDING: 1 },
      attentionTotal: 1,
      overdueOpenTaskCount: 1,
      nextDue: { planId: plan.id },
    });
    expect(
      (await read(`/maintenance-tasks?equipmentId=${randomUUID()}`).expect(200))
        .body.total,
    ).toBe(0);
    const customerJourney = (
      await read(
        `/maintenance-tasks/${task.id}/journey`,
        customerToken(),
      ).expect(200)
    ).body;
    expect(customerJourney.allowedActions).toEqual([]);
    expect(
      customerJourney.history.items.every(
        (row: { actorId: unknown }) => row.actorId === null,
      ),
    ).toBe(true);
    await read(
      `/maintenance-tasks/${task.id}/journey`,
      customerToken(randomUUID()),
    ).expect(404);
    expect(
      (
        await read('/maintenance-history', customerToken(randomUUID())).expect(
          200,
        )
      ).body.total,
    ).toBe(0);
    await read('/maintenance-history?from=2026-03-01&to=2026-01-01').expect(
      400,
    );
  });
  it('rejects missing, wrong-tenant/equipment/customer and unrequested replacement events without inbox commits', async () => {
    const { task } = await taskFixture();
    const source = wo(task.id);
    await workOrders.handle(env(Events.WorkOrderCreated, source));
    const missing = env(Events.WorkOrderCreated, {
      ...source,
      maintenanceTaskId: randomUUID(),
    });
    await expect(workOrders.handle(missing)).rejects.toThrow('not available');
    for (const event of [
      env(Events.WorkOrderCreated, source, { tenantId: randomUUID() }),
      env(Events.WorkOrderCreated, { ...source, equipmentId: randomUUID() }),
      env(Events.WorkOrderCreated, { ...source, customerId: randomUUID() }),
      env(Events.WorkOrderCreated, wo(task.id)),
    ]) {
      await expect(workOrders.handle(event)).rejects.toBeInstanceOf(
        InvalidEventError,
      );
      expect(
        await db.processedEvent.count({ where: { eventId: event.eventId } }),
      ).toBe(0);
    }
    expect(
      await db.processedEvent.count({ where: { eventId: missing.eventId } }),
    ).toBe(0);
  });
});

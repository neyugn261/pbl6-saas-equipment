import { randomUUID } from 'node:crypto';
import { INestApplication, Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { configureApp, UpstreamUnavailableError } from '@pbl6/service-kit';
import { signTestAccessToken } from '@pbl6/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import {
  REFERENCES,
  type ReferencesClient,
  type RequestRef,
} from '../../src/references/references.client';

const tenantId = randomUUID(),
  otherTenant = randomUUID(),
  actor = randomUUID(),
  technicianUser = randomUUID();
const branchId = randomUUID(),
  equipmentId = randomUUID(),
  customerId = randomUUID(),
  siteId = randomUUID();
const manager = signTestAccessToken({
  role: 'SERVICE_MANAGER',
  tenantId,
  userId: actor,
});
const technicianToken = signTestAccessToken({
  role: 'TECHNICIAN',
  tenantId,
  userId: technicianUser,
});
const authorization = (token = manager) => ({
  Authorization: 'Bearer ' + token,
});

describe('Work Order week 1 — real PostgreSQL, explicit fake upstreams', () => {
  let app: INestApplication<App>;
  let db: PrismaService;
  let sources: Map<string, RequestRef>;
  const refs = {
    user: jest.fn(),
    branch: jest.fn(),
    request: jest.fn(),
    equipment: jest.fn(),
  } satisfies Record<keyof ReferencesClient, jest.Mock>;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(REFERENCES)
      .useValue(refs)
      .compile();
    app = module.createNestApplication({ logger: false });
    configureApp(app, { logger: new Logger('workorder-db-test') });
    await app.init();
    db = app.get(PrismaService);
  });
  afterAll(async () => {
    await app?.close();
  });
  beforeEach(async () => {
    await db.$executeRawUnsafe(
      'TRUNCATE report_attachments, service_reports, work_order_attachments, work_logs, work_order_assignments, work_order_status_history, work_orders, technician_skills, skills, technicians, document_sequences, outbox_events, processed_events',
    );
    jest.clearAllMocks();
    sources = new Map();
    refs.user.mockImplementation(async (id: string) => ({
      id,
      tenantId,
      userType: 'TENANT_STAFF',
      roles: ['TECHNICIAN'],
      status: 'ACTIVE',
    }));
    refs.branch.mockResolvedValue({ id: branchId, status: 'ACTIVE' });
    refs.request.mockImplementation(
      async (id: string) => sources.get(id) ?? null,
    );
    refs.equipment.mockResolvedValue({
      id: equipmentId,
      customerId,
      customerSiteId: siteId,
      locationId: null,
    });
  });
  function source(overrides: Partial<RequestRef> = {}) {
    const row = {
      id: randomUUID(),
      status: 'ACCEPTED',
      equipmentId,
      customerId,
      type: 'REPAIR',
      priority: 'NORMAL',
      title: 'Repair pump',
      ...overrides,
    };
    sources.set(row.id, row);
    return row;
  }
  const postWO = (id: string, extra: object = {}) =>
    request(app.getHttpServer())
      .post('/work-orders')
      .set(authorization())
      .send({ serviceRequestId: id, ...extra });
  const postTechnician = (extra: object = {}) =>
    request(app.getHttpServer())
      .post('/technicians')
      .set(authorization())
      .send({
        userId: technicianUser,
        branchId,
        employeeCode: 'TECH-01',
        ...extra,
      });

  it('creates a technician, supports me, and never returns tenant metadata', async () => {
    const created = await postTechnician().expect(201);
    expect(created.body).toMatchObject({
      userId: technicianUser,
      status: 'AVAILABLE',
      skills: [],
    });
    expect(created.body).not.toHaveProperty('tenantId');
    expect(refs.user).toHaveBeenCalledWith(technicianUser, manager);
    await request(app.getHttpServer())
      .get('/technicians/me')
      .set(authorization(technicianToken))
      .expect(200)
      .expect((r) => expect(r.body.id).toBe(created.body.id));
    const list = await request(app.getHttpServer())
      .get('/technicians?q=TECH&pageSize=1')
      .set(authorization())
      .expect(200);
    expect(list.body.total).toBe(1);
    await postTechnician().expect(409);
  });
  it('does not grant Dispatcher technician management or Technician work order management', async () => {
    const dispatcher = signTestAccessToken({ role: 'DISPATCHER', tenantId });
    await request(app.getHttpServer())
      .post('/technicians')
      .set(authorization(dispatcher))
      .send({ userId: technicianUser, branchId, employeeCode: 'X' })
      .expect(403);
    await request(app.getHttpServer())
      .post('/work-orders')
      .set(authorization(technicianToken))
      .send({ serviceRequestId: source().id })
      .expect(403);
    const admin = signTestAccessToken({ role: 'TENANT_ADMIN', tenantId });
    await request(app.getHttpServer())
      .post('/work-orders')
      .set(authorization(admin))
      .send({ serviceRequestId: source().id })
      .expect(403);
  });
  it('checks Identity ownership/role and live branches before creating a profile', async () => {
    refs.user.mockResolvedValueOnce(null);
    expect((await postTechnician().expect(422)).body.code).toBe(
      'USER_NOT_FOUND',
    );
    refs.user.mockResolvedValueOnce({
      id: technicianUser,
      tenantId: otherTenant,
      userType: 'TENANT_STAFF',
      roles: ['TECHNICIAN'],
    });
    await postTechnician().expect(422);
    refs.user.mockResolvedValueOnce({
      id: technicianUser,
      tenantId,
      userType: 'CUSTOMER',
      roles: ['CUSTOMER_USER'],
    });
    expect((await postTechnician().expect(422)).body.code).toBe(
      'USER_NOT_TECHNICIAN',
    );
    refs.branch.mockResolvedValueOnce({ id: branchId, status: 'INACTIVE' });
    expect((await postTechnician().expect(422)).body.code).toBe(
      'BRANCH_NOT_FOUND',
    );
    expect(await db.technician.count()).toBe(0);
  });
  it('rejects unknown/null fields and missing own profiles', async () => {
    await postTechnician({ tenantId }).expect(400);
    await postTechnician({ employeeCode: null }).expect(400);
    await postTechnician({ status: 'BUSY' }).expect(422);
    await request(app.getHttpServer())
      .get('/technicians/me')
      .set(authorization(technicianToken))
      .expect(404);
    const row = await postTechnician().expect(201);
    await request(app.getHttpServer())
      .patch('/technicians/' + row.body.id)
      .set(authorization())
      .send({ status: null })
      .expect(400);
  });
  it('replaces skills atomically and rejects another tenant or duplicate skill', async () => {
    const tech = (await postTechnician().expect(201)).body;
    const skill = (
      await request(app.getHttpServer())
        .post('/skills')
        .set(authorization())
        .send({ code: 'ELECTRIC', name: 'Electrical' })
        .expect(201)
    ).body;
    await request(app.getHttpServer())
      .patch('/skills/' + skill.id)
      .set(authorization())
      .send({ name: 'Electrical systems' })
      .expect(200);
    const put = (body: object) =>
      request(app.getHttpServer())
        .put('/technicians/' + tech.id + '/skills')
        .set(authorization())
        .send(body);
    await put([{ skillId: skill.id, level: 3 }]).expect(200);
    const other = await db.skill.create({
      data: { tenantId: otherTenant, code: 'OTHER', name: 'Other' },
    });
    await put([{ skillId: other.id }]).expect(422);
    expect(
      await db.technicianSkill.count({ where: { technicianId: tech.id } }),
    ).toBe(1);
    await put([{ skillId: skill.id }, { skillId: skill.id }]).expect(400);
    await put([{ skillId: skill.id, level: 6 }]).expect(400);
    await put([{ skillId: skill.id, level: true }]).expect(400);
    await put([{ skillId: skill.id, tenantId }]).expect(400);
    await put([]).expect(200);
    expect(await db.technicianSkill.count()).toBe(0);
  });
  it('prevents cross-tenant technician reads, changes and skill replacement', async () => {
    const tech = (await postTechnician().expect(201)).body;
    const token = signTestAccessToken({
      role: 'SERVICE_MANAGER',
      tenantId: otherTenant,
    });
    await request(app.getHttpServer())
      .get('/technicians/' + tech.id)
      .set(authorization(token))
      .expect(404);
    await request(app.getHttpServer())
      .patch('/technicians/' + tech.id)
      .set(authorization(token))
      .send({ employeeCode: 'HACK' })
      .expect(404);
    await request(app.getHttpServer())
      .put('/technicians/' + tech.id + '/skills')
      .set(authorization(token))
      .send([])
      .expect(404);
  });
  it('creates WO, history, work log and a validated outbox event atomically', async () => {
    const src = source();
    const row = await postWO(src.id)
      .set('x-correlation-id', 'week1-create')
      .expect(201);
    expect(row.body).toMatchObject({
      serviceRequestId: src.id,
      equipmentId,
      customerId,
      customerSiteId: siteId,
      createdBy: actor,
      status: 'CREATED',
      currentAssignment: null,
      serviceReportId: null,
    });
    expect(row.body.workOrderNo).toMatch(/^WO-\d{4}-0001$/);
    expect(row.body).not.toHaveProperty('tenantId');
    expect(await db.workOrderStatusHistory.count()).toBe(1);
    expect(await db.workLog.count()).toBe(1);
    const event = await db.outboxEvent.findFirstOrThrow();
    expect(event).toMatchObject({
      eventType: 'WorkOrderCreated',
      eventVersion: 1,
      aggregateId: row.body.id,
      status: 'PENDING',
    });
    expect(event.payload).toMatchObject({
      data: { workOrderId: row.body.id },
      meta: { correlationId: 'week1-create' },
    });
    expect(refs.request).toHaveBeenCalledWith(src.id, manager);
  });
  it('serializes duplicate creates and sequence allocation under concurrent requests', async () => {
    const id = source().id;
    const duplicate = await Promise.all([postWO(id), postWO(id), postWO(id)]);
    expect(duplicate.map((r) => r.status).sort()).toEqual([201, 409, 409]);
    expect(await db.workOrder.count()).toBe(1);
    const ids = Array.from({ length: 5 }, () => source().id);
    const rows = await Promise.all(ids.map((s) => postWO(s)));
    expect(rows.map((r) => r.status)).toEqual([201, 201, 201, 201, 201]);
    const orders = await db.workOrder.findMany();
    expect(new Set(orders.map((r) => r.workOrderNo)).size).toBe(6);
    expect((await db.documentSequence.findFirstOrThrow()).lastValue).toBe(6n);
  });
  it('rejects unaccepted/missing SR and mismatched Equipment without side effects', async () => {
    await postWO(randomUUID()).expect(404);
    await postWO(source({ status: 'CANCELLED' }).id).expect(422);
    refs.equipment.mockResolvedValueOnce({
      id: equipmentId,
      customerId: randomUUID(),
      customerSiteId: siteId,
      locationId: null,
    });
    await postWO(source().id).expect(422);
    expect(await db.workOrder.count()).toBe(0);
    expect(await db.documentSequence.count()).toBe(0);
    expect(await db.outboxEvent.count()).toBe(0);
  });
  it('rolls back the order, sequence, logs and history when outbox insertion fails', async () => {
    await db.$executeRawUnsafe(
      "ALTER TABLE outbox_events ADD CONSTRAINT week1_test_reject_event CHECK (event_type <> 'WorkOrderCreated')",
    );
    try {
      await postWO(source().id).expect(500);
      expect(await db.workOrder.count()).toBe(0);
      expect(await db.documentSequence.count()).toBe(0);
      expect(await db.workLog.count()).toBe(0);
      expect(await db.workOrderStatusHistory.count()).toBe(0);
    } finally {
      await db.$executeRawUnsafe(
        'ALTER TABLE outbox_events DROP CONSTRAINT week1_test_reject_event',
      );
    }
  });
  it('maps upstream outages and rolls back rather than falling back to fake data', async () => {
    refs.request.mockRejectedValueOnce(
      new UpstreamUnavailableError(
        'service-request-service',
        new Error('offline'),
      ),
    );
    expect((await postWO(source().id).expect(503)).body.code).toBe(
      'UPSTREAM_UNAVAILABLE',
    );
    expect(await db.workOrder.count()).toBe(0);
  });
  it('validates schedules including partial updates and forbids terminal edits', async () => {
    const src = source();
    await postWO(src.id, { tenantId }).expect(400);
    await postWO(src.id, { scheduledStart: '2026-10-28' }).expect(400);
    await postWO(src.id, { scheduledStart: '2026-10-28T10:00:00' }).expect(400);
    await postWO(src.id, {
      scheduledStart: '2026-10-28T10:00:00Z',
      scheduledEnd: '2026-10-28T09:00:00Z',
    }).expect(422);
    const row = (
      await postWO(src.id, {
        scheduledStart: '2026-10-28T10:00:00Z',
        scheduledEnd: '2026-10-28T11:00:00Z',
      }).expect(201)
    ).body;
    const patch = (body: object) =>
      request(app.getHttpServer())
        .patch('/work-orders/' + row.id)
        .set(authorization())
        .send(body);
    await patch({ scheduledStart: '2026-10-28T12:00:00Z' }).expect(422);
    await patch({ scheduledEnd: null, priority: 'URGENT' }).expect(200);
    await patch({ title: null }).expect(400);
    await db.workOrder.update({
      where: { id: row.id },
      data: { status: 'COMPLETED', completedAt: new Date() },
    });
    await patch({ title: 'Late edit' }).expect(409);
  });
  it('scopes technician reads by historical assignment; mine only includes current assignments', async () => {
    const tech = (await postTechnician().expect(201)).body;
    const assigned = (await postWO(source().id).expect(201)).body;
    const hidden = (await postWO(source().id).expect(201)).body;
    await db.workOrderAssignment.create({
      data: {
        tenantId,
        workOrderId: assigned.id,
        technicianId: tech.id,
        assignedBy: actor,
        status: 'REMOVED',
        unassignedAt: new Date(),
      },
    });
    for (const suffix of ['', '/history']) {
      await request(app.getHttpServer())
        .get('/work-orders/' + hidden.id + suffix)
        .set(authorization(technicianToken))
        .expect(404);
      await request(app.getHttpServer())
        .get('/work-orders/' + assigned.id + suffix)
        .set(authorization(technicianToken))
        .expect(200);
    }
    const list = await request(app.getHttpServer())
      .get('/work-orders')
      .set(authorization(technicianToken))
      .expect(200);
    expect(list.body.items.map((r: { id: string }) => r.id)).toEqual([
      assigned.id,
    ]);
    expect(
      (
        await request(app.getHttpServer())
          .get('/work-orders?mine=true')
          .set(authorization(technicianToken))
          .expect(200)
      ).body.total,
    ).toBe(0);
    await db.workOrderAssignment.updateMany({
      where: { workOrderId: assigned.id },
      data: { status: 'ASSIGNED', unassignedAt: null },
    });
    await db.workOrder.update({
      where: { id: assigned.id },
      data: { status: 'ASSIGNED' },
    });
    const current = await request(app.getHttpServer())
      .get('/work-orders?mine=true&technicianId=' + tech.id)
      .set(authorization(technicianToken))
      .expect(200);
    expect(current.body.total).toBe(1);
    expect(current.body.items[0].currentAssignment.technicianUserId).toBe(
      technicianUser,
    );
    const bypass = await request(app.getHttpServer())
      .get(
        '/work-orders?mine=false&serviceRequestId=' + hidden.serviceRequestId,
      )
      .set(authorization(technicianToken))
      .expect(200);
    expect(bypass.body.total).toBe(0);
    await request(app.getHttpServer())
      .get('/internal/work-orders/' + hidden.id)
      .set(authorization(technicianToken))
      .expect(404);
    const foreign = signTestAccessToken({
      role: 'SERVICE_MANAGER',
      tenantId: otherTenant,
    });
    await request(app.getHttpServer())
      .get('/work-orders/' + assigned.id)
      .set(authorization(foreign))
      .expect(404);
    await request(app.getHttpServer())
      .patch('/work-orders/' + assigned.id)
      .set(authorization(foreign))
      .send({ title: 'HACK' })
      .expect(404);
  });
  it('never returns WO to customers, including another customer of the same tenant', async () => {
    const row = (await postWO(source().id).expect(201)).body;
    for (const customer of [customerId, randomUUID()]) {
      const token = signTestAccessToken({
        role: 'CUSTOMER_ADMIN',
        tenantId,
        customerId: customer,
      });
      await request(app.getHttpServer())
        .get('/work-orders/' + row.id)
        .set(authorization(token))
        .expect(403);
      await request(app.getHttpServer())
        .get('/work-orders')
        .set(authorization(token))
        .expect(403);
    }
  });
  it('filters/paginates with literal search and sorts priorities by business order', async () => {
    for (const priority of ['NORMAL', 'LOW', 'URGENT', 'HIGH'])
      await postWO(source().id, {
        title: priority === 'LOW' ? 'Valve 100%' : 'Valve standard',
        priority,
      }).expect(201);
    const list = await request(app.getHttpServer())
      .get('/work-orders?sort=-priority&pageSize=2&status=CREATED')
      .set(authorization())
      .expect(200);
    expect(
      list.body.items.map((r: { priority: string }) => r.priority),
    ).toEqual(['URGENT', 'HIGH']);
    expect(list.body.total).toBe(4);
    const literal = await request(app.getHttpServer())
      .get('/work-orders?q=100%25')
      .set(authorization())
      .expect(200);
    expect(literal.body.total).toBe(1);
    await request(app.getHttpServer())
      .get('/work-orders?mine=anything')
      .set(authorization())
      .expect(400);
    await request(app.getHttpServer())
      .get('/work-orders?status=NOPE')
      .set(authorization())
      .expect(400);
    const ref = await request(app.getHttpServer())
      .get('/internal/work-orders/' + list.body.items[0].id)
      .set(authorization())
      .expect(200);
    expect(Object.keys(ref.body).sort()).toEqual(
      [
        'id',
        'workOrderNo',
        'status',
        'equipmentId',
        'customerId',
        'serviceRequestId',
        'maintenanceTaskId',
        'currentTechnicianId',
      ].sort(),
    );
  });
  it('recomputes AVAILABLE against accepted assignments and preserves manager states', async () => {
    const tech = (await postTechnician().expect(201)).body;
    const wo = (await postWO(source().id).expect(201)).body;
    await db.workOrderAssignment.create({
      data: {
        tenantId,
        technicianId: tech.id,
        workOrderId: wo.id,
        assignedBy: actor,
        status: 'ACCEPTED',
        acceptedAt: new Date(),
      },
    });
    const patch = (body: object) =>
      request(app.getHttpServer())
        .patch('/technicians/' + tech.id)
        .set(authorization())
        .send(body);
    expect((await patch({ status: 'AVAILABLE' }).expect(200)).body.status).toBe(
      'BUSY',
    );
    expect((await patch({ status: 'OFF_DUTY' }).expect(200)).body.status).toBe(
      'OFF_DUTY',
    );
    expect((await patch({ employeeCode: 'NEW' }).expect(200)).body.status).toBe(
      'OFF_DUTY',
    );
    await patch({ status: 'BUSY' }).expect(422);
  });
});

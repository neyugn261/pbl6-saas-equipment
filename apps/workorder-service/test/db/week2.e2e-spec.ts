import { randomUUID } from 'node:crypto';
import { INestApplication, Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { configureApp } from '@pbl6/service-kit';
import { signTestAccessToken } from '@pbl6/testing';
import type {
  EventEnvelope,
  ServiceRequestStatusChangedV1,
} from '@pbl6/event-contracts';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import {
  REFERENCES,
  type RequestRef,
} from '../../src/references/references.client';
import {
  REQUEST_CONSUMER,
  ServiceRequestEventsConsumer,
} from '../../src/events/service-request-events.consumer';

const tenant = randomUUID(),
  foreignTenant = randomUUID(),
  managerUser = randomUUID(),
  techUser = randomUUID(),
  secondUser = randomUUID();
const customer = randomUUID(),
  equipment = randomUUID(),
  branch = randomUUID();
const manager = signTestAccessToken({
  role: 'SERVICE_MANAGER',
  tenantId: tenant,
  userId: managerUser,
});
const technician = signTestAccessToken({
  role: 'TECHNICIAN',
  tenantId: tenant,
  userId: techUser,
});
const secondTechnician = signTestAccessToken({
  role: 'TECHNICIAN',
  tenantId: tenant,
  userId: secondUser,
});
const dispatcher = signTestAccessToken({
  role: 'DISPATCHER',
  tenantId: tenant,
});
const inventory = signTestAccessToken({
  role: 'INVENTORY_STAFF',
  tenantId: tenant,
});
const report = {
  problemDescription: 'INTERNAL diagnosis',
  rootCause: 'INTERNAL wiring issue',
  solution: 'Replaced internal cable',
  result: 'RESOLVED',
  customerSummary: 'Equipment repaired and tested.',
};

describe('Work Order week 2 — workflows, transactions and SR cancellation', () => {
  let app: INestApplication<App>,
    db: PrismaService,
    consumer: ServiceRequestEventsConsumer;
  let sources: Map<string, RequestRef>;
  let techId: string, secondId: string;
  const refs = {
    user: jest.fn(),
    branch: jest.fn(),
    request: jest.fn(),
    equipment: jest.fn(),
  };
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(REFERENCES)
      .useValue(refs)
      .compile();
    app = module.createNestApplication({ logger: false });
    configureApp(app, { logger: new Logger('week2-db') });
    await app.init();
    db = app.get(PrismaService);
    consumer = app.get(ServiceRequestEventsConsumer);
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
    refs.request.mockImplementation(
      async (id: string) => sources.get(id) ?? null,
    );
    refs.equipment.mockResolvedValue({
      id: equipment,
      customerId: customer,
      customerSiteId: null,
      locationId: null,
    });
    techId = (
      await db.technician.create({
        data: {
          tenantId: tenant,
          userId: techUser,
          branchId: branch,
          employeeCode: 'W2-T1',
        },
      })
    ).id;
    secondId = (
      await db.technician.create({
        data: {
          tenantId: tenant,
          userId: secondUser,
          branchId: branch,
          employeeCode: 'W2-T2',
        },
      })
    ).id;
  });
  function source(status = 'ACCEPTED') {
    const row = {
      id: randomUUID(),
      status,
      equipmentId: equipment,
      customerId: customer,
      type: 'REPAIR',
      priority: 'NORMAL',
      title: 'Week 2 repair',
    };
    sources.set(row.id, row);
    return row;
  }
  async function create() {
    const s = source();
    return (
      await request(app.getHttpServer())
        .post('/work-orders')
        .auth(manager, { type: 'bearer' })
        .send({ serviceRequestId: s.id })
        .expect(201)
    ).body;
  }
  function action(id: string, name: string, token = technician, body?: object) {
    const call = request(app.getHttpServer())
      .post('/work-orders/' + id + '/' + name)
      .auth(token, { type: 'bearer' });
    return body === undefined ? call : call.send(body);
  }
  const get = (id: string, suffix = '', token = manager) =>
    request(app.getHttpServer())
      .get('/work-orders/' + id + suffix)
      .auth(token, { type: 'bearer' });
  async function assigned(id: string, accepted = false) {
    await action(id, 'assign', dispatcher, { technicianId: techId }).expect(
      200,
    );
    if (accepted) await action(id, 'accept').expect(200);
  }
  async function running() {
    const wo = await create();
    await assigned(wo.id, true);
    await action(wo.id, 'start').expect(200);
    return wo;
  }
  function cancellation(
    srId: string,
    changes: Partial<ServiceRequestStatusChangedV1> = {},
  ): EventEnvelope<ServiceRequestStatusChangedV1> {
    return {
      eventId: randomUUID(),
      eventType: 'ServiceRequestStatusChanged',
      eventVersion: 1,
      producer: 'service-request-service',
      tenantId: tenant,
      aggregateType: 'ServiceRequest',
      aggregateId: srId,
      occurredAt: new Date().toISOString(),
      correlationId: 'week2-cancel',
      payload: {
        serviceRequestId: srId,
        requestNo: 'SR-TEST',
        customerId: customer,
        equipmentId: equipment,
        fromStatus: 'ACCEPTED',
        toStatus: 'CANCELLED',
        changedBy: managerUser,
        reason: 'Cancelled',
        ...changes,
      },
    };
  }

  it('runs assign/accept/travel/start/hold/resume/log/complete and emits only a safe v2 summary', async () => {
    const wo = await create();
    await assigned(wo.id);
    expect(
      (await get(wo.id, '', technician).expect(200)).body.allowedActions,
    ).toEqual(expect.arrayContaining(['accept', 'reject']));
    await action(wo.id, 'accept').expect(200);
    await action(wo.id, 'start-travel').expect(200);
    const started = await action(wo.id, 'start').expect(200);
    await action(wo.id, 'hold', manager, { reason: 'Awaiting access' }).expect(
      200,
    );
    const resumed = await action(wo.id, 'resume', manager).expect(200);
    expect(resumed.body.startedAt).toBe(started.body.startedAt);
    await action(wo.id, 'logs', technician, {
      note: 'Internal progress note',
    }).expect(201);
    await action(wo.id, 'complete', technician, report)
      .expect(200)
      .expect((r) => expect(r.body.allowedActions).toEqual([]));
    const stored = await get(wo.id, '/service-report', technician).expect(200);
    expect(stored.body).toMatchObject({
      customerSummary: report.customerSummary,
      rootCause: report.rootCause,
      technicianId: techId,
    });
    expect(await db.serviceReport.count()).toBe(1);
    expect(
      (await db.technician.findUniqueOrThrow({ where: { id: techId } })).status,
    ).toBe('AVAILABLE');
    expect((await db.workOrderAssignment.findFirstOrThrow()).status).toBe(
      'COMPLETED',
    );
    const event = await db.outboxEvent.findFirstOrThrow({
      where: { eventType: 'WorkOrderCompleted' },
    });
    expect(event.eventVersion).toBe(2);
    expect(event.payload).toMatchObject({
      data: { customerSummary: report.customerSummary, result: 'RESOLVED' },
    });
    expect(JSON.stringify(event.payload)).not.toContain(report.rootCause);
    expect(JSON.stringify(event.payload)).not.toContain(
      report.problemDescription,
    );
    const logs = await get(wo.id, '/logs').expect(200);
    expect(
      logs.body.find((l: { eventType: string }) => l.eventType === 'HOLD')
        .technicianId,
    ).toBeNull();
    expect(
      logs.body.find((l: { eventType: string }) => l.eventType === 'NOTE')
        .technicianId,
    ).toBe(techId);
    await action(wo.id, 'complete', technician, report).expect(409);
    await action(wo.id, 'logs', technician, { note: 'late' }).expect(409);
  });
  it('supports direct start, rejection and reassignment without erasing assignment history', async () => {
    const wo = await create();
    await assigned(wo.id);
    await action(wo.id, 'reject', technician, { reason: 'Cannot attend' })
      .expect(200)
      .expect((r) => expect(r.body.status).toBe('CREATED'));
    await assigned(wo.id, true);
    await action(wo.id, 'assign', dispatcher, {
      technicianId: secondId,
      note: 'Reassign',
    }).expect(200);
    expect(
      (await db.technician.findUniqueOrThrow({ where: { id: techId } })).status,
    ).toBe('AVAILABLE');
    await action(wo.id, 'accept', technician).expect(403);
    await action(wo.id, 'accept', secondTechnician).expect(200);
    await action(wo.id, 'start', secondTechnician).expect(200);
    const history = await get(wo.id, '/assignments', technician).expect(200);
    expect(
      history.body.map((a: { status: string }) => a.status).sort(),
    ).toEqual(['ACCEPTED', 'REJECTED', 'REMOVED']);
  });
  it('enforces the OR policy while keeping read-only staff and past assignees from executing', async () => {
    const wo = await running();
    await action(wo.id, 'hold', inventory, { reason: 'not allowed' }).expect(
      403,
    );
    await action(wo.id, 'logs', inventory, { note: 'not allowed' }).expect(403);
    await action(wo.id, 'logs', dispatcher, { note: 'Dispatcher note' }).expect(
      201,
    );
    await action(wo.id, 'hold', technician, { reason: 'Need help' }).expect(
      200,
    );
    await action(wo.id, 'resume', technician).expect(200);
    await action(wo.id, 'complete', manager, report).expect(403);
    await action(wo.id, 'cancel', dispatcher, {
      reason: 'no permission',
    }).expect(403);
    await action(wo.id, 'accept', secondTechnician).expect(404);
  });
  it('rejects invalid DTOs and no-body action fields before writing', async () => {
    const wo = await create();
    await action(wo.id, 'assign', dispatcher, {
      technicianId: techId,
      tenantId: tenant,
    }).expect(400);
    await assigned(wo.id);
    await action(wo.id, 'accept', technician, { injected: true }).expect(400);
    await action(wo.id, 'reject', technician, {}).expect(400);
    await action(wo.id, 'accept').expect(200);
    await action(wo.id, 'start').expect(200);
    await action(wo.id, 'hold', technician, {}).expect(400);
    await action(wo.id, 'complete', technician, {
      ...report,
      customerSummary: '',
    }).expect(400);
    await action(wo.id, 'complete', technician, {
      ...report,
      internalNote: 'extra',
    }).expect(400);
    expect(await db.serviceReport.count()).toBe(0);
  });
  it.each(['OFF_DUTY', 'INACTIVE'])(
    'cannot assign a %s technician',
    async (status) => {
      await db.technician.update({ where: { id: techId }, data: { status } });
      const wo = await create();
      expect(
        (
          await action(wo.id, 'assign', dispatcher, {
            technicianId: techId,
          }).expect(422)
        ).body.code,
      ).toBe('TECHNICIAN_UNAVAILABLE');
      await action(wo.id, 'assign', dispatcher, {
        technicianId: randomUUID(),
      }).expect(422);
      expect(await db.workOrderAssignment.count()).toBe(0);
    },
  );
  it('locks the technician across two jobs and preserves manager-set states', async () => {
    const first = await create(),
      second = await create();
    await assigned(first.id);
    await assigned(second.id);
    await Promise.all([
      action(first.id, 'accept').expect(200),
      action(second.id, 'accept').expect(200),
    ]);
    expect(
      (await db.technician.findUniqueOrThrow({ where: { id: techId } })).status,
    ).toBe('BUSY');
    await action(first.id, 'start').expect(200);
    await action(first.id, 'complete', technician, report).expect(200);
    expect(
      (await db.technician.findUniqueOrThrow({ where: { id: techId } })).status,
    ).toBe('BUSY');
    await request(app.getHttpServer())
      .patch('/technicians/' + techId)
      .auth(manager, { type: 'bearer' })
      .send({ status: 'OFF_DUTY' })
      .expect(200);
    await action(second.id, 'cancel', manager, { reason: 'Cancelled' }).expect(
      200,
    );
    expect(
      (await db.technician.findUniqueOrThrow({ where: { id: techId } })).status,
    ).toBe('OFF_DUTY');
  });
  it('serializes duplicate accepts and completions', async () => {
    const wo = await create();
    await assigned(wo.id);
    expect(
      (await Promise.all([action(wo.id, 'accept'), action(wo.id, 'accept')]))
        .map((r) => r.status)
        .sort(),
    ).toEqual([200, 409]);
    await action(wo.id, 'start').expect(200);
    expect(
      (
        await Promise.all([
          action(wo.id, 'complete', technician, report),
          action(wo.id, 'complete', technician, report),
        ])
      )
        .map((r) => r.status)
        .sort(),
    ).toEqual([200, 409]);
    expect(await db.serviceReport.count()).toBe(1);
    expect(
      await db.outboxEvent.count({
        where: { eventType: 'WorkOrderCompleted' },
      }),
    ).toBe(1);
  });
  it.each([
    ['assign', 'TRAVELLING'],
    ['accept', 'ACCEPTED'],
    ['reject', 'IN_PROGRESS'],
    ['start-travel', 'IN_PROGRESS'],
    ['start', 'ON_HOLD'],
    ['hold', 'ACCEPTED'],
    ['resume', 'IN_PROGRESS'],
    ['complete', 'ON_HOLD'],
    ['cancel', 'COMPLETED'],
    ['cancel', 'CANCELLED'],
  ])(
    'rejects %s from %s without changing history or outbox',
    async (name, status) => {
      const wo = await create();
      await assigned(wo.id, true);
      await db.workOrder.update({ where: { id: wo.id }, data: { status } });
      const histories = await db.workOrderStatusHistory.count(),
        events = await db.outboxEvent.count();
      const body =
        name === 'assign'
          ? { technicianId: secondId }
          : name === 'complete'
            ? report
            : { reason: 'test' };
      const token = ['assign', 'cancel', 'hold', 'resume'].includes(name)
        ? manager
        : technician;
      const response = await action(
        wo.id,
        name,
        token,
        ['accept', 'start-travel', 'start', 'resume'].includes(name)
          ? undefined
          : body,
      ).expect(409);
      expect(response.body).toMatchObject({
        code: 'INVALID_STATE_TRANSITION',
        details: { from: status, action: name },
      });
      expect(await db.workOrderStatusHistory.count()).toBe(histories);
      expect(await db.outboxEvent.count()).toBe(events);
    },
  );
  it('serializes complete versus cancel to one terminal result and one terminal event', async () => {
    const wo = await running();
    const results = await Promise.all([
      action(wo.id, 'complete', technician, report),
      action(wo.id, 'cancel', manager, { reason: 'Stop' }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const state = (
      await db.workOrder.findUniqueOrThrow({ where: { id: wo.id } })
    ).status;
    expect(await db.serviceReport.count()).toBe(state === 'COMPLETED' ? 1 : 0);
    expect(
      await db.outboxEvent.count({
        where: {
          eventType: { in: ['WorkOrderCompleted', 'WorkOrderCancelled'] },
        },
      }),
    ).toBe(1);
    expect(
      (await db.technician.findUniqueOrThrow({ where: { id: techId } })).status,
    ).toBe('AVAILABLE');
  });
  it('keeps only one live assignment when two dispatchers assign concurrently', async () => {
    const wo = await create();
    const responses = await Promise.all([
      action(wo.id, 'assign', dispatcher, { technicianId: techId }),
      action(wo.id, 'assign', dispatcher, { technicianId: secondId }),
    ]);
    expect(responses.map((r) => r.status)).toEqual([200, 200]);
    expect(
      await db.workOrderAssignment.count({
        where: { workOrderId: wo.id, status: { in: ['ASSIGNED', 'ACCEPTED'] } },
      }),
    ).toBe(1);
  });
  it('uses consistent technician lock ordering for crossed reassignments with mixed-case UUIDs', async () => {
    const first = await create(),
      second = await create();
    await assigned(first.id, true);
    await action(second.id, 'assign', dispatcher, {
      technicianId: secondId,
    }).expect(200);
    await action(second.id, 'accept', secondTechnician).expect(200);
    await Promise.all([
      action(first.id, 'assign', dispatcher, {
        technicianId: secondId.toUpperCase(),
      }).expect(200),
      action(second.id, 'assign', dispatcher, {
        technicianId: techId.toUpperCase(),
      }).expect(200),
    ]);
    expect(
      await db.workOrderAssignment.count({ where: { status: 'ACCEPTED' } }),
    ).toBe(0);
    expect(await db.technician.count({ where: { status: 'AVAILABLE' } })).toBe(
      2,
    );
  });
  it('compares user/branch references and assignee UUIDs case-insensitively', async () => {
    const userId = randomUUID();
    refs.user.mockResolvedValueOnce({
      id: userId,
      tenantId: tenant,
      userType: 'TENANT_STAFF',
      roles: ['TECHNICIAN'],
      status: 'ACTIVE',
    });
    refs.branch.mockResolvedValueOnce({ id: branch, status: 'ACTIVE' });
    await request(app.getHttpServer())
      .post('/technicians')
      .auth(manager, { type: 'bearer' })
      .send({
        userId: userId.toUpperCase(),
        branchId: branch.toUpperCase(),
        employeeCode: 'UPPER',
      })
      .expect(201);
    const wo = await create();
    await assigned(wo.id);
    const uppercaseUser = signTestAccessToken({
      role: 'TECHNICIAN',
      tenantId: tenant,
      userId: techUser.toUpperCase(),
    });
    await action(wo.id, 'accept', uppercaseUser).expect(200);
  });
  it('rolls back report, assignment, status, history and technician when complete event insertion fails', async () => {
    const wo = await running();
    const historyCount = await db.workOrderStatusHistory.count();
    await db.$executeRawUnsafe(
      "ALTER TABLE outbox_events ADD CONSTRAINT week2_reject_complete CHECK (event_type <> 'WorkOrderCompleted')",
    );
    try {
      await action(wo.id, 'complete', technician, report).expect(500);
      expect(await db.serviceReport.count()).toBe(0);
      expect(
        (await db.workOrder.findUniqueOrThrow({ where: { id: wo.id } })).status,
      ).toBe('IN_PROGRESS');
      expect((await db.workOrderAssignment.findFirstOrThrow()).status).toBe(
        'ACCEPTED',
      );
      expect(
        (await db.technician.findUniqueOrThrow({ where: { id: techId } }))
          .status,
      ).toBe('BUSY');
      expect(await db.workOrderStatusHistory.count()).toBe(historyCount);
    } finally {
      await db.$executeRawUnsafe(
        'ALTER TABLE outbox_events DROP CONSTRAINT week2_reject_complete',
      );
    }
  });
  it.each([
    'CREATED',
    'ASSIGNED',
    'ACCEPTED',
    'TRAVELLING',
    'IN_PROGRESS',
    'ON_HOLD',
  ])('explicitly cancels %s and publishes v2 intent', async (status) => {
    const wo = await create();
    if (status !== 'CREATED') {
      await assigned(wo.id, status !== 'ASSIGNED');
      await db.workOrder.update({ where: { id: wo.id }, data: { status } });
    }
    await action(wo.id, 'cancel', manager, {
      reason: 'Stop work',
      cancelServiceRequest: true,
    }).expect(200);
    expect(
      (await db.workOrder.findUniqueOrThrow({ where: { id: wo.id } })).status,
    ).toBe('CANCELLED');
    expect(
      await db.workOrderAssignment.count({
        where: { workOrderId: wo.id, status: { in: ['ASSIGNED', 'ACCEPTED'] } },
      }),
    ).toBe(0);
    expect(
      (
        await db.outboxEvent.findFirstOrThrow({
          where: { eventType: 'WorkOrderCancelled' },
        })
      ).payload,
    ).toMatchObject({ data: { cancelServiceRequest: true } });
    await action(wo.id, 'cancel', manager, { reason: 'again' }).expect(409);
  });
  it('defaults cancellation to preserving the SR and rejects cancelServiceRequest on Maintenance', async () => {
    const wo = await create();
    await action(wo.id, 'cancel', manager, {
      reason: 'Replace work order',
    }).expect(200);
    const event = await db.outboxEvent.findFirstOrThrow({
      where: { eventType: 'WorkOrderCancelled' },
    });
    expect(event).toMatchObject({ eventVersion: 2 });
    expect(event.payload).toMatchObject({
      data: { cancelServiceRequest: false },
    });
    const maintenance = await db.workOrder.create({
      data: {
        tenantId: tenant,
        workOrderNo: 'WO-MAINT',
        maintenanceTaskId: randomUUID(),
        equipmentId: equipment,
        customerId: customer,
        type: 'MAINTENANCE',
        title: 'Maintenance',
        createdBy: null,
      },
    });
    await action(maintenance.id, 'cancel', manager, {
      reason: 'no SR',
      cancelServiceRequest: true,
    }).expect(422);
  });
  it.each(['CREATED', 'ASSIGNED', 'ACCEPTED'])(
    'auto-cancels %s idempotently with null actor and no system work log',
    async (status) => {
      const wo = await create();
      if (status !== 'CREATED') await assigned(wo.id, status === 'ACCEPTED');
      const logCount = await db.workLog.count();
      const event = cancellation(wo.serviceRequestId);
      await Promise.all([consumer.handle(event), consumer.handle(event)]);
      expect(
        (await db.workOrder.findUniqueOrThrow({ where: { id: wo.id } })).status,
      ).toBe('CANCELLED');
      expect(await db.workLog.count()).toBe(logCount);
      expect(
        await db.workOrderStatusHistory.count({
          where: {
            workOrderId: wo.id,
            newStatus: 'CANCELLED',
            changedBy: null,
          },
        }),
      ).toBe(1);
      expect(
        await db.processedEvent.count({
          where: { eventId: event.eventId, consumer: REQUEST_CONSUMER },
        }),
      ).toBe(1);
      expect(
        await db.outboxEvent.count({
          where: { eventType: 'WorkOrderCancelled', eventVersion: 2 },
        }),
      ).toBe(1);
    },
  );
  it.each(['TRAVELLING', 'IN_PROGRESS', 'ON_HOLD'])(
    'does not silently auto-cancel %s',
    async (status) => {
      const wo = await running();
      await db.workOrder.update({ where: { id: wo.id }, data: { status } });
      const event = cancellation(wo.serviceRequestId);
      await consumer.handle(event);
      expect(
        (await db.workOrder.findUniqueOrThrow({ where: { id: wo.id } })).status,
      ).toBe(status);
      expect(
        await db.outboxEvent.count({
          where: { eventType: 'WorkOrderCancelled' },
        }),
      ).toBe(0);
      expect(
        await db.processedEvent.count({ where: { eventId: event.eventId } }),
      ).toBe(1);
    },
  );
  it('coordinates cancellation that arrives while create is holding the source lock', async () => {
    const src = source();
    let release!: () => void, entered!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    refs.request.mockImplementationOnce(async () => {
      entered();
      await gate;
      return src;
    });
    const pending = request(app.getHttpServer())
      .post('/work-orders')
      .auth(manager, { type: 'bearer' })
      .send({ serviceRequestId: src.id.toUpperCase() })
      .then((r) => r);
    await started;
    const cancelled = consumer.handle(cancellation(src.id));
    let waiting = false;
    try {
      const deadline = Date.now() + 2000;
      while (!waiting && Date.now() < deadline) {
        const [state] = await db.$queryRaw<
          { waiting: boolean }[]
        >`SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock' AND wait_event = 'advisory') AS waiting`;
        waiting = state.waiting;
        if (!waiting) await new Promise((resolve) => setTimeout(resolve, 10));
      }
    } finally {
      release();
      expect((await pending).status).toBe(201);
      await cancelled;
    }
    expect(waiting).toBe(true);
    expect(
      (
        await db.workOrder.findFirstOrThrow({
          where: { serviceRequestId: src.id },
        })
      ).status,
    ).toBe('CANCELLED');
  });
  it('refuses create after a cancellation was consumed before any WO existed', async () => {
    const src = source('CANCELLED');
    await consumer.handle(cancellation(src.id));
    await request(app.getHttpServer())
      .post('/work-orders')
      .auth(manager, { type: 'bearer' })
      .send({ serviceRequestId: src.id })
      .expect(422);
    expect(await db.workOrder.count()).toBe(0);
  });
  it('serializes start-travel versus automatic cancellation without cancelling underway work', async () => {
    const wo = await create();
    await assigned(wo.id, true);
    const event = cancellation(wo.serviceRequestId);
    const [started] = await Promise.all([
      action(wo.id, 'start-travel').then((r) => r),
      consumer.handle(event),
    ]);
    const final = await db.workOrder.findUniqueOrThrow({
      where: { id: wo.id },
    });
    if (started.status === 200) {
      expect(final.status).toBe('TRAVELLING');
      expect(
        await db.outboxEvent.count({
          where: { eventType: 'WorkOrderCancelled' },
        }),
      ).toBe(0);
    } else {
      expect(started.status).toBe(409);
      expect(final.status).toBe('CANCELLED');
    }
  });
  it('rolls back inbox on reference mismatch, permitting a corrected retry', async () => {
    const wo = await create(),
      event = cancellation(wo.serviceRequestId, { equipmentId: randomUUID() });
    await expect(consumer.handle(event)).rejects.toThrow('does not match');
    expect(await db.processedEvent.count()).toBe(0);
    event.payload.equipmentId = equipment;
    await consumer.handle(event);
    expect(
      (await db.workOrder.findUniqueOrThrow({ where: { id: wo.id } })).status,
    ).toBe('CANCELLED');
  });
  it('keeps workflow/activity/report endpoints scoped for customer, tenant and unrelated technician', async () => {
    const wo = await running();
    await action(wo.id, 'complete', technician, report).expect(200);
    const foreign = signTestAccessToken({
      role: 'SERVICE_MANAGER',
      tenantId: foreignTenant,
    });
    const customerToken = signTestAccessToken({
      role: 'CUSTOMER_ADMIN',
      tenantId: tenant,
      customerId: customer,
    });
    for (const suffix of ['/assignments', '/logs', '/service-report']) {
      await get(wo.id, suffix, foreign).expect(404);
      await get(wo.id, suffix, secondTechnician).expect(404);
      await get(wo.id, suffix, customerToken).expect(403);
      await get(wo.id, suffix, technician).expect(200);
    }
  });
});

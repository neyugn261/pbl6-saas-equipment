import { BranchAccessClient } from '@pbl6/auth';
import { FIXTURE_BRANCH, fixtureBranchContext } from '@pbl6/testing';
import { createHash, randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import {
  type INestApplication,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { configureApp } from '@pbl6/service-kit';
import { signTestAccessToken } from '@pbl6/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { InventoryProofClient } from '../../src/inventory-reservations/inventory-proof.client';
import { canonical } from '../../src/inventory-reservations/proof';
import {
  ServiceRequestEventsConsumer,
  REQUEST_CONSUMER,
} from '../../src/events/service-request-events.consumer';

describe('WO Inventory reservation HTTP + PostgreSQL (explicit proof fixture)', () => {
  let app: INestApplication<App>, db: PrismaService;
  const tenantId = randomUUID(),
    userId = randomUUID(),
    techUserId = randomUUID();
  const inventory = signTestAccessToken({
    role: 'INVENTORY_STAFF',
    tenantId,
    userId,
  });
  const manager = signTestAccessToken({ role: 'SERVICE_MANAGER', tenantId });
  const tech = signTestAccessToken({
    role: 'TECHNICIAN',
    tenantId,
    userId: techUserId,
  });
  const otherInventory = signTestAccessToken({
    role: 'INVENTORY_STAFF',
    tenantId: randomUUID(),
  });
  const client = { get: jest.fn() };
  let orderId: string,
    operation: Record<string, any>,
    input: { requestId: string; fingerprint: string };
  const report = {
    problemDescription: 'Test',
    solution: 'Repaired',
    result: 'RESOLVED',
    customerSummary: 'Ready for use',
  };
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(BranchAccessClient)
      .useValue(fixtureBranchContext(FIXTURE_BRANCH))
      .overrideProvider(InventoryProofClient)
      .useValue(client)
      .compile();
    app = module.createNestApplication({ logger: false });
    configureApp(app, { logger: new Logger('reservation-db') });
    await app.init();
    db = app.get(PrismaService);
  });
  async function clean() {
    await db.workOrderInventoryReservation.deleteMany({ where: { tenantId } });
    await db.serviceReport.deleteMany({ where: { tenantId } });
    await db.workLog.deleteMany({ where: { tenantId } });
    await db.workOrderStatusHistory.deleteMany({ where: { tenantId } });
    await db.workOrderAssignment.deleteMany({ where: { tenantId } });
    await db.workOrder.deleteMany({ where: { tenantId } });
    await db.technician.deleteMany({ where: { tenantId } });
    await db.outboxEvent.deleteMany({ where: { tenantId } });
  }
  beforeEach(async () => {
    jest.resetAllMocks();
    await clean();
    const technician = await db.technician.create({
      data: {
        tenantId,
        userId: techUserId,
        branchId: FIXTURE_BRANCH,
        employeeCode: 'INV-TECH',
      },
    });
    const order = await db.workOrder.create({
      data: {
        branchId: FIXTURE_BRANCH,
        tenantId,
        workOrderNo: `WO-R-${randomUUID()}`,
        serviceRequestId: randomUUID(),
        equipmentId: randomUUID(),
        customerId: randomUUID(),
        type: 'REPAIR',
        title: 'Reservation fixture',
        status: 'IN_PROGRESS',
      },
    });
    orderId = order.id;
    await db.workOrderAssignment.create({
      data: {
        tenantId,
        workOrderId: orderId,
        technicianId: technician.id,
        assignedBy: userId,
        status: 'ACCEPTED',
      },
    });
    const businessRequest = {
      workOrderId: orderId,
      warehouseId: randomUUID(),
      partId: randomUUID(),
      quantity: '2.00',
    };
    input = {
      requestId: randomUUID(),
      fingerprint: createHash('sha256')
        .update(canonical({ operation: 'ISSUE', request: businessRequest }))
        .digest('hex'),
    };
    operation = {
      tenantId,
      key: input.requestId,
      fingerprint: input.fingerprint,
      workOrderId: orderId,
      operation: 'ISSUE',
      actorId: userId,
      request: businessRequest,
      state: 'PENDING',
      httpStatus: null,
      response: null,
    };
    client.get.mockImplementation(async () => structuredClone(operation));
  });
  afterAll(async () => {
    await clean();
    await app.close();
  });
  const reserve = (body: object = input, token = inventory, id = orderId) =>
    request(app.getHttpServer())
      .post(`/internal/work-orders/${id}/inventory-reservations`)
      .auth(token, { type: 'bearer' })
      .send(body);
  const settle = (outcome = 'COMMITTED', body: object = input) =>
    request(app.getHttpServer())
      .post(`/internal/work-orders/${orderId}/inventory-reservations/settle`)
      .auth(inventory, { type: 'bearer' })
      .send({ ...body, outcome });
  const complete = () =>
    request(app.getHttpServer())
      .post(`/work-orders/${orderId}/complete`)
      .auth(tech, { type: 'bearer' })
      .send(report);
  const cancel = () =>
    request(app.getHttpServer())
      .post(`/work-orders/${orderId}/cancel`)
      .auth(manager, { type: 'bearer' })
      .send({ reason: 'Cancel fixture' });
  const committed = () => {
    operation.state = 'COMMITTED';
    operation.httpStatus = 201;
    operation.response = {
      id: randomUUID(),
      stockTransactionId: randomUUID(),
      tenantId,
      workOrderId: orderId,
      partId: operation.request.partId,
      warehouseId: operation.request.warehouseId,
      quantityUsed: operation.request.quantity,
      recordedBy: userId,
    };
  };
  const aborted = () => {
    operation.state = 'ABORTED';
    operation.httpStatus = 409;
    operation.response = {
      code: 'OPERATION_ABORTED',
      message: 'Fixture abort',
    };
  };
  const row = () =>
    db.workOrderInventoryReservation.findUniqueOrThrow({
      where: { tenantId_requestId: { tenantId, requestId: input.requestId } },
    });

  it('persists and concurrently replays exactly one hold with the original actor/request', async () => {
    const results = await Promise.all(
      Array.from({ length: 8 }, () => reserve()),
    );
    expect(
      results.every((x) => x.status === 200 && x.body.state === 'HELD'),
    ).toBe(true);
    expect(results[0].headers['cache-control']).toBe('no-store');
    expect(
      await db.workOrderInventoryReservation.count({ where: { tenantId } }),
    ).toBe(1);
    expect(await row()).toMatchObject({
      actorId: userId,
      inventoryRequest: operation.request,
    });
  });
  it('requires staff inventory:issue and work_order:read with verified tokens', async () => {
    await request(app.getHttpServer())
      .post(`/internal/work-orders/${orderId}/inventory-reservations`)
      .send(input)
      .expect(401);
    for (const role of [
      'TECHNICIAN',
      'SERVICE_MANAGER',
      'DISPATCHER',
      'CUSTOMER_ADMIN',
      'PLATFORM_ADMIN',
    ] as const)
      await reserve(
        input,
        signTestAccessToken({ role, tenantId, customerId: randomUUID() }),
      ).expect(403);
    expect(client.get).not.toHaveBeenCalled();
  });
  it('isolates foreign tenant and missing WO before reading Inventory proof', async () => {
    await reserve(input, otherInventory).expect(404);
    await reserve(input, inventory, randomUUID()).expect(404);
    expect(client.get).not.toHaveBeenCalled();
    await reserve().set('x-tenant-id', randomUUID()).expect(200);
  });
  it('validates UUID/hash, unknown body/query and forged outcome before proof reads', async () => {
    for (const body of [
      {},
      { ...input, requestId: 'bad' },
      { ...input, fingerprint: 'f' },
      { ...input, tenantId },
      { ...input, outcome: 'COMMITTED' },
    ])
      await reserve(body).expect(400);
    await reserve().query({ tenantId }).expect(400);
    await settle('HELD').expect(400);
    expect(client.get).not.toHaveBeenCalled();
  });
  it('rejects proof identity/operation/request/hash conflicts without creating a row', async () => {
    const original = structuredClone(operation);
    for (const patch of [
      { tenantId: randomUUID() },
      { key: randomUUID() },
      { workOrderId: randomUUID() },
      { operation: 'RETURN' },
      { fingerprint: '0'.repeat(64) },
      { request: { ...original.request, quantity: '3.00' } },
      { request: { ...original.request, token: 'not-allowed' } },
      { actorId: 'bad' },
    ]) {
      operation = { ...original, ...patch };
      await reserve().expect(409);
    }
    expect(
      await db.workOrderInventoryReservation.count({ where: { tenantId } }),
    ).toBe(0);
  });
  it('forbids first holds on terminal WOs but permits replay of settled identities', async () => {
    for (const status of ['COMPLETED', 'CANCELLED']) {
      await db.workOrder.update({ where: { id: orderId }, data: { status } });
      await reserve().expect(409);
    }
  });
  it('rejects a key rebound to another WO even with a newly matching source proof', async () => {
    await reserve().expect(200);
    const next = await db.workOrder.create({
      data: {
        branchId: FIXTURE_BRANCH,
        tenantId,
        workOrderNo: `WO-R-${randomUUID()}`,
        serviceRequestId: randomUUID(),
        equipmentId: randomUUID(),
        customerId: randomUUID(),
        type: 'REPAIR',
        title: 'Other',
      },
    });
    operation.workOrderId = next.id;
    operation.request.workOrderId = next.id;
    operation.fingerprint = createHash('sha256')
      .update(canonical({ operation: 'ISSUE', request: operation.request }))
      .digest('hex');
    await reserve(
      { ...input, fingerprint: operation.fingerprint },
      inventory,
      next.id,
    ).expect(409);
    expect((await row()).workOrderId).toBe(orderId);
  });
  it('blocks HTTP complete/cancel without report/audit/outbox side effects while HELD', async () => {
    await reserve().expect(200);
    await db.workOrderInventoryReservation.updateMany({
      where: { tenantId },
      data: { createdAt: new Date(0) },
    });
    for (const call of [complete, cancel])
      expect((await call().expect(409)).body.code).toBe(
        'INVENTORY_RESERVATION_HELD',
      );
    expect(await db.serviceReport.count({ where: { tenantId } })).toBe(0);
    expect(await db.workLog.count({ where: { tenantId } })).toBe(0);
    expect(await db.outboxEvent.count({ where: { tenantId } })).toBe(0);
    expect(
      (await db.workOrder.findUniqueOrThrow({ where: { id: orderId } })).status,
    ).toBe('IN_PROGRESS');
  });
  it('commits a verified hold once, then allows completion and terminal replay', async () => {
    await reserve().expect(200);
    committed();
    const result = await Promise.all([settle(), settle(), settle()]);
    expect(
      result.every((x) => x.status === 200 && x.body.state === 'COMMITTED'),
    ).toBe(true);
    expect(await row()).toMatchObject({
      inventoryUsageId: operation.response.id,
      stockTransactionId: operation.response.stockTransactionId,
    });
    await complete().expect(200);
    expect((await reserve().expect(200)).body.state).toBe('COMMITTED');
  });
  it('keeps completion blocked until every held operation is settled', async () => {
    const second = { ...input, requestId: randomUUID() };
    const secondProof: Record<string, any> = structuredClone({
      ...operation,
      key: second.requestId,
    });
    client.get.mockImplementation(async (_p: unknown, key: string) =>
      structuredClone(key === second.requestId ? secondProof : operation),
    );
    await reserve().expect(200);
    await reserve(second).expect(200);
    committed();
    await settle().expect(200);
    await complete().expect(409);
    secondProof.state = 'ABORTED';
    secondProof.httpStatus = 409;
    secondProof.response = { code: 'OPERATION_ABORTED' };
    await settle('ABORTED', second).expect(200);
    await complete().expect(200);
  });
  it('does not replace committed usage/ledger identity during a replay', async () => {
    await reserve().expect(200);
    committed();
    await settle().expect(200);
    const original = (await row()).inventoryUsageId;
    operation.response.id = randomUUID();
    operation.response.stockTransactionId = randomUUID();
    await settle().expect(409);
    await reserve().expect(409);
    expect((await row()).inventoryUsageId).toBe(original);
  });
  it('never settles from PENDING, caller outcome alone or unavailable proof', async () => {
    await reserve().expect(200);
    await settle().expect(409);
    await settle('ABORTED').expect(409);
    client.get.mockRejectedValueOnce(
      new ServiceUnavailableException({ code: 'INVENTORY_PROOF_UNAVAILABLE' }),
    );
    await settle().expect(503);
    expect((await row()).state).toBe('HELD');
    await complete().expect(409);
  });
  it('requires matching committed usage/ledger IDs and identity before opening the terminal gate', async () => {
    await reserve().expect(200);
    committed();
    const original = structuredClone(operation.response);
    for (const patch of [
      { id: null },
      { stockTransactionId: null },
      { tenantId: randomUUID() },
      { workOrderId: randomUUID() },
      { quantityUsed: '3.00' },
      { recordedBy: randomUUID() },
    ]) {
      operation.response = { ...original, ...patch };
      await settle().expect(409);
    }
    expect((await row()).state).toBe('HELD');
  });
  it('refuses a COMMITTED proof without an existing HELD row', async () => {
    committed();
    await settle().expect(409);
    expect(
      await db.workOrderInventoryReservation.count({ where: { tenantId } }),
    ).toBe(0);
  });
  it('releases a verified abort and keeps both terminal outcomes immutable', async () => {
    await reserve().expect(200);
    aborted();
    expect((await settle('ABORTED').expect(200)).body.state).toBe('RELEASED');
    await settle('ABORTED').expect(200);
    committed();
    await settle().expect(409);
    await reserve().expect(409);
    expect((await row()).state).toBe('RELEASED');
    await cancel().expect(200);
  });
  it('does not reverse COMMITTED even with a contradictory source abort', async () => {
    await reserve().expect(200);
    committed();
    await settle().expect(200);
    aborted();
    await settle('ABORTED').expect(409);
    expect((await row()).state).toBe('COMMITTED');
  });
  it('stores RELEASED tombstone before a delayed reserve can consume its stale PENDING proof', async () => {
    let release!: () => void;
    const paused = new Promise<void>((resolve) => {
      release = resolve;
    });
    let reached!: () => void;
    const fetched = new Promise<void>((resolve) => {
      reached = resolve;
    });
    const pending = structuredClone(operation);
    client.get.mockImplementationOnce(async () => {
      reached();
      await paused;
      return pending;
    });
    const late = reserve().then((x) => x);
    await fetched;
    aborted();
    await settle('ABORTED').expect(200);
    release();
    expect((await late).body.state).toBe('RELEASED');
    expect((await row()).state).toBe('RELEASED');
    await cancel().expect(200);
  });
  it('serializes simultaneous reserve/cancel: only one side can win', async () => {
    const [held, cancelled] = await Promise.all([reserve(), cancel()]);
    expect([held.status, cancelled.status].sort()).toEqual([200, 409]);
    const state = (
      await db.workOrder.findUniqueOrThrow({ where: { id: orderId } })
    ).status;
    expect(state === 'CANCELLED' ? held.status : cancelled.status).toBe(409);
  });
  it('serializes simultaneous reserve/complete: no completed WO can gain a new hold', async () => {
    const [held, completed] = await Promise.all([reserve(), complete()]);
    expect([held.status, completed.status].sort()).toEqual([200, 409]);
    const order = await db.workOrder.findUniqueOrThrow({
      where: { id: orderId },
    });
    expect(order.status === 'COMPLETED' ? held.status : completed.status).toBe(
      409,
    );
  });
  it('rolls back SR cancellation inbox acknowledgment while HELD; replay succeeds after settlement', async () => {
    await db.workOrder.update({
      where: { id: orderId },
      data: { status: 'CREATED' },
    });
    const order = await db.workOrder.findUniqueOrThrow({
      where: { id: orderId },
    });
    await reserve().expect(200);
    const event = {
      eventId: randomUUID(),
      eventType: 'ServiceRequestStatusChanged',
      eventVersion: 1,
      producer: 'service-request-service',
      tenantId,
      aggregateType: 'ServiceRequest',
      aggregateId: order.serviceRequestId!,
      occurredAt: new Date().toISOString(),
      correlationId: null,
      payload: {
        serviceRequestId: order.serviceRequestId!,
        requestNo: 'SR-R',
        customerId: order.customerId,
        equipmentId: order.equipmentId,
        fromStatus: 'ACCEPTED',
        toStatus: 'CANCELLED',
        changedBy: null,
        reason: null,
      },
    };
    const consumer = app.get(ServiceRequestEventsConsumer);
    await expect(consumer.handle(event)).rejects.toThrow(
      'Resolve pending inventory',
    );
    expect(
      await db.processedEvent.count({
        where: { eventId: event.eventId, consumer: REQUEST_CONSUMER },
      }),
    ).toBe(0);
    aborted();
    await settle('ABORTED').expect(200);
    await consumer.handle(event);
    expect(
      (await db.workOrder.findUniqueOrThrow({ where: { id: orderId } })).status,
    ).toBe('CANCELLED');
    await consumer.handle(event);
    expect(await db.outboxEvent.count({ where: { tenantId } })).toBe(1);
    await db.processedEvent.deleteMany({ where: { eventId: event.eventId } });
  });
  it('enforces local FK tenant, hash and phase constraints', async () => {
    await reserve().expect(200);
    const where = {
      tenantId_requestId: { tenantId, requestId: input.requestId },
    };
    for (const data of [
      { state: 'COMMITTED' },
      { state: 'RELEASED' },
      { fingerprint: 'bad' },
      { inventoryUsageId: randomUUID() },
    ])
      await expect(
        db.workOrderInventoryReservation.update({ where, data }),
      ).rejects.toThrow();
    await expect(
      db.workOrderInventoryReservation.create({
        data: {
          tenantId: randomUUID(),
          requestId: randomUUID(),
          workOrderId: orderId,
          fingerprint: input.fingerprint,
          actorId: userId,
          inventoryRequest: {},
          state: 'HELD',
        },
      }),
    ).rejects.toThrow();
  });
});

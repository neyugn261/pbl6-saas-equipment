import { BranchAccessClient } from '@pbl6/auth';
import { fixtureBranchContext } from '@pbl6/testing';
import { randomUUID } from 'node:crypto';
import {
  ConflictException,
  ServiceUnavailableException,
  type INestApplication,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { configureApp } from '@pbl6/service-kit';
import { signTestAccessToken } from '@pbl6/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { EventsService } from '../src/events/events.service';
import {
  ReferencesClient,
  type Reservation,
  type ReservationRequest,
  type SettlementRequest,
} from '../src/inventory/references.client';
import type { Principal } from '@pbl6/auth';

/** PostgreSQL + real Inventory HTTP. WO reservation is an explicit contract fixture;
 * this suite never claims the owner's still-missing reservation runtime is E2E. */
describe('Inventory PostgreSQL transactions and reservation recovery', () => {
  const tenantId = randomUUID(),
    otherTenant = randomUUID(),
    branchId = randomUUID(),
    workOrderId = randomUUID();
  const equipmentId = randomUUID(),
    customerId = randomUUID(),
    reportId = randomUUID(),
    technicianId = randomUUID(),
    techUserId = randomUUID();
  const technicianToken = signTestAccessToken({
    role: 'TECHNICIAN',
    tenantId,
    userId: techUserId,
  });
  const customerToken = signTestAccessToken({
    role: 'CUSTOMER_USER',
    tenantId,
    customerId,
  });
  const token = signTestAccessToken({ role: 'INVENTORY_STAFF', tenantId });
  const foreignToken = signTestAccessToken({
    role: 'INVENTORY_STAFF',
    tenantId: otherTenant,
  });
  let app: INestApplication, db: PrismaService;
  let partId: string, warehouseId: string;
  let woStatus = 'IN_PROGRESS',
    missingWO = false,
    reserveUnavailable = false,
    settleUnavailable = false,
    loseReserveResponse = false;
  const holds = new Map<string, Reservation>();
  const refs = {
    workOrderDetail: jest.fn(async (id: string) =>
      !missingWO && id === workOrderId
        ? {
            id,
            status: woStatus,
            equipmentId,
            customerId,
            workOrderNo: 'WO-ACCOUNTABILITY',
            currentTechnicianId: woStatus === 'COMPLETED' ? null : technicianId,
            currentAssignment:
              woStatus === 'COMPLETED'
                ? null
                : { technicianUserId: techUserId },
          }
        : null,
    ),
    assignments: jest.fn(async () => [
      {
        technicianId,
        technicianUserId: techUserId,
        status: woStatus === 'COMPLETED' ? 'COMPLETED' : 'ACCEPTED',
      },
    ]),
    serviceReport: jest.fn(async (id: string) =>
      id === workOrderId ? { id: reportId, workOrderId, technicianId } : null,
    ),
    equipment: jest.fn(async (id: string, p: Principal) =>
      id === equipmentId &&
      p.tenantId === tenantId &&
      (p.userType !== 'CUSTOMER' || p.customerId === customerId)
        ? { id, customerId }
        : null,
    ),
    branch: jest.fn(async (id: string, _p?: Principal) =>
      id === branchId ? { id, status: 'ACTIVE' } : null,
    ),
    workOrder: jest.fn(async (id: string) =>
      !missingWO && id === workOrderId ? { id, branchId, status: woStatus } : null,
    ),
    reserve: jest.fn(async (id: string, body: ReservationRequest) => {
      if (reserveUnavailable)
        throw new ServiceUnavailableException({
          code: 'WO_RESERVATION_UNAVAILABLE',
          message: 'test fixture unavailable',
        });
      let row = holds.get(body.requestId);
      if (!row) {
        if (
          missingWO ||
          id !== workOrderId ||
          ['COMPLETED', 'CANCELLED'].includes(woStatus)
        )
          throw new ConflictException({
            code: 'WO_TERMINAL',
            message: 'Work order terminal',
          });
        row = { ...body, workOrderId: id, state: 'HELD' };
        holds.set(body.requestId, row);
      }
      if (loseReserveResponse) {
        loseReserveResponse = false;
        throw new ServiceUnavailableException('lost hold response');
      }
      return row;
    }),
    settle: jest.fn(
      async (id: string, body: SettlementRequest, p: Principal) => {
        if (settleUnavailable) throw new Error('test settlement outage');
        const proof = await db.inventoryOperation.findUniqueOrThrow({
          where: {
            tenantId_key: { tenantId: p.tenantId!, key: body.requestId },
          },
        });
        expect(proof.fingerprint).toBe(body.fingerprint);
        expect(proof.state).toBe(body.outcome);
        const row: Reservation = {
          requestId: body.requestId,
          fingerprint: body.fingerprint,
          workOrderId: id,
          state: body.outcome === 'COMMITTED' ? 'COMMITTED' : 'RELEASED',
        };
        holds.set(body.requestId, row);
        return row;
      },
    ),
  };
  const api = (
    method: 'get' | 'post' | 'patch' | 'put',
    path: string,
    body?: object,
    key?: string,
    auth = token,
  ) => {
    const call = request(app.getHttpServer())
      [method](path)
      .auth(auth, { type: 'bearer' });
    if (key) call.set('Idempotency-Key', key);
    if (body && path.endsWith('/return')) body = { condition: 'GOOD', ...body };
    return body === undefined ? call : call.send(body);
  };
  const move = (quantity: string, extra = {}) => ({
    warehouseId,
    partId,
    quantity,
    documentReference: 'TEST-RECEIPT',
    ...('direction' in extra ? { reasonCode: 'COUNT_VARIANCE' } : {}),
    ...extra,
  });
  const receive = (quantity = '10', key = randomUUID()) =>
    api('post', '/stock-transactions/receive', move(quantity), key);

  it('ledger resolves inactive part/warehouse metadata independently of dropdown pages, preserving snapshots', async () => {
    await receive().expect(201);
    const before = await db.stockTransaction.findFirstOrThrow({ where: { tenantId, partId },
    });
    await db.part.update({ where: { id: partId }, data: { status: 'INACTIVE', name: 'Renamed inactive part' },
    });
    await db.warehouse.update({ where: { id: warehouseId }, data: { status: 'INACTIVE', name: 'Renamed inactive warehouse' },
    });
    const response = await api('get', `/stock-transactions?partId=${partId}`,
    ).expect(200);
    expect(response.body.items[0]).toMatchObject({
      partId,
      warehouseId,
      part: { name: 'Renamed inactive part' },
      warehouse: { name: 'Renamed inactive warehouse' },
      partSnapshot: before.partSnapshot,
      warehouseSnapshot: before.warehouseSnapshot,
    });
    const foreign = await api(
      'get',
      `/stock-transactions?partId=${partId}`,
      undefined,
      undefined,
      foreignToken,
    ).expect(200);
    expect(foreign.body.items).toEqual([]);
  });
  const issue = (quantity = '1', key = randomUUID()) =>
    api(
      'post',
      `/work-orders/${workOrderId}/parts`,
      move(quantity, { unitCost: '0.30', unitCostCurrency: 'VND' }),
      key,
    );
  const stock = () =>
    db.stock.findUniqueOrThrow({
      where: { warehouseId_partId: { warehouseId, partId } },
    });
  async function boot() {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(BranchAccessClient)
      .useValue(fixtureBranchContext(branchId))
      .overrideProvider(ReferencesClient)
      .useValue(refs)
      .overrideProvider(EventsService)
      .useValue({})
      .compile();
    app = module.createNestApplication({ logger: false });
    configureApp(app, { logger: { log() {}, warn() {}, error() {} } });
    await app.init();
    db = app.get(PrismaService);
  }
  async function cleanup() {
    // Dedicated test DB is enforced by setup before these scoped deletes.
    await db.$transaction(async (tx) => {
      await tx.usageConfirmation.deleteMany({ where: { tenantId } });
      await tx.inventoryAudit.deleteMany({ where: { tenantId } });
      await tx.stockTransaction.deleteMany({
        where: { tenantId, type: 'RETURN' },
      });
      await tx.workOrderPart.deleteMany({ where: { tenantId } });
      await tx.stockTransaction.deleteMany({ where: { tenantId } });
      await tx.stock.deleteMany({ where: { tenantId } });
      await tx.outboxEvent.deleteMany({ where: { tenantId } });
      await tx.inventoryOperation.deleteMany({ where: { tenantId } });
      await tx.warehouse.deleteMany({ where: { tenantId } });
      await tx.part.deleteMany({ where: { tenantId } });
    });
  }
  beforeAll(boot);
  beforeEach(async () => {
    await cleanup();
    jest.clearAllMocks();
    holds.clear();
    woStatus = 'IN_PROGRESS';
    missingWO = false;
    reserveUnavailable = false;
    settleUnavailable = false;
    loseReserveResponse = false;
    partId = (
      await api('post', '/parts', {
        sku: 'FILTER',
        name: 'Filter',
        unit: 'm',
        allowFractional: true,
      }).expect(201)
    ).body.id;
    warehouseId = (
      await api('post', '/warehouses', {
        branchId,
        code: 'MAIN',
        name: 'Main store',
      }).expect(201)
    ).body.id;
  });
  afterAll(async () => {
    if (db) await cleanup();
    await app?.close();
  });

  it('scopes catalogue by token, rejects duplicate codes and keeps immutable fields', async () => {
    await api(
      'get',
      `/parts/${partId}`,
      undefined,
      undefined,
      foreignToken,
    ).expect(404);
    await api(
      'get',
      `/warehouses/${warehouseId}`,
      undefined,
      undefined,
      foreignToken,
    ).expect(404);
    expect(
      (
        await api('get', '/parts', undefined, undefined, foreignToken).expect(
          200,
        )
      ).body.total,
    ).toBe(0);
    await api('post', '/parts', {
      sku: 'FILTER',
      name: 'Duplicate',
      unit: 'pc',
    }).expect(409);
    await api('post', '/warehouses', {
      branchId,
      code: 'MAIN',
      name: 'Duplicate',
    }).expect(409);
    await api('patch', `/parts/${partId}`, { unit: 'other' }).expect(400);
    await api('patch', `/parts/${partId}`, {}).expect(400);
    await api('patch', `/warehouses/${warehouseId}`, {
      branchId: randomUUID(),
    }).expect(400);
    await api('put', `/warehouses/${warehouseId}/stocks/${partId}`, {
      quantity: '12',
      minQuantity: '2',
    }).expect(400);
  });
  it('validates active Branch with caller token and leaves no warehouse on failure', async () => {
    expect(refs.branch.mock.calls[0][1]?.accessToken).toBe(token);
    await api('post', '/warehouses', {
      branchId: randomUUID(),
      code: 'BAD',
      name: 'Bad',
    }).expect(404);
    refs.branch.mockResolvedValueOnce({ id: branchId, status: 'INACTIVE' });
    await api('post', '/warehouses', {
      branchId,
      code: 'BAD',
      name: 'Bad',
    }).expect(422);
    refs.branch.mockRejectedValueOnce(
      new ServiceUnavailableException('test source unavailable'),
    );
    await api('post', '/warehouses', {
      branchId,
      code: 'BAD',
      name: 'Bad',
    }).expect(503);
    expect(await db.warehouse.count({ where: { tenantId } })).toBe(1);
  });
  it('normalizes decimal retries and keeps one ledger entry per tenant key', async () => {
    const key = randomUUID();
    const first = await receive('0.10', key).expect(201);
    const retry = await receive('0.1', key).expect(201);
    expect(retry.body).toEqual(first.body);
    expect(first.body.quantity).toBe('0.10');
    await receive('0.11', key).expect(409);
    await api(
      'post',
      '/stock-transactions/adjust',
      move('0.10', { direction: 'ADJUST_IN', note: 'count' }),
      key,
    ).expect(409);
    expect((await stock()).quantity.toFixed(2)).toBe('0.10');
    expect(await db.stockTransaction.count({ where: { tenantId } })).toBe(1);
  });
  it('serializes concurrent fractional receipts with exact balances', async () => {
    const results = await Promise.all(
      Array.from({ length: 12 }, () => receive('0.01')),
    );
    expect(results.every((r) => r.status === 201)).toBe(true);
    expect((await stock()).quantity.toFixed(2)).toBe('0.12');
    const ledger = await db.stockTransaction.findMany({
      where: { tenantId },
      orderBy: { balanceAfter: 'asc' },
    });
    expect(ledger).toHaveLength(12);
    expect(ledger[11].balanceAfter!.toFixed(2)).toBe('0.12');
  });
  it('requires UUID idempotency keys and rejects zero, invalid precision and numeric JSON', async () => {
    await api('post', '/stock-transactions/receive', move('1')).expect(400);
    await receive('1', 'bad-key' as never).expect(400);
    for (const value of ['0', '-1', '1.001', '1e3', '10000000000', 1])
      await api(
        'post',
        '/stock-transactions/receive',
        move(value as string),
        randomUUID(),
      ).expect(400);
    expect(await db.stockTransaction.count({ where: { tenantId } })).toBe(0);
  });
  it('prevents negative adjustment, requires reason and checks overflow', async () => {
    await receive('1').expect(201);
    await api(
      'post',
      '/stock-transactions/adjust',
      move('2', { direction: 'ADJUST_OUT', note: 'count' }),
      randomUUID(),
    ).expect(409);
    await api(
      'post',
      '/stock-transactions/adjust',
      move('1', { direction: 'ADJUST_IN' }),
      randomUUID(),
    ).expect(400);
    await receive('9999999999.99').expect(409);
    expect((await stock()).quantity.toFixed(2)).toBe('1.00');
    expect(await db.stockTransaction.count({ where: { tenantId } })).toBe(1);
  });
  it('blocks new mutations on INACTIVE catalogue and foreign references', async () => {
    await api('patch', `/parts/${partId}`, { status: 'INACTIVE' }).expect(200);
    await receive().expect(422);
    await api('patch', `/parts/${partId}`, { status: 'ACTIVE' }).expect(200);
    await api('patch', `/warehouses/${warehouseId}`, {
      status: 'INACTIVE',
    }).expect(200);
    await receive().expect(422);
    await api('put', `/warehouses/${warehouseId}/stocks/${partId}`, {
      minQuantity: '5',
    }).expect(422);
    await api(
      'post',
      '/stock-transactions/receive',
      move('1'),
      randomUUID(),
      foreignToken,
    ).expect(404);
  });
  it('latches below threshold, clears at equality, and emits a distinct new occurrence', async () => {
    await api('put', `/warehouses/${warehouseId}/stocks/${partId}`, {
      minQuantity: '5',
    }).expect(200);
    await api('put', `/warehouses/${warehouseId}/stocks/${partId}`, {
      minQuantity: '6',
    }).expect(200);
    await receive('2').expect(201);
    expect(await db.outboxEvent.count({ where: { tenantId } })).toBe(1);
    await receive('4').expect(201);
    expect((await stock()).lowStockAlertedAt).toBeNull();
    await api(
      'post',
      '/stock-transactions/adjust',
      move('0.01', { direction: 'ADJUST_OUT', note: 'count' }),
      randomUUID(),
    ).expect(201);
    const events = await db.outboxEvent.findMany({ where: { tenantId } });
    expect(events).toHaveLength(2);
    expect(events[0].id).not.toBe(events[1].id);
    expect(
      events
        .map((e) => (e.payload as { data: { quantity: string } }).data.quantity)
        .sort(),
    ).toEqual(['0.00', '5.99']);
    expect(
      (await api('get', '/stocks?lowStock=true').expect(200)).body.total,
    ).toBe(1);
  });
  it('fails closed without reservation support and persists recoverable PENDING without stock writes', async () => {
    await receive().expect(201);
    reserveUnavailable = true;
    const key = randomUUID();
    await issue('2', key).expect(503);
    expect((await stock()).quantity.toFixed(2)).toBe('10.00');
    expect(await db.workOrderPart.count({ where: { tenantId } })).toBe(0);
    const proof = await api('get', `/inventory-operations/${key}`).expect(200);
    expect(proof.body.state).toBe('PENDING');
    expect(proof.body.recovery.stockOutcome).toBe('UNCONFIRMED');
    expect(proof.body.recovery.nextActions).toContain('RETRY_SAME_OPERATION');
    await api(
      'get',
      `/inventory-operations/${key}`,
      undefined,
      undefined,
      signTestAccessToken({ role: 'TENANT_ADMIN', tenantId }),
    ).expect(200);
    expect(refs.workOrder).toHaveBeenCalledTimes(1); // Initial ISSUE validates WO branch; proof lookup stays local.
    expect(JSON.stringify(proof.body)).not.toContain(token);
    await api(
      'get',
      `/inventory-operations/${key}`,
      undefined,
      undefined,
      foreignToken,
    ).expect(404);
  });
  it('atomically issues stock, immutable ledger and usage then settles by committed proof', async () => {
    await receive().expect(201);
    const key = randomUUID();
    const first = await issue('2.50', key).expect(201);
    expect(first.body.quantityUsed).toBe('2.50');
    expect(first.body.unitCost).toBe('0.30');
    expect(first.headers['x-inventory-reservation-state']).toBe('SETTLED');
    woStatus = 'COMPLETED';
    const repeat = await issue('2.5', key).expect(201);
    expect(repeat.body).toEqual(first.body);
    expect(refs.reserve).toHaveBeenCalledTimes(1);
    expect((await stock()).quantity.toFixed(2)).toBe('7.50');
    const ledger = await db.stockTransaction.findUniqueOrThrow({
      where: { id: first.body.stockTransactionId },
    });
    expect(ledger.type).toBe('ISSUE');
    expect(ledger.referenceId).toBe(workOrderId);
    expect(holds.get(key)?.state).toBe('COMMITTED');
  });
  it('rejects terminal Work Orders and releases only after durable local abort', async () => {
    await receive().expect(201);
    woStatus = 'COMPLETED';
    const key = randomUUID();
    await issue('2', key).expect(409);
    expect(
      (
        await db.inventoryOperation.findUniqueOrThrow({
          where: { tenantId_key: { tenantId, key } },
        })
      ).state,
    ).toBe('ABORTED');
    expect(holds.get(key)?.state).toBe('RELEASED');
    expect((await stock()).quantity.toFixed(2)).toBe('10.00');
  });
  it('serializes competing issues and releases the failed reservation without negative stock', async () => {
    await receive('3').expect(201);
    const results = await Promise.all([issue('2'), issue('2')]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect((await stock()).quantity.toFixed(2)).toBe('1.00');
    expect(await db.workOrderPart.count({ where: { tenantId } })).toBe(1);
    expect([...holds.values()].map((h) => h.state).sort()).toEqual([
      'COMMITTED',
      'RELEASED',
    ]);
  });
  it('deduplicates simultaneous retries with one stock write, usage and low-stock occurrence', async () => {
    await receive('5').expect(201);
    await api('put', `/warehouses/${warehouseId}/stocks/${partId}`, {
      minQuantity: '5',
    }).expect(200);
    const key = randomUUID();
    const results = await Promise.all([issue('1', key), issue('1.00', key)]);
    expect(results.map((r) => r.status)).toEqual([201, 201]);
    expect(results[0].body).toEqual(results[1].body);
    expect((await stock()).quantity.toFixed(2)).toBe('4.00');
    expect(await db.workOrderPart.count({ where: { tenantId } })).toBe(1);
    expect(await db.outboxEvent.count({ where: { tenantId } })).toBe(1);
  });
  it('does not release a reservation when abort races a committing issue', async () => {
    await receive().expect(201);
    let release!: () => void, observed!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const acquired = new Promise<void>((resolve) => {
      observed = resolve;
    });
    const original = refs.reserve.getMockImplementation()!;
    refs.reserve.mockImplementationOnce(async (id, body) => {
      const row = await original(id, body);
      observed();
      await gate;
      return row;
    });
    const key = randomUUID();
    const issuing = issue('2', key).then((r) => r);
    await acquired;
    expect(holds.get(key)?.state).toBe('HELD');
    const aborting = api('post', `/inventory-operations/${key}/abort`).then(
      (r) => r,
    );
    await new Promise((resolve) => setTimeout(resolve, 40));
    release();
    expect((await issuing).status).toBe(201);
    expect((await aborting).status).toBe(409);
    expect(holds.get(key)?.state).toBe('COMMITTED');
    expect((await stock()).quantity.toFixed(2)).toBe('8.00');
    expect(
      refs.settle.mock.calls.every(([, body]) => body.outcome === 'COMMITTED'),
    ).toBe(true);
  });
  it('recovers a lost hold response with the same reservation and original actor', async () => {
    await receive().expect(201);
    const key = randomUUID();
    loseReserveResponse = true;
    await issue('2', key).expect(503);
    expect(holds.get(key)?.state).toBe('HELD');
    expect((await stock()).quantity.toFixed(2)).toBe('10.00');
    await api('post', `/inventory-operations/${key}/retry`).expect(201);
    expect(holds.size).toBe(1);
    expect((await stock()).quantity.toFixed(2)).toBe('8.00');
  });
  it('keeps success durable when settlement fails and retries after an Inventory process restart', async () => {
    await receive().expect(201);
    settleUnavailable = true;
    const key = randomUUID();
    const first = await issue('2', key).expect(201);
    expect(first.headers['x-inventory-reservation-state']).toBe(
      'PENDING_FINALIZE',
    );
    expect(holds.get(key)?.state).toBe('HELD');
    await api('post', `/inventory-operations/${key}/abort`).expect(409);
    await app.close();
    await boot();
    settleUnavailable = false;
    const replay = await api(
      'post',
      `/inventory-operations/${key}/retry`,
    ).expect(201);
    expect(replay.body).toEqual(first.body);
    expect(holds.get(key)?.state).toBe('COMMITTED');
    expect((await stock()).quantity.toFixed(2)).toBe('8.00');
    expect(await db.workOrderPart.count({ where: { tenantId } })).toBe(1);
  });
  it('allows an explicit abort of a PENDING issue and prevents later stock commit for that key', async () => {
    await receive().expect(201);
    const key = randomUUID();
    loseReserveResponse = true;
    await issue('2', key).expect(503);
    await api('post', `/inventory-operations/${key}/abort`).expect(200);
    expect(holds.get(key)?.state).toBe('RELEASED');
    await api('post', `/inventory-operations/${key}/retry`).expect(409);
    expect((await stock()).quantity.toFixed(2)).toBe('10.00');
  });
  it('returns to the original inactive warehouse after WO terminal and links every return to its usage', async () => {
    await receive().expect(201);
    const usage = (await issue('3').expect(201)).body;
    woStatus = 'CANCELLED';
    await api('patch', `/parts/${partId}`, { status: 'INACTIVE' }).expect(200);
    await api('patch', `/warehouses/${warehouseId}`, {
      status: 'INACTIVE',
    }).expect(200);
    const key = randomUUID();
    const first = await api(
      'post',
      `/work-order-parts/${usage.id}/return`,
      { quantity: '1.25', note: 'Unused' },
      key,
    ).expect(200);
    expect(first.body.quantityReturned).toBe('1.25');
    expect(first.body.quantityUsed).toBe('3.00');
    missingWO = true;
    expect(
      (
        await api(
          'post',
          `/work-order-parts/${usage.id}/return`,
          { quantity: '1.25', note: 'Unused' },
          key,
        ).expect(200)
      ).body,
    ).toEqual(first.body);
    await api(
      'post',
      `/work-order-parts/${usage.id}/return`,
      { quantity: '0.25', note: 'New return' },
      randomUUID(),
    ).expect(404);
    expect((await stock()).quantity.toFixed(2)).toBe('8.25');
    const ledger = await db.stockTransaction.findFirstOrThrow({
      where: { tenantId, type: 'RETURN' },
    });
    expect(ledger.workOrderPartId).toBe(usage.id);
    expect(ledger.warehouseId).toBe(warehouseId);
  });
  it('serializes competing returns and rejects excess without changing original issue', async () => {
    await receive().expect(201);
    const usage = (await issue('3').expect(201)).body;
    const results = await Promise.all(
      [1, 2].map(() =>
        api(
          'post',
          `/work-order-parts/${usage.id}/return`,
          { quantity: '2', note: 'unused' },
          randomUUID(),
        ),
      ),
    );
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect((await stock()).quantity.toFixed(2)).toBe('9.00');
    const saved = await db.workOrderPart.findUniqueOrThrow({
      where: { id: usage.id },
    });
    expect(saved.quantityUsed.toFixed(2)).toBe('3.00');
    expect(saved.quantityReturned.toFixed(2)).toBe('2.00');
    const usages = (
      await api('get', `/work-orders/${workOrderId}/parts`).expect(200)
    ).body;
    expect(usages[0].quantityConsumed).toBe('0.00');
    expect(usages[0].quantityOutstanding).toBe('1.00');
    expect(usages[0].returns).toHaveLength(1);
  });
  it('rolls back quantity, latch, event and idempotency when the ledger write fails', async () => {
    await receive('6').expect(201);
    await api('put', `/warehouses/${warehouseId}/stocks/${partId}`, {
      minQuantity: '5',
    }).expect(200);
    const suffix = tenantId.replaceAll('-', '');
    const func = `inventory_test_fail_${suffix}`;
    await db.$executeRawUnsafe(
      `CREATE FUNCTION ${func}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.tenant_id = '${tenantId}'::uuid AND NEW.note = 'force rollback' THEN RAISE EXCEPTION 'test ledger failure'; END IF; RETURN NEW; END $$`,
    );
    await db.$executeRawUnsafe(
      `CREATE TRIGGER ${func} BEFORE INSERT ON stock_transactions FOR EACH ROW EXECUTE FUNCTION ${func}()`,
    );
    try {
      const key = randomUUID();
      await api(
        'post',
        '/stock-transactions/adjust',
        move('2', { direction: 'ADJUST_OUT', note: 'force rollback' }),
        key,
      ).expect(500);
      expect((await stock()).quantity.toFixed(2)).toBe('6.00');
      expect((await stock()).lowStockAlertedAt).toBeNull();
      expect(await db.outboxEvent.count({ where: { tenantId } })).toBe(0);
      expect(
        await db.inventoryOperation.count({ where: { tenantId, key } }),
      ).toBe(0);
    } finally {
      await db.$executeRawUnsafe(`DROP TRIGGER ${func} ON stock_transactions`);
      await db.$executeRawUnsafe(`DROP FUNCTION ${func}()`);
    }
  });
  it('normalizes unit aliases and rejects fractional movement and threshold for whole parts', async () => {
    const whole = (
      await api('post', '/parts', {
        sku: 'BOARD',
        name: 'Board',
        unit: 'PCS',
      }).expect(201)
    ).body;
    expect(whole.unit).toBe('cái');
    expect(whole.allowFractional).toBe(false);
    await api('post', '/parts', {
      sku: 'BAD-FRACTIONAL',
      name: 'Invalid board',
      unit: 'pcs',
      allowFractional: true,
    }).expect(422);
    await api(
      'post',
      '/stock-transactions/receive',
      { ...move('0.5'), partId: whole.id },
      randomUUID(),
    ).expect(422);
    await api('put', `/warehouses/${warehouseId}/stocks/${whole.id}`, {
      minQuantity: '0.5',
    }).expect(422);
    expect(await db.stock.count({ where: { partId: whole.id } })).toBe(0);
    await api(
      'post',
      '/stock-transactions/receive',
      { ...move('1'), partId: whole.id },
      randomUUID(),
    ).expect(201);
    await api('patch', `/parts/${whole.id}`, { allowFractional: true }).expect(
      400,
    );
  });
  it('keeps internal reference cost and currency paired without treating unknown as zero', async () => {
    await receive('3').expect(201);
    await api(
      'post',
      `/work-orders/${workOrderId}/parts`,
      move('1', { unitCost: '10' }),
      randomUUID(),
    ).expect(422);
    await api(
      'post',
      `/work-orders/${workOrderId}/parts`,
      move('1', { unitCostCurrency: 'VND' }),
      randomUUID(),
    ).expect(422);
    const result = (
      await api(
        'post',
        `/work-orders/${workOrderId}/parts`,
        move('1'),
        randomUUID(),
      ).expect(201)
    ).body;
    expect(result.unitCost).toBeNull();
    expect(result.unitCostCurrency).toBeNull();
  });
  it('keeps catalog/threshold audit and historical snapshots after a rename', async () => {
    const receipt = (await receive('3').expect(201)).body;
    await api('patch', `/parts/${partId}`, { name: 'Renamed filter' }).expect(
      200,
    );
    await api('patch', `/warehouses/${warehouseId}`, {
      name: 'Renamed store',
    }).expect(200);
    await api('put', `/warehouses/${warehouseId}/stocks/${partId}`, {
      minQuantity: '2',
    }).expect(200);
    const history = (
      await api(
        'get',
        `/inventory-audit?entityType=PART&entityId=${partId}`,
      ).expect(200)
    ).body;
    expect(history.total).toBe(2);
    expect(history.items[0].before.name).toBe('Filter');
    expect(history.items[0].after.name).toBe('Renamed filter');
    const ledger = (await api('get', '/stock-transactions').expect(200)).body;
    expect(ledger.items[0].id).toBe(receipt.id);
    expect(ledger.items[0].partSnapshot.name).toBe('Filter');
    expect(ledger.items[0].warehouseSnapshot.name).toBe('Main store');
    expect(
      (
        await api(
          'get',
          '/inventory-audit',
          undefined,
          undefined,
          foreignToken,
        ).expect(200)
      ).body.total,
    ).toBe(0);
  });
  it('requires receipt evidence and structured correction to the same source, with a bounded quantity', async () => {
    await api(
      'post',
      '/stock-transactions/receive',
      { warehouseId, partId, quantity: '3' },
      randomUUID(),
    ).expect(400);
    const receipt = (await receive('3').expect(201)).body;
    const correction = (quantity: string, extra = {}) =>
      api(
        'post',
        '/stock-transactions/adjust',
        move(quantity, {
          direction: 'ADJUST_OUT',
          reasonCode: 'CORRECTION',
          relatedTransactionId: receipt.id,
          note: 'Original receipt entered too high',
          ...extra,
        }),
        randomUUID(),
      );
    await correction('1').expect(201);
    await correction('2').expect(201);
    await correction('0.01').expect(409);
    await correction('1', { direction: 'ADJUST_IN' }).expect(422);
    await correction('1', { relatedTransactionId: randomUUID() }).expect(422);
    expect((await stock()).quantity.toFixed(2)).toBe('0.00');
    expect(
      (
        await api(
          'get',
          `/stock-transactions?relatedTransactionId=${receipt.id}`,
        ).expect(200)
      ).body.total,
    ).toBe(2);
  });
  it('quarantines damaged returns and releases/scraps only the unresolved source quantity', async () => {
    await receive('2').expect(201);
    const usage = (await issue('2').expect(201)).body;
    const returned = (
      await api(
        'post',
        `/work-order-parts/${usage.id}/return`,
        { quantity: '2', note: 'Damaged in transit', condition: 'DAMAGED' },
        randomUUID(),
      ).expect(200)
    ).body;
    expect(returned.quantityReturned).toBe('2.00');
    expect((await stock()).quantity.toFixed(2)).toBe('0.00');
    expect((await stock()).quantityQuarantined.toFixed(2)).toBe('2.00');
    await issue('1').expect(409);
    const ret = await db.stockTransaction.findFirstOrThrow({
      where: { tenantId, type: 'RETURN' },
    });
    const key = randomUUID();
    const input = {
      quantity: '1',
      disposition: 'RELEASE',
      note: 'Inspection passed; packaging only damaged',
    };
    const first = await api(
      'post',
      `/stock-transactions/${ret.id}/inspect`,
      input,
      key,
    ).expect(201);
    expect(
      (
        await api(
          'post',
          `/stock-transactions/${ret.id}/inspect`,
          input,
          key,
        ).expect(201)
      ).body,
    ).toEqual(first.body);
    await api(
      'post',
      `/stock-transactions/${ret.id}/inspect`,
      { quantity: '1', disposition: 'SCRAP', note: 'Unusable part' },
      randomUUID(),
    ).expect(201);
    await api(
      'post',
      `/stock-transactions/${ret.id}/inspect`,
      input,
      randomUUID(),
    ).expect(409);
    expect((await stock()).quantity.toFixed(2)).toBe('1.00');
    expect((await stock()).quantityQuarantined.toFixed(2)).toBe('0.00');
  });
  it('keeps pending-inspection stock unavailable after WO closure and blocks release from an inactive catalog', async () => {
    await receive('1').expect(201);
    const usage = (await issue('1').expect(201)).body;
    woStatus = 'COMPLETED';
    await api('patch', `/parts/${partId}`, { status: 'INACTIVE' }).expect(200);
    await api(
      'post',
      `/work-order-parts/${usage.id}/return`,
      {
        quantity: '1',
        condition: 'PENDING_INSPECTION',
        note: 'Awaiting inspection',
      },
      randomUUID(),
    ).expect(200);
    const ret = await db.stockTransaction.findFirstOrThrow({
      where: { tenantId, type: 'RETURN' },
    });
    await api(
      'post',
      `/stock-transactions/${ret.id}/inspect`,
      { quantity: '1', disposition: 'RELEASE', note: 'Checked' },
      randomUUID(),
    ).expect(422);
    await api(
      'post',
      `/stock-transactions/${ret.id}/inspect`,
      { quantity: '1', disposition: 'SCRAP', note: 'Unusable' },
      randomUUID(),
    ).expect(201);
    expect((await stock()).quantity.toFixed(2)).toBe('0.00');
  });
  it('serializes concurrent inspections of the same quarantined return without double release or scrap', async () => {
    await receive('2').expect(201);
    const usage = (await issue('2').expect(201)).body;
    await api(
      'post',
      `/work-order-parts/${usage.id}/return`,
      {
        quantity: '2',
        condition: 'PENDING_INSPECTION',
        note: 'Awaiting inspection',
      },
      randomUUID(),
    ).expect(200);
    const original = await db.stockTransaction.findFirstOrThrow({
      where: { tenantId, type: 'RETURN' },
    });
    const results = await Promise.all(
      ['RELEASE', 'SCRAP'].map((disposition) =>
        api(
          'post',
          `/stock-transactions/${original.id}/inspect`,
          { quantity: '2', disposition, note: 'Concurrent inspection result' },
          randomUUID(),
        ),
      ),
    );
    expect(results.map((row) => row.status).sort()).toEqual([201, 409]);
    expect((await stock()).quantityQuarantined.toFixed(2)).toBe('0.00');
    expect(
      await db.stockTransaction.count({
        where: { tenantId, relatedTransactionId: original.id },
      }),
    ).toBe(1);
  });
  const confirmationInput = (quantity = '1') => ({
    quantity,
    serviceReportId: reportId,
    customerReason: 'Replaced blocked filter',
    removedPartDisposition: 'RETURNED_TO_CUSTOMER',
    removedPartNote: 'Old blocked filter handed to customer',
    note: 'Internal workshop note',
  });
  it('requires the assigned technician and the real matching completed service report', async () => {
    await receive('3').expect(201);
    const usage = (await issue('3').expect(201)).body;
    const path = `/work-order-parts/${usage.id}/confirm-use`;
    await api('post', path, confirmationInput(), randomUUID()).expect(403);
    const otherTech = signTestAccessToken({ role: 'TECHNICIAN', tenantId });
    await api(
      'post',
      path,
      confirmationInput(),
      randomUUID(),
      otherTech,
    ).expect(403);
    await api(
      'post',
      path,
      confirmationInput(),
      randomUUID(),
      technicianToken,
    ).expect(409);
    woStatus = 'COMPLETED';
    await api(
      'post',
      path,
      { ...confirmationInput(), serviceReportId: randomUUID() },
      randomUUID(),
      technicianToken,
    ).expect(422);
    const key = randomUUID();
    const first = await api(
      'post',
      path,
      confirmationInput(),
      key,
      technicianToken,
    ).expect(201);
    expect(
      (
        await api(
          'post',
          path,
          confirmationInput(),
          key,
          technicianToken,
        ).expect(201)
      ).body,
    ).toEqual(first.body);
    expect(await db.usageConfirmation.count({ where: { tenantId } })).toBe(1);
    await api(
      'post',
      `/work-order-parts/${usage.id}/return`,
      { quantity: '1', note: 'Unused' },
      randomUUID(),
    ).expect(200);
    const row = (
      await api('get', `/work-orders/${workOrderId}/parts`).expect(200)
    ).body[0];
    expect(row.quantityIssued).toBe('3.00');
    expect(row.quantityConfirmedUsed).toBe('1.00');
    expect(row.quantityUnreconciled).toBe('1.00');
    await api(
      'post',
      `/work-order-parts/${usage.id}/return`,
      { quantity: '2', note: 'Would return an installed part' },
      randomUUID(),
    ).expect(409);
  });
  it('serializes a use confirmation racing a return against the same outstanding quantity', async () => {
    await receive('3').expect(201);
    const usage = (await issue('3').expect(201)).body;
    woStatus = 'COMPLETED';
    const results = await Promise.all([
      api(
        'post',
        `/work-order-parts/${usage.id}/confirm-use`,
        confirmationInput('2'),
        randomUUID(),
        technicianToken,
      ),
      api(
        'post',
        `/work-order-parts/${usage.id}/return`,
        { quantity: '2', note: 'Unused' },
        randomUUID(),
      ),
    ]);
    expect(results.map((row) => row.status).sort()).toEqual(
      expect.arrayContaining([409]),
    );
    expect(
      results.filter((row) => row.status === 200 || row.status === 201),
    ).toHaveLength(1);
    const row = await db.workOrderPart.findUniqueOrThrow({
      where: { id: usage.id },
    });
    expect(
      row.quantityConfirmedUsed.plus(row.quantityReturned).toFixed(2),
    ).toBe('2.00');
  });
  it('publishes only confirmed parts, preserves correction history and excludes internal data for customers', async () => {
    await receive('3').expect(201);
    const usage = (await issue('3').expect(201)).body;
    expect(
      (
        await api(
          'get',
          `/equipment/${equipmentId}/service-parts`,
          undefined,
          undefined,
          customerToken,
        ).expect(200)
      ).body.total,
    ).toBe(0);
    woStatus = 'COMPLETED';
    const confirmed = (
      await api(
        'post',
        `/work-order-parts/${usage.id}/confirm-use`,
        confirmationInput(),
        randomUUID(),
        technicianToken,
      ).expect(201)
    ).body;
    const key = randomUUID();
    const path = `/usage-confirmations/${confirmed.id}/reverse`;
    const reversed = await api(
      'post',
      path,
      { note: 'Recorded the wrong filter; internal correction' },
      key,
    ).expect(201);
    expect(
      (
        await api(
          'post',
          path,
          { note: 'Recorded the wrong filter; internal correction' },
          key,
        ).expect(201)
      ).body,
    ).toEqual(reversed.body);
    await api('post', path, { note: 'Already reversed' }, randomUUID()).expect(
      409,
    );
    const view = (
      await api(
        'get',
        `/equipment/${equipmentId}/service-parts`,
        undefined,
        undefined,
        customerToken,
      ).expect(200)
    ).body;
    expect(view.total).toBe(2);
    const pages = await Promise.all(
      [1, 2].map((page) =>
        api(
          'get',
          `/equipment/${equipmentId}/service-parts?page=${page}&pageSize=1`,
          undefined,
          undefined,
          customerToken,
        ).expect(200),
      ),
    );
    const pagedOriginal = pages
      .flatMap((page) => page.body.items)
      .find((row) => row.kind === 'CONFIRM');
    expect(pagedOriginal.isReversed).toBe(true);
    expect(pagedOriginal.effectiveQuantity).toBe('0.00');
    expect(
      view.items.find((row: { kind: string }) => row.kind === 'CONFIRM')
        .isReversed,
    ).toBe(true);
    expect(
      view.items.every(
        (row: { effectiveQuantity: string }) =>
          row.effectiveQuantity === '0.00',
      ),
    ).toBe(true);
    expect(view.items[0].costDisclosure.status).toBe(
      'NOT_PROVIDED_BY_INVENTORY',
    );
    for (const secret of [
      'unitCost',
      'warehouseId',
      'actorId',
      'Internal workshop note',
      'internal correction',
      'quantityUnreconciled',
    ])
      expect(JSON.stringify(view)).not.toContain(secret);
    const stranger = signTestAccessToken({
      role: 'CUSTOMER_USER',
      tenantId,
      customerId: randomUUID(),
    });
    await api(
      'get',
      `/equipment/${equipmentId}/service-parts`,
      undefined,
      undefined,
      stranger,
    ).expect(404);
    await api(
      'get',
      `/equipment/${randomUUID()}/service-parts`,
      undefined,
      undefined,
      customerToken,
    ).expect(404);
  });
});

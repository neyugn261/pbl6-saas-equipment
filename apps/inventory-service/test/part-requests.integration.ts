import { randomUUID } from 'node:crypto';
import { BranchAccessClient, type Principal } from '@pbl6/auth';
import { fixtureBranchContext, signTestAccessToken } from '@pbl6/testing';
import {
  ConflictException,
  ServiceUnavailableException,
  type INestApplication,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { configureApp } from '@pbl6/service-kit';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { EventsService } from '../src/events/events.service';
import { InventoryRepository } from '../src/inventory/inventory.repository';
import {
  ReferencesClient,
  type ReservationRequest,
  type SettlementRequest,
} from '../src/inventory/references.client';

// Execute the WO owner's actual strict verifier, without modifying its implementation.
// WO persistence/terminal locks are separately tested by its reservation DB suite.
const { verifyInventoryProof } =
  require('../../workorder-service/src/inventory-reservations/proof') as {
    verifyInventoryProof: (
      raw: unknown,
      tenantId: string,
      wo: string,
      key: string,
      fingerprint: string,
    ) => { state: string };
  };

describe('Part requests: real HTTP/PostgreSQL, existing WO proof contract', () => {
  const tenantId = randomUUID(),
    branchId = randomUUID(),
    otherBranchId = randomUUID();
  const workOrderId = randomUUID(),
    equipmentId = randomUUID(),
    customerId = randomUUID();
  const techId = randomUUID(),
    replacementId = randomUUID(),
    stockUserId = randomUUID(),
    reportId = randomUUID();
  const technician = signTestAccessToken({
    role: 'TECHNICIAN',
    tenantId,
    userId: techId,
  });
  const replacement = signTestAccessToken({
    role: 'TECHNICIAN',
    tenantId,
    userId: replacementId,
  });
  const staff = signTestAccessToken({
    role: 'INVENTORY_STAFF',
    tenantId,
    userId: stockUserId,
  });
  const manager = signTestAccessToken({ role: 'SERVICE_MANAGER', tenantId });
  const admin = signTestAccessToken({ role: 'TENANT_ADMIN', tenantId });
  const foreign = signTestAccessToken({
    role: 'INVENTORY_STAFF',
    tenantId: randomUUID(),
  });
  const otherBranchUser = randomUUID();
  const otherBranch = signTestAccessToken({
    role: 'INVENTORY_STAFF',
    tenantId,
    userId: otherBranchUser,
  });
  const customer = signTestAccessToken({
    role: 'CUSTOMER_USER',
    tenantId,
    customerId,
  });
  let app: INestApplication, db: PrismaService, inventory: InventoryRepository;
  let warehouseId: string, partId: string;
  let woStatus = 'IN_PROGRESS',
    assignedUser = techId,
    reserveDown = false,
    settleDown = false,
    loseReserveResponse = false;
  let reserveCallback: (() => void) | undefined;
  const holds = new Map<string, string>();
  const wo = () => ({
    id: workOrderId,
    workOrderNo: 'WO-PART-REQUEST',
    equipmentId,
    customerId,
    branchId,
    status: woStatus,
    currentAssignment: { technicianUserId: assignedUser, status: 'ACCEPTED' },
  });
  const refs = {
    branch: async () => ({ id: branchId, status: 'ACTIVE' }),
    workOrder: async (id: string, p: Principal) =>
      id === workOrderId && p.tenantId === tenantId ? wo() : null,
    workOrderDetail: async (id: string, p: Principal) =>
      id === workOrderId && p.tenantId === tenantId ? wo() : null,
    assignments: async () => [
      {
        technicianId: assignedUser,
        technicianUserId: assignedUser,
        status: 'COMPLETED',
      },
    ],
    serviceReport: async () => ({
      id: reportId,
      workOrderId,
      technicianId: assignedUser,
    }),
    reserve: jest.fn(async (id: string, body: ReservationRequest) => {
      const row = await inventory.operation(tenantId, body.requestId);
      const proof = verifyInventoryProof(
        inventory.proof(row),
        tenantId,
        id,
        body.requestId,
        body.fingerprint,
      );
      expect(proof.state).toBe('PENDING');
      reserveCallback?.();
      if (reserveDown)
        throw new ServiceUnavailableException(
          'WO reservation fixture unavailable',
        );
      if (['COMPLETED', 'CANCELLED'].includes(woStatus))
        throw new ConflictException({
          code: 'WO_TERMINAL',
          message: 'terminal',
        });
      holds.set(body.requestId, 'HELD');
      if (loseReserveResponse) {
        loseReserveResponse = false;
        throw new ServiceUnavailableException(
          'Reservation granted but response lost',
        );
      }
      return { ...body, workOrderId: id, state: 'HELD' };
    }),
    settle: jest.fn(async (id: string, body: SettlementRequest) => {
      if (settleDown)
        throw new ServiceUnavailableException('Settlement fixture unavailable');
      const row = await inventory.operation(tenantId, body.requestId);
      const proof = verifyInventoryProof(
        inventory.proof(row),
        tenantId,
        id,
        body.requestId,
        body.fingerprint,
      );
      expect(proof.state).toBe(body.outcome);
      const state = body.outcome === 'COMMITTED' ? 'COMMITTED' : 'RELEASED';
      holds.set(body.requestId, state);
      return { ...body, workOrderId: id, state };
    }),
  };
  const api = (
    method: 'get' | 'post' | 'patch',
    path: string,
    body?: object,
    auth = staff,
    key?: string,
  ) => {
    const call = request(app.getHttpServer())
      [method](path)
      .auth(auth, { type: 'bearer' });
    if (key) call.set('Idempotency-Key', key);
    return body ? call.send(body) : call;
  };
  const create = async (
    quantity = '5',
    auth = technician,
    key = randomUUID(),
  ) =>
    api(
      'post',
      `/work-orders/${workOrderId}/part-requests`,
      { reason: 'Replace failed component', lines: [{ partId, quantity }] },
      auth,
      key,
    ).expect(201);
  const detail = async (id: string, auth = staff) =>
    (await api('get', `/part-requests/${id}`, undefined, auth).expect(200))
      .body;
  const fulfillBody = (
    row: { version: number; lines: { id: string }[] },
    quantity = '2',
  ) => ({
    expectedVersion: row.version,
    lineId: row.lines[0].id,
    warehouseId,
    quantity,
    custodianUserId: assignedUser,
    handoverReference: 'SIGNED-PAPER-001',
  });
  const issue = async (
    row: { id: string; version: number; lines: { id: string }[] },
    quantity = '2',
    key = randomUUID(),
  ) =>
    api(
      'post',
      `/part-requests/${row.id}/fulfillments`,
      fulfillBody(row, quantity),
      staff,
      key,
    );
  const returnProposal = async (
    usageId: string,
    quantity = '2',
    auth = technician,
  ) =>
    api(
      'post',
      `/work-order-parts/${usageId}/return-requests`,
      { quantity, reason: 'Unused, returning to original warehouse' },
      auth,
      randomUUID(),
    ).expect(201);
  const stock = () =>
    db.stock.findUniqueOrThrow({
      where: { warehouseId_partId: { warehouseId, partId } },
    });
  async function cleanup() {
    await db.$transaction(async (tx) => {
      await tx.inventoryOperation.deleteMany({ where: { tenantId } });
      await tx.inventoryRequestCommand.deleteMany({ where: { tenantId } });
      await tx.partReturnRequest.deleteMany({ where: { tenantId } });
      await tx.partRequestLine.deleteMany({ where: { tenantId } });
      await tx.partRequest.deleteMany({ where: { tenantId } });
      await tx.usageConfirmation.deleteMany({ where: { tenantId } });
      await tx.inventoryAudit.deleteMany({ where: { tenantId } });
      await tx.stockTransaction.deleteMany({
        where: { tenantId, type: 'RETURN' },
      });
      await tx.workOrderPart.deleteMany({ where: { tenantId } });
      await tx.stockTransaction.deleteMany({ where: { tenantId } });
      await tx.stock.deleteMany({ where: { tenantId } });
      await tx.outboxEvent.deleteMany({ where: { tenantId } });
      await tx.warehouse.deleteMany({ where: { tenantId } });
      await tx.part.deleteMany({ where: { tenantId } });
    });
  }
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(BranchAccessClient)
      .useValue({
        ...fixtureBranchContext(branchId),
        context: (p: Principal) =>
          fixtureBranchContext(
            p.userId === otherBranchUser ? otherBranchId : branchId,
          ).context(p),
      })
      .overrideProvider(ReferencesClient)
      .useValue(refs)
      .overrideProvider(EventsService)
      .useValue({})
      .compile();
    app = module.createNestApplication({ logger: false });
    configureApp(app, { logger: { log() {}, warn() {}, error() {} } });
    await app.init();
    db = app.get(PrismaService);
    inventory = app.get(InventoryRepository);
  });
  beforeEach(async () => {
    await cleanup();
    woStatus = 'IN_PROGRESS';
    assignedUser = techId;
    reserveDown = false;
    settleDown = false;
    loseReserveResponse = false;
    reserveCallback = undefined;
    holds.clear();
    jest.clearAllMocks();
    partId = (
      await api('post', '/parts', {
        sku: 'PART-TEST',
        name: 'Controller',
        unit: 'cái',
      }).expect(201)
    ).body.id;
    warehouseId = (
      await api('post', '/warehouses', {
        branchId,
        code: 'WH-TEST',
        name: 'Original warehouse',
      }).expect(201)
    ).body.id;
    await api(
      'post',
      '/stock-transactions/receive',
      {
        partId,
        warehouseId,
        quantity: '20',
        documentReference: 'RECEIPT-TEST',
      },
      staff,
      randomUUID(),
    ).expect(201);
  });
  afterAll(async () => {
    if (db) await cleanup();
    await app?.close();
  });

  it.each(['ACCEPTED', 'TRAVELLING', 'IN_PROGRESS', 'ON_HOLD'])(
    'allows a request at %s without stock mutation or reservation',
    async (status) => {
      woStatus = status;
      const created = await create();
      expect(created.body).toMatchObject({
        status: 'OPEN',
        version: 1,
        branchId,
        equipmentId,
        customerId,
        stockReservedByRequest: false,
      });
      expect((await stock()).quantity.toFixed(2)).toBe('20.00');
      expect(refs.reserve).not.toHaveBeenCalled();
    },
  );
  it.each([
    'CREATED',
    'DRAFT',
    'ASSIGNED',
    'COMPLETED',
    'RESOLVED',
    'CANCELLED',
    'CLOSED',
    'TRAVELING',
  ])('rejects non-contract state %s', async (status) => {
    woStatus = status;
    await api(
      'post',
      `/work-orders/${workOrderId}/part-requests`,
      { reason: 'Need parts', lines: [{ partId, quantity: '1' }] },
      technician,
      randomUUID(),
    ).expect(409);
    expect(await db.partRequest.count({ where: { tenantId } })).toBe(0);
  });
  it('checks roles, current assignment, cross-tenant/branch IDs and list/count scope', async () => {
    await create('2', manager);
    await api(
      'post',
      `/work-orders/${workOrderId}/part-requests`,
      { reason: 'Need', lines: [{ partId, quantity: '1' }] },
      staff,
      randomUUID(),
    ).expect(403);
    await api(
      'post',
      `/work-orders/${workOrderId}/part-requests`,
      { reason: 'Need', lines: [{ partId, quantity: '1' }] },
      replacement,
      randomUUID(),
    ).expect(403);
    const own = (await create()).body;
    for (const auth of [foreign, otherBranch, replacement])
      await api('get', `/part-requests/${own.id}`, undefined, auth).expect(404);
    await api('get', `/part-requests/${own.id}`, undefined, customer).expect(
      403,
    );
    expect(
      (await api('get', '/part-requests', undefined, replacement).expect(200))
        .body.total,
    ).toBe(0);
    expect(
      (await api('get', '/part-requests', undefined, foreign).expect(200)).body
        .total,
    ).toBe(0);
    expect(
      (await api('get', '/part-requests', undefined, otherBranch).expect(200))
        .body.total,
    ).toBe(0);
    await api(
      'post',
      `/part-requests/${own.id}/fulfillments`,
      fulfillBody(own),
      technician,
      randomUUID(),
    ).expect(403);
    await api(
      'post',
      `/part-requests/${own.id}/fulfillments`,
      fulfillBody(own),
      admin,
      randomUUID(),
    ).expect(403);
    assignedUser = replacementId;
    expect(
      (
        await api(
          'get',
          `/part-requests?workOrderId=${workOrderId}`,
          undefined,
          replacement,
        ).expect(200)
      ).body.total,
    ).toBe(2);
    await detail(own.id, technician); // Original requester can still follow their record.
  });
  it('deduplicates normalized creation, rejects changed payload, blank/unknown fields, duplicate lines and fractional whole parts', async () => {
    const key = randomUUID();
    const a = (await create('2', technician, key)).body;
    const b = (await create('2.00', technician, key)).body;
    expect(b.id).toBe(a.id);
    await api(
      'post',
      `/work-orders/${workOrderId}/part-requests`,
      { reason: 'Changed', lines: [{ partId, quantity: '2' }] },
      technician,
      key,
    ).expect(409);
    const invalids = [
      { reason: 'Need', lines: [null] },
      { reason: ' ', lines: [{ partId, quantity: '1' }] },
      { reason: 'Need', lines: [{ partId, quantity: '1' }], tenantId },
      {
        reason: 'Need',
        lines: [
          { partId, quantity: '1' },
          { partId: partId.toUpperCase(), quantity: '1' },
        ],
      },
      { reason: 'Need', lines: [{ partId, quantity: 1 }] },
      { reason: 'Need', lines: [] },
    ];
    for (const body of invalids)
      await api(
        'post',
        `/work-orders/${workOrderId}/part-requests`,
        body,
        technician,
        randomUUID(),
      ).expect(400);
    await api(
      'post',
      `/work-orders/${workOrderId}/part-requests`,
      { reason: 'Need', lines: [{ partId, quantity: '0.5' }] },
      technician,
      randomUUID(),
    ).expect(422);
    expect(await db.partRequest.count({ where: { tenantId } })).toBe(1);
  });
  it('fulfills partially and fully through strict existing proof; preserves custody and retries after WO terminal', async () => {
    const row = (await create('3')).body,
      key = randomUUID();
    const first = (await issue(row, '2', key)).status;
    expect(first).toBe(201);
    let current = await detail(row.id);
    expect(current).toMatchObject({
      status: 'OPEN',
      fulfillmentStatus: 'PARTIALLY_ISSUED',
      lines: [{ quantityIssued: '2.00', quantityPendingIssue: '0.00' }],
    });
    const usage = await db.workOrderPart.findFirstOrThrow({
      where: { tenantId },
    });
    expect(usage).toMatchObject({
      custodianUserId: techId,
      handoverReference: 'SIGNED-PAPER-001',
      recordedBy: stockUserId,
    });
    expect((await stock()).quantity.toFixed(2)).toBe('18.00');
    const changedReceiver = {
      ...fulfillBody(row),
      handoverReference: 'DIFFERENT-RECEIPT',
    };
    await api(
      'post',
      `/part-requests/${row.id}/fulfillments`,
      changedReceiver,
      staff,
      key,
    ).expect(409);
    expect((await issue(current, '1')).status).toBe(201);
    current = await detail(row.id);
    expect(current).toMatchObject({
      status: 'CLOSED',
      fulfillmentStatus: 'FULLY_ISSUED',
    });
    woStatus = 'COMPLETED';
    expect((await issue(row, '2', key)).status).toBe(201);
    expect(await db.workOrderPart.count({ where: { tenantId } })).toBe(2);
    expect(
      (await api('get', `/part-requests/${row.id}/history`).expect(200)).body
        .total,
    ).toBe(7);
  });
  it('serializes simultaneous fulfillments and rejects stale decisions without over-issuing', async () => {
    const row = (await create('3')).body;
    const results = await Promise.all([issue(row, '2'), issue(row, '2')]);
    expect(results.map((result) => result.status).sort()).toEqual([201, 409]);
    expect((await stock()).quantity.toFixed(2)).toBe('18.00');
    await api('post', `/part-requests/${row.id}/close`, {
      expectedVersion: 1,
      reason: 'stale',
    }).expect(409);
    const current = await detail(row.id);
    await api(
      'post',
      `/part-requests/${row.id}/cancel`,
      { expectedVersion: current.version, reason: 'not needed' },
      technician,
    ).expect(409);
    await api('post', `/part-requests/${row.id}/close`, {
      expectedVersion: current.version,
      reason: 'No further demand',
    }).expect(200);
    expect((await detail(row.id)).lines[0]).toMatchObject({
      quantityRemainingToIssue: '1.00',
      quantityClosedWithoutIssue: '1.00',
      quantityAvailableToFulfill: '0.00',
    });
    expect((await stock()).quantity.toFixed(2)).toBe('18.00');
  });
  it('counts PENDING against demand and blocks decisions until explicit abort and settlement', async () => {
    const row = (await create('3')).body,
      key = randomUUID();
    reserveDown = true;
    settleDown = true;
    expect((await issue(row, '2', key)).status).toBe(503);
    let current = await detail(row.id);
    expect(current.lines[0]).toMatchObject({
      quantityIssued: '0.00',
      quantityPendingIssue: '2.00',
      quantityAvailableToFulfill: '1.00',
    });
    expect((await issue(current, '2')).status).toBe(409);
    await api('post', `/part-requests/${row.id}/close`, {
      expectedVersion: current.version,
      reason: 'Cannot continue',
    }).expect(409);
    await api('post', `/inventory-operations/${key}/abort`).expect(200);
    current = await detail(row.id);
    expect(current.pendingRecovery).toBe(true);
    await api(
      'post',
      `/part-requests/${row.id}/cancel`,
      { expectedVersion: current.version, reason: 'Cancel' },
      technician,
    ).expect(409);
    settleDown = false;
    await api('post', `/inventory-operations/${key}/retry`).expect(409); // Original abort status; settlement still completes.
    current = await detail(row.id);
    expect(current.pendingRecovery).toBe(false);
    await api(
      'post',
      `/part-requests/${row.id}/cancel`,
      { expectedVersion: current.version, reason: 'Cancel' },
      technician,
    ).expect(200);
    expect((await stock()).quantity.toFixed(2)).toBe('20.00');
  });
  it('retries the same PENDING operation and counts COMMITTED pending-finalize as issued', async () => {
    const row = (await create('2')).body,
      key = randomUUID();
    reserveDown = true;
    expect((await issue(row, '2', key)).status).toBe(503);
    reserveDown = false;
    settleDown = true;
    await api('post', `/inventory-operations/${key}/retry`).expect(201);
    expect((await detail(row.id)).lines[0].quantityIssued).toBe('2.00');
    expect(
      (await inventory.operation(tenantId, key)).reservationSettledAt,
    ).toBeNull();
    settleDown = false;
    await api('post', `/inventory-operations/${key}/retry`).expect(201);
    expect(await db.workOrderPart.count({ where: { tenantId } })).toBe(1);
    expect(holds.get(key)).toBe('COMMITTED');
  });
  it('honors a WO terminal reservation rejection with no ledger change and releases the demand', async () => {
    const row = (await create('2')).body;
    reserveCallback = () => {
      woStatus = 'COMPLETED';
    };
    expect((await issue(row, '2')).status).toBe(409);
    const current = await detail(row.id);
    expect(current.lines[0]).toMatchObject({
      quantityIssued: '0.00',
      quantityPendingIssue: '0.00',
    });
    expect((await stock()).quantity.toFixed(2)).toBe('20.00');
    expect(await db.workOrderPart.count({ where: { tenantId } })).toBe(0);
  });
  it('keeps original custody after replacement and permits partial return after completion and catalog deactivation', async () => {
    const row = (await create('5')).body;
    const issued = await issue(row, '5');
    expect(issued.status).toBe(201);
    const usageId = issued.body.id;
    assignedUser = replacementId;
    woStatus = 'COMPLETED';
    await api(
      'post',
      `/work-order-parts/${usageId}/return-requests`,
      { quantity: '3', reason: 'Return old recipient stock' },
      replacement,
      randomUUID(),
    ).expect(403);
    const proposal = (await returnProposal(usageId, '3')).body;
    expect((await stock()).quantity.toFixed(2)).toBe('15.00');
    await api('patch', `/parts/${partId}`, { status: 'INACTIVE' }).expect(200);
    await api('patch', `/warehouses/${warehouseId}`, {
      status: 'INACTIVE',
    }).expect(200);
    const payload = {
      expectedVersion: proposal.version,
      quantity: '2',
      condition: 'DAMAGED',
      note: 'Two received, one still with original recipient',
    };
    const key = randomUUID();
    await api(
      'post',
      `/return-requests/${proposal.id}/receipts`,
      payload,
      staff,
      key,
    ).expect(200);
    await api(
      'post',
      `/return-requests/${proposal.id}/receipts`,
      payload,
      staff,
      key,
    ).expect(200);
    let current = (
      await api(
        'get',
        `/return-requests/${proposal.id}`,
        undefined,
        technician,
      ).expect(200)
    ).body;
    expect(current).toMatchObject({
      quantityReceived: '2.00',
      quantityPendingReceipt: '1.00',
      custodianUserId: techId,
      status: 'OPEN',
    });
    expect((await stock()).quantityQuarantined.toFixed(2)).toBe('2.00');
    await api(
      'post',
      `/return-requests/${proposal.id}/cancel`,
      { expectedVersion: current.version, reason: 'Cancel remainder' },
      technician,
    ).expect(409);
    await api(
      'post',
      `/return-requests/${proposal.id}/receipts`,
      {
        expectedVersion: current.version,
        quantity: '1',
        condition: 'GOOD',
        note: 'Final received',
      },
      staff,
      randomUUID(),
    ).expect(200);
    current = (await api('get', `/return-requests/${proposal.id}`).expect(200))
      .body;
    expect(current).toMatchObject({
      status: 'CLOSED',
      receiptStatus: 'RECEIVED',
    });
    expect((await stock()).quantity.toFixed(2)).toBe('16.00');
    expect(
      await db.stockTransaction.count({
        where: { tenantId, type: 'RETURN', warehouseId },
      }),
    ).toBe(2);
  });
  it('bounds open return proposals and serializes receipts competing with actual-use confirmation', async () => {
    const row = (await create('5')).body;
    const issued = await issue(row, '5');
    expect(issued.status).toBe(201);
    const proposal = (await returnProposal(issued.body.id, '4')).body;
    await api(
      'post',
      `/work-order-parts/${issued.body.id}/return-requests`,
      { quantity: '2', reason: 'Duplicate quantity' },
      technician,
      randomUUID(),
    ).expect(409);
    woStatus = 'COMPLETED';
    const [receipt, confirmation] = await Promise.all([
      api(
        'post',
        `/return-requests/${proposal.id}/receipts`,
        {
          expectedVersion: proposal.version,
          quantity: '4',
          condition: 'GOOD',
          note: 'Received',
        },
        staff,
        randomUUID(),
      ),
      api(
        'post',
        `/work-order-parts/${issued.body.id}/confirm-use`,
        {
          quantity: '2',
          serviceReportId: reportId,
          customerReason: 'Installed for repair',
          removedPartDisposition: 'NOT_APPLICABLE',
        },
        technician,
        randomUUID(),
      ),
    ]);
    expect([
      [200, 409],
      [201, 409],
    ]).toContainEqual([receipt.status, confirmation.status].sort());
    const usage = await db.workOrderPart.findUniqueOrThrow({
      where: { id: issued.body.id },
    });
    expect(
      usage.quantityReturned
        .plus(usage.quantityConfirmedUsed)
        .lte(usage.quantityUsed),
    ).toBe(true);
    const current = (
      await api('get', `/return-requests/${proposal.id}`).expect(200)
    ).body;
    if (current.status === 'OPEN') {
      expect(current.quantityReceivableNow).toBe('3.00');
      await api('post', `/return-requests/${proposal.id}/close`, {
        expectedVersion: current.version,
        reason: 'Used quantity changed; close remaining proposal',
      }).expect(200);
      expect(
        (
          await db.workOrderPart.findUniqueOrThrow({
            where: { id: issued.body.id },
          })
        ).quantityConfirmedUsed.toFixed(2),
      ).toBe('2.00');
    }
  });
  it('does not infer legacy custody, and paginates a scoped immutable decision history', async () => {
    const row = (await create('2')).body;
    await api('post', `/part-requests/${row.id}/reject`, {
      expectedVersion: 1,
      reason: 'Unavailable model',
    }).expect(200);
    await api('post', `/part-requests/${row.id}/reject`, {
      expectedVersion: 1,
      reason: 'Unavailable model',
    }).expect(200);
    const history = await api(
      'get',
      `/part-requests/${row.id}/history?pageSize=1`,
    ).expect(200);
    expect(history.body.total).toBe(2);
    expect(history.body.items).toHaveLength(1);
    await api(
      'get',
      `/part-requests/${row.id}/history`,
      undefined,
      foreign,
    ).expect(404);
    const legacy = await api(
      'post',
      `/work-orders/${workOrderId}/parts`,
      { warehouseId, partId, quantity: '1' },
      staff,
      randomUUID(),
    ).expect(201);
    expect(legacy.body.custodianUserId).toBeNull();
    await api(
      'post',
      `/work-order-parts/${legacy.body.id}/return-requests`,
      { quantity: '1', reason: 'No historical recipient' },
      manager,
      randomUUID(),
    ).expect(409);
    await api(
      'post',
      `/work-order-parts/${legacy.body.id}/return`,
      {
        quantity: '1',
        condition: 'GOOD',
        note: 'Staff reconciled legacy receipt',
      },
      staff,
      randomUUID(),
    ).expect(200);
  });

  it('does not grant custody to a forged recipient or accept an unrecorded physical handover', async () => {
    const row = (await create('2')).body;
    await api(
      'post',
      `/part-requests/${row.id}/fulfillments`,
      { ...fulfillBody(row), custodianUserId: replacementId },
      staff,
      randomUUID(),
    ).expect(409);
    await api(
      'post',
      `/part-requests/${row.id}/fulfillments`,
      { ...fulfillBody(row), handoverReference: ' ' },
      staff,
      randomUUID(),
    ).expect(400);
    expect(
      await db.inventoryOperation.count({
        where: { tenantId, operation: 'ISSUE' },
      }),
    ).toBe(0);
    expect(refs.reserve).not.toHaveBeenCalled();
  });
  it('recovers a granted reservation whose response was lost, using one immutable operation', async () => {
    const row = (await create('2')).body,
      key = randomUUID();
    loseReserveResponse = true;
    expect((await issue(row, '2', key)).status).toBe(503);
    expect(holds.get(key)).toBe('HELD');
    expect((await stock()).quantity.toFixed(2)).toBe('20.00');
    expect((await detail(row.id)).lines[0].quantityPendingIssue).toBe('2.00');
    await api('post', `/inventory-operations/${key}/retry`).expect(201);
    expect(await db.workOrderPart.count({ where: { tenantId } })).toBe(1);
    expect(holds.get(key)).toBe('COMMITTED');
  });
  it('aborts a PENDING fulfillment for the replaced recipient, then allows the new technician to request/receive separately', async () => {
    const row = (await create('2')).body,
      key = randomUUID();
    reserveDown = true;
    expect((await issue(row, '2', key)).status).toBe(503);
    assignedUser = replacementId;
    reserveDown = false;
    await api('post', `/inventory-operations/${key}/retry`).expect(409);
    expect((await inventory.operation(tenantId, key)).state).toBe('ABORTED');
    expect(holds.get(key)).toBe('RELEASED');
    const replacementRequest = (await create('2', replacement)).body;
    expect((await issue(replacementRequest, '2')).status).toBe(201);
    expect(
      (await db.workOrderPart.findFirstOrThrow({ where: { tenantId } }))
        .custodianUserId,
    ).toBe(replacementId);
  });
  it('allows the new report technician to confirm use of physically handed-over parts while retaining the old recipient for return', async () => {
    const row = (await create('5')).body;
    const issued = await issue(row, '5');
    expect(issued.status).toBe(201);
    assignedUser = replacementId;
    woStatus = 'COMPLETED';
    await api(
      'post',
      `/work-order-parts/${issued.body.id}/confirm-use`,
      {
        quantity: '2',
        serviceReportId: reportId,
        customerReason: 'Used parts handed over by the original recipient',
        removedPartDisposition: 'NOT_APPLICABLE',
      },
      replacement,
      randomUUID(),
    ).expect(201);
    const proposal = (await returnProposal(issued.body.id, '3')).body;
    expect(proposal.custodianUserId).toBe(techId);
    expect(proposal.usage.quantityConfirmedUsed).toBe('2.00');
    expect(proposal.quantityReceivableNow).toBe('3.00');
  });
  it('serializes duplicate return proposals and simultaneous receipts; closing a partially received proposal preserves remaining custody', async () => {
    const row = (await create('5')).body;
    const issued = await issue(row, '5');
    expect(issued.status).toBe(201);
    const proposals = await Promise.all(
      [1, 2].map(() =>
        api(
          'post',
          `/work-order-parts/${issued.body.id}/return-requests`,
          { quantity: '4', reason: 'Return unused' },
          technician,
          randomUUID(),
        ),
      ),
    );
    expect(proposals.map((res) => res.status).sort()).toEqual([201, 409]);
    const proposal = proposals.find((res) => res.status === 201)!.body;
    const body = {
      expectedVersion: proposal.version,
      quantity: '2',
      condition: 'GOOD',
      note: 'Only two physically received',
    };
    const receipts = await Promise.all(
      [1, 2].map(() =>
        api(
          'post',
          `/return-requests/${proposal.id}/receipts`,
          body,
          staff,
          randomUUID(),
        ),
      ),
    );
    expect(receipts.map((res) => res.status).sort()).toEqual([200, 409]);
    const current = (
      await api('get', `/return-requests/${proposal.id}`).expect(200)
    ).body;
    await api('post', `/return-requests/${proposal.id}/close`, {
      expectedVersion: current.version,
      reason: 'Close proposal only; three remain with recipient',
    }).expect(200);
    expect(
      (await api('get', `/return-requests/${proposal.id}`).expect(200)).body,
    ).toMatchObject({
      quantityUnreceived: '2.00',
      quantityClosedWithoutReceipt: '2.00',
      quantityPendingReceipt: '0.00',
      quantityReceivableNow: '0.00',
    });
    const usage = await db.workOrderPart.findUniqueOrThrow({
      where: { id: issued.body.id },
    });
    expect(usage.quantityUsed.minus(usage.quantityReturned).toFixed(2)).toBe(
      '3.00',
    );
    expect(usage.custodianUserId).toBe(techId);
    for (const auth of [foreign, otherBranch, replacement]) {
      await api(
        'get',
        `/return-requests/${proposal.id}`,
        undefined,
        auth,
      ).expect(404);
      await api(
        'get',
        `/return-requests/${proposal.id}/history`,
        undefined,
        auth,
      ).expect(404);
      expect(
        (await api('get', '/return-requests', undefined, auth).expect(200)).body
          .total,
      ).toBe(0);
    }
    await api(
      'get',
      `/return-requests/${proposal.id}`,
      undefined,
      customer,
    ).expect(403);
  });

  it('records the actual recovery operator separately from the original warehouse actor and custodian', async () => {
    const row = (await create('2')).body,
      key = randomUUID();
    const recoveryUserId = randomUUID();
    const recoveryStaff = signTestAccessToken({
      role: 'INVENTORY_STAFF',
      tenantId,
      userId: recoveryUserId,
    });
    reserveDown = true;
    expect((await issue(row, '2', key)).status).toBe(503);
    reserveDown = false;
    await api(
      'post',
      `/inventory-operations/${key}/retry`,
      undefined,
      recoveryStaff,
    ).expect(201);
    const history = (
      await api('get', `/part-requests/${row.id}/history`).expect(200)
    ).body.items;
    expect(
      history.find(
        (item: { action: string }) => item.action === 'ISSUE_COMMITTED',
      ).actorId,
    ).toBe(recoveryUserId);
    expect(
      history.find(
        (item: { action: string }) => item.action === 'RESERVATION_SETTLED',
      ).actorId,
    ).toBe(recoveryUserId);
    const usage = await db.workOrderPart.findFirstOrThrow({
      where: { tenantId },
    });
    expect(usage).toMatchObject({
      recordedBy: stockUserId,
      custodianUserId: techId,
    });
  });

  it('deduplicates a return proposal without granting the new technician the original recipient rights', async () => {
    const row = (await create('2')).body;
    const issued = await issue(row, '2');
    expect(issued.status).toBe(201);
    const key = randomUUID(),
      payload = { quantity: '1', reason: 'Unused spare' };
    const first = await api(
      'post',
      `/work-order-parts/${issued.body.id}/return-requests`,
      payload,
      technician,
      key,
    ).expect(201);
    assignedUser = replacementId;
    woStatus = 'CANCELLED';
    const replay = await api(
      'post',
      `/work-order-parts/${issued.body.id}/return-requests`,
      { ...payload, quantity: '1.00' },
      technician,
      key,
    ).expect(201);
    expect(replay.body.id).toBe(first.body.id);
    await api(
      'post',
      `/work-order-parts/${issued.body.id}/return-requests`,
      { ...payload, quantity: '2' },
      technician,
      key,
    ).expect(409);
    await api(
      'post',
      `/work-order-parts/${issued.body.id}/return-requests`,
      payload,
      replacement,
      key,
    ).expect(409);
    expect(await db.partReturnRequest.count({ where: { tenantId } })).toBe(1);
    await api(
      'post',
      `/return-requests/${first.body.id}/cancel`,
      { expectedVersion: 1, reason: 'No physical return after all' },
      technician,
    ).expect(200);
    expect((await stock()).quantity.toFixed(2)).toBe('18.00');
  });
});

const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { fork, execFileSync } = require('node:child_process');
const { once } = require('node:events');
const { createServer } = require('node:net');
const { resolve } = require('node:path');
const { createRequire } = require('node:module');
const { config } = require('dotenv');
const {
  requireTestDatabaseUrl,
  testJwtEnv,
  signTestAccessToken,
} = require('@pbl6/testing');
config({ path: '.env', quiet: true });
config({ path: '../../.env', quiet: true });
const inventoryRequire = createRequire(
  resolve('../inventory-service/package.json'),
);
const gatewayRequire = createRequire(resolve('../api-gateway/package.json'));
async function port() {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const value = server.address().port;
  await new Promise((resolveClose) => server.close(resolveClose));
  return value;
}
const deferred = () => {
  let resolveValue;
  const promise = new Promise((resolve) => {
    resolveValue = resolve;
  });
  return { promise, resolve: resolveValue };
};
let phase = 'setup';
async function main() {
  const woURL = requireTestDatabaseUrl('WORKORDER_TEST_DATABASE_URL');
  const inventoryURL = requireTestDatabaseUrl('INVENTORY_TEST_DATABASE_URL');
  const woPort = await port(),
    inventoryPort = await port();
  Object.assign(process.env, testJwtEnv(), {
    NODE_ENV: 'test',
    WORKORDER_DATABASE_URL: woURL,
    INVENTORY_DATABASE_URL: inventoryURL,
    RABBITMQ_URL: '',
    WORKORDER_ATTACHMENTS_ENABLED: 'false',
    WORKORDER_ATTACHMENT_WORKER_ENABLED: 'false',
    WORKORDER_SERVICE_PORT: String(woPort),
    WORKORDER_SERVICE_URL: `http://127.0.0.1:${woPort}`,
    INVENTORY_SERVICE_URL: `http://127.0.0.1:${inventoryPort}`,
  });
  for (const name of [
    'IDENTITY',
    'ORGANIZATION',
    'ASSET',
    'SERVICE_REQUEST',
    'MAINTENANCE',
    'NOTIFICATION',
  ])
    process.env[`${name}_SERVICE_URL`] =
      `http://${name.toLowerCase().replaceAll('_', '-')}.test`;
  for (const service of ['workorder-service', 'inventory-service'])
    execFileSync(
      process.execPath,
      [
        resolve('..', service, 'node_modules/prisma/build/index.js'),
        'migrate',
        'deploy',
      ],
      {
        cwd: resolve('..', service),
        env: process.env,
        stdio: 'inherit',
      },
    );
  const { NestFactory } = require('@nestjs/core');
  const { ConfigService } = require('@nestjs/config');
  const { configureApp, createLogger } = require('@pbl6/service-kit');
  const { PrismaService: WoDb } = require('../dist/prisma/prisma.service');
  const { AppModule: InventoryModule } = inventoryRequire('./dist/app.module');
  const { PrismaService: InventoryDb } = inventoryRequire(
    './dist/prisma/prisma.service',
  );
  const { ReferencesClient } = inventoryRequire(
    './dist/inventory/references.client',
  );
  const { AppModule: GatewayModule } = gatewayRequire('./dist/app.module');
  const { configureGateway } = gatewayRequire('./dist/gateway.setup');
  const db = new WoDb(new ConfigService({ WORKORDER_DATABASE_URL: woURL }));
  let inventoryApp, inventoryDb, references, gateway, child, base;
  const tenantId = randomUUID(),
    techUserId = randomUUID(),
    actorId = randomUUID();
  const inventoryToken = signTestAccessToken({
    role: 'INVENTORY_STAFF',
    tenantId,
    userId: actorId,
  });
  const managerToken = signTestAccessToken({
    role: 'SERVICE_MANAGER',
    tenantId,
  });
  const techToken = signTestAccessToken({
    role: 'TECHNICIAN',
    tenantId,
    userId: techUserId,
  });
  async function startWO() {
    child = fork(resolve('test/support/reservation-wo-process.cjs'), [], {
      env: process.env,
      stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
    });
    await new Promise((resolveReady, reject) => {
      const timer = setTimeout(
        () => finish(new Error('WO startup timed out')),
        15000,
      );
      const received = (message) => {
        if (message.ready) finish();
      };
      const exited = () => finish(new Error('WO exited before ready'));
      function finish(error) {
        clearTimeout(timer);
        child.off('message', received);
        child.off('exit', exited);
        child.off('error', finish);
        if (error) reject(error);
        else resolveReady();
      }
      child.on('message', received);
      child.once('exit', exited);
      child.once('error', finish);
    });
  }
  async function killWO() {
    if (child?.pid && child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'exit');
      child.kill('SIGKILL');
      await exited;
    }
    child = undefined;
  }
  async function startInventory() {
    inventoryApp = await NestFactory.create(InventoryModule, { logger: false });
    configureApp(inventoryApp, {
      logger: createLogger('inventory-reservation-test'),
    });
    await inventoryApp.listen(inventoryPort, '127.0.0.1');
    inventoryDb = inventoryApp.get(InventoryDb);
    references = inventoryApp.get(ReferencesClient);
  }
  async function restartInventory() {
    await inventoryApp.close();
    await startInventory();
  }
  async function api(
    path,
    { method = 'GET', body, key, expected = 200, token = inventoryToken } = {},
  ) {
    const response = await fetch(base + path, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Correlation-Id': 'inventory-wo-integration',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(key ? { 'Idempotency-Key': key } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(20000),
    });
    assert.ok(
      (Array.isArray(expected) ? expected : [expected]).includes(
        response.status,
      ),
      `Unexpected HTTP status during ${phase}`,
    );
    assert.equal(
      response.headers.get('x-correlation-id'),
      'inventory-wo-integration',
    );
    return {
      data: await response.json(),
      reservation: response.headers.get('x-inventory-reservation-state'),
    };
  }
  const report = {
    problemDescription: 'Test',
    solution: 'Repaired',
    result: 'RESOLVED',
    customerSummary: 'Equipment ready',
  };
  let technicianId, warehouseId, partId;
  async function order() {
    const value = await db.workOrder.create({
      data: {
        tenantId,
        workOrderNo: `WO-I-${randomUUID()}`,
        serviceRequestId: randomUUID(),
        equipmentId: randomUUID(),
        customerId: randomUUID(),
        type: 'REPAIR',
        title: 'Real Inventory reservation',
        status: 'IN_PROGRESS',
      },
    });
    await db.workOrderAssignment.create({
      data: {
        tenantId,
        workOrderId: value.id,
        technicianId,
        assignedBy: actorId,
        status: 'ACCEPTED',
      },
    });
    return value.id;
  }
  const issue = (id, key, expected = 201, extra = {}) =>
    api(`/api/inventory/work-orders/${id}/parts`, {
      method: 'POST',
      key,
      expected,
      body: { warehouseId, partId, quantity: '2.00', ...extra },
    });
  const complete = (id, expected = 200) =>
    api(`/api/workorders/work-orders/${id}/complete`, {
      method: 'POST',
      token: techToken,
      body: report,
      expected,
    });
  const cancel = (id, expected = 200) =>
    api(`/api/workorders/work-orders/${id}/cancel`, {
      method: 'POST',
      token: managerToken,
      body: { reason: 'Integration fixture' },
      expected,
    });
  const proof = (key) => api(`/api/inventory/inventory-operations/${key}`);
  const reservation = (key) =>
    db.workOrderInventoryReservation.findUniqueOrThrow({
      where: { tenantId_requestId: { tenantId, requestId: key } },
    });
  try {
    await db.$connect();
    await startWO();
    await startInventory();
    gateway = await NestFactory.create(GatewayModule, { logger: false });
    configureGateway(gateway, gateway.get(ConfigService));
    await gateway.listen(0, '127.0.0.1');
    base = await gateway.getUrl();
    // Service-owned fixture writes only; production services never share DB access.
    technicianId = (
      await db.technician.create({
        data: {
          tenantId,
          userId: techUserId,
          branchId: randomUUID(),
          employeeCode: 'INV-LIVE',
        },
      })
    ).id;
    warehouseId = (
      await inventoryDb.warehouse.create({
        data: {
          tenantId,
          branchId: randomUUID(),
          code: 'INV-LIVE',
          name: 'Test warehouse',
        },
      })
    ).id;
    partId = (
      await inventoryDb.part.create({
        data: {
          tenantId,
          sku: 'INV-LIVE',
          name: 'Test part',
          unit: 'cái',
          allowFractional: false,
        },
      })
    ).id;
    await inventoryDb.stock.create({
      data: { tenantId, warehouseId, partId, quantity: '20.00' },
    });

    phase = 'happy issue/replay/complete/return';
    const first = await order(),
      firstKey = randomUUID();
    const firstBody = {
      note: 'Live proof',
      documentReference: 'TEST-ISSUE',
      unitCost: '3.5',
      unitCostCurrency: 'VND',
    };
    const issued = await issue(first, firstKey, 201, firstBody);
    assert.equal(issued.reservation, 'SETTLED');
    assert.equal((await reservation(firstKey)).state, 'COMMITTED');
    assert.equal(
      (await issue(first, firstKey, 201, firstBody)).data.id,
      issued.data.id,
    );
    await complete(first);
    const returned = await api(
      `/api/inventory/work-order-parts/${issued.data.id}/return`,
      {
        method: 'POST',
        key: randomUUID(),
        body: { quantity: '1.00', condition: 'GOOD', note: 'Unused part' },
      },
    );
    assert.equal(returned.data.quantityReturned, '1.00');

    phase = 'held race and WO SIGKILL/restart';
    const second = await order(),
      secondKey = randomUUID(),
      held = deferred(),
      release = deferred();
    const originalReserve = references.reserve.bind(references);
    references.reserve = async (...args) => {
      const value = await originalReserve(...args);
      held.resolve();
      await release.promise;
      return value;
    };
    const inFlight = issue(second, secondKey);
    await held.promise;
    await complete(second, 409);
    await cancel(second, 409);
    await killWO();
    await startWO();
    assert.equal((await reservation(secondKey)).state, 'HELD');
    await complete(second, 409);
    release.resolve();
    await inFlight;
    references.reserve = originalReserve;
    assert.equal((await reservation(secondKey)).state, 'COMMITTED');
    await complete(second);

    phase = 'rollback after hold and Inventory restart';
    const third = await order(),
      thirdKey = randomUUID();
    references.reserve = async (...args) => {
      await originalReserve(...args);
      const { ServiceUnavailableException } = require('@nestjs/common');
      throw new ServiceUnavailableException(
        'Injected response loss after hold',
      );
    };
    await issue(third, thirdKey, 503);
    assert.equal((await proof(thirdKey)).data.state, 'PENDING');
    assert.equal((await reservation(thirdKey)).state, 'HELD');
    await restartInventory();
    await api(`/api/inventory/inventory-operations/${thirdKey}/retry`, {
      method: 'POST',
      expected: 201,
    });
    assert.equal((await reservation(thirdKey)).state, 'COMMITTED');
    await cancel(third);

    phase = 'Inventory committed before settlement and restart';
    const fourth = await order(),
      fourthKey = randomUUID();
    references.settle = async () => {
      throw new Error('Injected pre-settle outage');
    };
    const committed = await issue(fourth, fourthKey);
    assert.equal(committed.reservation, 'PENDING_FINALIZE');
    assert.equal((await proof(fourthKey)).data.recovery.stockOutcome, 'ISSUED');
    await complete(fourth, 409);
    await restartInventory();
    const recovered = await api(
      `/api/inventory/inventory-operations/${fourthKey}/retry`,
      { method: 'POST', expected: 201 },
    );
    assert.equal(recovered.data.id, committed.data.id);
    assert.equal(recovered.reservation, 'SETTLED');
    assert.equal(
      await inventoryDb.stockTransaction.count({
        where: { tenantId, referenceId: fourth, type: 'ISSUE' },
      }),
      1,
    );
    await complete(fourth);

    phase = 'lost settlement response after WO commit';
    const fifth = await order(),
      fifthKey = randomUUID();
    const originalSettle = references.settle.bind(references);
    references.settle = async (...args) => {
      await originalSettle(...args);
      throw new Error('Injected response loss after settle');
    };
    const responseLost = await issue(fifth, fifthKey);
    assert.equal(responseLost.reservation, 'PENDING_FINALIZE');
    assert.equal((await reservation(fifthKey)).state, 'COMMITTED');
    await restartInventory();
    assert.equal(
      (
        await api(`/api/inventory/inventory-operations/${fifthKey}/retry`, {
          method: 'POST',
          expected: 201,
        })
      ).data.id,
      responseLost.data.id,
    );
    assert.equal(
      await inventoryDb.stockTransaction.count({
        where: { tenantId, referenceId: fifth, type: 'ISSUE' },
      }),
      1,
    );
    await complete(fifth);

    phase = 'insufficient stock releases only a verified durable abort';
    const sixth = await order(),
      sixthKey = randomUUID();
    await issue(sixth, sixthKey, 409, { quantity: '99999.00' });
    assert.equal((await proof(sixthKey)).data.state, 'ABORTED');
    assert.equal((await reservation(sixthKey)).state, 'RELEASED');
    await cancel(sixth);

    phase = 'abort before reserve leaves a tombstone';
    const seventh = await order(),
      seventhKey = randomUUID();
    const reserveBeforeAbort = references.reserve.bind(references);
    references.reserve = async () => {
      const { ServiceUnavailableException } = require('@nestjs/common');
      throw new ServiceUnavailableException(
        'Injected missing reserve response',
      );
    };
    await issue(seventh, seventhKey, 503);
    await api(`/api/inventory/inventory-operations/${seventhKey}/abort`, {
      method: 'POST',
    });
    const aborted = (await proof(seventhKey)).data;
    references.reserve = reserveBeforeAbort;
    const late = await fetch(
      process.env.WORKORDER_SERVICE_URL +
        `/internal/work-orders/${seventh}/inventory-reservations`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${inventoryToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          requestId: seventhKey,
          fingerprint: aborted.fingerprint,
        }),
      },
    );
    assert.equal(late.status, 200);
    assert.equal((await late.json()).state, 'RELEASED');
    await cancel(seventh);

    phase = 'terminal WO rejects new stock issue';
    const eighth = await order(),
      eighthKey = randomUUID();
    await complete(eighth);
    await issue(eighth, eighthKey, 409);
    assert.equal((await reservation(eighthKey)).state, 'RELEASED');

    phase = 'concurrent issues cannot overspend the same stock';
    const ninth = await order(),
      tenth = await order();
    const concurrent = await Promise.all([
      issue(ninth, randomUUID(), [201, 409], { quantity: '8.00' }),
      issue(tenth, randomUUID(), [201, 409], { quantity: '8.00' }),
    ]);
    assert.equal(
      concurrent.filter((value) => value.data.stockTransactionId).length,
      1,
    );
    await cancel(ninth);
    await cancel(tenth);

    phase = 'internal Gateway and foreign tenant boundary';
    await api(
      `/api/workorders/internal/work-orders/${eighth}/inventory-reservations`,
      { method: 'POST', body: {}, expected: 404 },
    );
    const foreign = signTestAccessToken({
      role: 'INVENTORY_STAFF',
      tenantId: randomUUID(),
    });
    const blocked = await fetch(
      process.env.WORKORDER_SERVICE_URL +
        `/internal/work-orders/${eighth}/inventory-reservations`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${foreign}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          requestId: eighthKey,
          fingerprint: aborted.fingerprint,
        }),
      },
    );
    assert.equal(blocked.status, 404);
    assert.equal(
      (
        await inventoryDb.stock.findFirstOrThrow({
          where: { tenantId, warehouseId, partId },
        })
      ).quantity.toFixed(2),
      '3.00',
    );
    assert.equal(
      await inventoryDb.stockTransaction.count({
        where: { tenantId, type: 'ISSUE' },
      }),
      6,
    );
    assert.equal(
      await inventoryDb.workOrderPart.count({ where: { tenantId } }),
      6,
    );
    assert.equal(
      await db.workOrderInventoryReservation.count({
        where: { tenantId, state: 'HELD' },
      }),
      0,
    );
    assert.equal(
      await inventoryDb.inventoryOperation.count({
        where: {
          tenantId,
          operation: 'ISSUE',
          reservationSettledAt: { not: null },
        },
      }),
      10,
    );
  } finally {
    try {
      await gateway?.close();
      await killWO();
      if (inventoryDb) {
        // RETURN rows refer to usage, while usage refers to its original ISSUE.
        await inventoryDb.stockTransaction.deleteMany({
          where: { tenantId, workOrderPartId: { not: null } },
        });
        for (const name of [
          'usageConfirmation',
          'inventoryAudit',
          'inventoryOperation',
          'workOrderPart',
          'stockTransaction',
          'stock',
          'part',
          'warehouse',
          'outboxEvent',
        ])
          await inventoryDb[name].deleteMany({ where: { tenantId } });
      }
      for (const name of [
        'workOrderInventoryReservation',
        'serviceReport',
        'workLog',
        'workOrderStatusHistory',
        'workOrderAssignment',
        'workOrder',
        'technician',
        'outboxEvent',
      ])
        await db[name].deleteMany({ where: { tenantId } });
    } finally {
      await inventoryApp?.close();
      await db.$disconnect();
    }
  }
  console.log(
    JSON.stringify({
      status: 'PASS',
      scenarios: 10,
      realServices: ['Gateway', 'Inventory', 'WorkOrder'],
      realPostgreSQL: true,
      woProcessRestart: 'SIGKILL',
      inventoryApplicationRestart: true,
      faultHooks:
        'response loss/boundary timing only; actual HTTP proof and stock writes',
      identity: 'test JWT; no live Identity/Organization/broker/UI acceptance',
    }),
  );
}
main().catch(() => {
  console.error(`INVENTORY_RESERVATION_INTEGRATION_FAILED: ${phase}`);
  process.exitCode = 1;
});

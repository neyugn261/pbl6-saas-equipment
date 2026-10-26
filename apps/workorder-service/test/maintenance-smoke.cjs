// Integration fixture producer, not the Maintenance scheduler. Run only in dev/test.
// Uses real RabbitMQ, Work Order service and Gateway; no database access.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { createRequire } = require('node:module');
const {
  Events,
  RabbitMqEventBus,
  subscriptionQueues,
} = require('@pbl6/event-contracts');
const { connect } = createRequire(require.resolve('@pbl6/event-contracts'))(
  'amqplib',
);
const gateway = (process.env.GATEWAY_URL ?? 'http://localhost:3000').replace(
  /\/$/,
  '',
);
const url = process.env.RABBITMQ_URL;
const password = process.env.SEED_DEMO_PASSWORD;
assert.ok(
  ['development', 'test'].includes(process.env.NODE_ENV),
  'Set NODE_ENV=development or test; this script publishes fixture events',
);
assert.ok(url && password, 'RABBITMQ_URL and SEED_DEMO_PASSWORD are required');
const queue = 'workorder-service.maintenance-smoke-' + randomUUID();
const messages = [];
const fixtureTitle = 'Maintenance integration ' + randomUUID();
const bus = new RabbitMqEventBus({ url });
async function call(method, path, { token, body, status = 200 } = {}) {
  const response = await fetch(gateway + path, {
    method,
    headers: {
      ...(token ? { authorization: 'Bearer ' + token } : {}),
      ...(body ? { 'content-type': 'application/json' } : {}),
      'x-correlation-id': 'maintenance-smoke-' + randomUUID(),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(10000),
  });
  const data = await response.json().catch(() => ({}));
  assert.equal(
    response.status,
    status,
    `${method} ${path}: expected ${status}, got ${response.status}, code ${data.code ?? 'unknown'}`,
  );
  return data;
}
async function waitFor(read, match, label) {
  const deadline = Date.now() + 25000;
  do {
    const value = await read();
    if (match(value)) return value;
    await new Promise((resolve) => setTimeout(resolve, 200));
  } while (Date.now() < deadline);
  throw new Error('Timed out: ' + label);
}
async function main() {
  const login = (email) =>
    call('POST', '/api/identity/auth/login', {
      body: { tenantCode: process.env.TENANT_CODE ?? 'DEMO', email, password },
    });
  const manager = await login(
    process.env.MANAGER_EMAIL ?? 'service.manager@demo.local',
  );
  const technician = await login(
    process.env.TECHNICIAN_EMAIL ?? 'technician@demo.local',
  );
  const customer = await login(
    process.env.CUSTOMER_EMAIL ?? 'customer.user@demo.local',
  );
  const token = manager.accessToken;
  const equipment = (
    await call('GET', '/api/assets/equipment?pageSize=100', { token })
  ).items.find((item) => item.status !== 'RETIRED');
  assert.ok(equipment, 'Seed an active equipment fixture');
  const asset = await call('GET', '/api/assets/equipment/' + equipment.id, {
    token,
  });
  const profile = await call('GET', '/api/workorders/technicians/me', {
    token: technician.accessToken,
    status: 200,
  });
  assert.ok(
    ['AVAILABLE', 'BUSY'].includes(profile.status),
    'Demo technician must be AVAILABLE or BUSY',
  );
  bus.subscribe({
    queue,
    events: [
      Events.WorkOrderCreated,
      Events.WorkOrderCompletedV2,
      Events.WorkOrderCancelledV2,
    ],
    handler: async (event) => {
      messages.push(event);
    },
  });
  await bus.start();
  await bus.waitUntilConnected();
  function event() {
    const id = randomUUID();
    return {
      eventId: randomUUID(),
      eventType: 'MaintenanceTaskDue',
      eventVersion: 1,
      producer: 'maintenance-service',
      tenantId: manager.user.tenantId,
      aggregateType: 'MaintenanceTask',
      aggregateId: id,
      occurredAt: new Date().toISOString(),
      correlationId: 'maintenance-smoke-' + randomUUID(),
      payload: {
        maintenanceTaskId: id,
        maintenancePlanId: randomUUID(),
        equipmentId: asset.id,
        customerId: asset.customerId,
        customerSiteId: asset.customerSiteId,
        scheduledDate: '2028-02-29',
        title: fixtureTitle,
      },
    };
  }
  // Find by the Created event's ID; the public API has no Maintenance Task filter.
  async function created(source) {
    await bus.publish(source);
    const observed = await waitFor(
      async () => messages,
      (event) =>
        event.some(
          (e) =>
            e.eventType === 'WorkOrderCreated' &&
            e.payload.maintenanceTaskId === source.aggregateId,
        ),
      'Created v1 delivered',
    );
    const message = observed.find(
      (e) =>
        e.eventType === 'WorkOrderCreated' &&
        e.payload.maintenanceTaskId === source.aggregateId,
    );
    assert.equal(message.correlationId, source.correlationId);
    const row = await call(
      'GET',
      '/api/workorders/work-orders/' + message.payload.workOrderId,
      { token },
    );
    assert.equal(row.createdBy, null);
    assert.equal(row.serviceRequestId, null);
    assert.equal(row.maintenanceTaskId, source.aggregateId);
    assert.equal(row.customerId, asset.customerId);
    assert.equal(row.customerSiteId, asset.customerSiteId);
    assert.equal(row.scheduledStart, '2028-02-28T17:00:00.000Z');
    const history = await call(
      'GET',
      `/api/workorders/work-orders/${row.id}/history`,
      { token },
    );
    assert.equal(history[0].changedBy, null);
    const logs = await call(
      'GET',
      `/api/workorders/work-orders/${row.id}/logs`,
      { token },
    );
    assert.deepEqual(logs, []);
    await call('GET', `/api/workorders/work-orders/${row.id}`, {
      token: customer.accessToken,
      status: 403,
    });
    return row;
  }
  const first = event(),
    completed = await created(first);
  const act = (row, name, accessToken = token, body) =>
    call('POST', `/api/workorders/work-orders/${row.id}/${name}`, {
      token: accessToken,
      body,
    });
  await act(completed, 'assign', token, { technicianId: profile.id });
  await act(completed, 'accept', technician.accessToken);
  await act(completed, 'start', technician.accessToken);
  await act(completed, 'complete', technician.accessToken, {
    problemDescription: 'Periodic checks',
    solution: 'Inspected and tested',
    result: 'RESOLVED',
    customerSummary: 'Maintenance completed',
  });
  await waitFor(
    async () => messages,
    (x) =>
      x.some(
        (e) =>
          e.eventType === 'WorkOrderCompleted' &&
          e.payload.workOrderId === completed.id &&
          e.payload.maintenanceTaskId === first.aggregateId,
      ),
    'Completed v2 delivered',
  );
  const second = event(),
    cancelled = await created(second);
  await act(cancelled, 'cancel', token, {
    reason: 'Await manager replacement decision',
  });
  await waitFor(
    async () => messages,
    (x) =>
      x.some(
        (e) =>
          e.eventType === 'WorkOrderCancelled' &&
          e.payload.workOrderId === cancelled.id &&
          e.payload.cancelServiceRequest === false,
      ),
    'Cancelled v2 delivered',
  );
  await bus.publish(first);
  await bus.publish({ ...first, eventId: randomUUID() });
  await bus.publish(second);
  await bus.publish({ ...second, eventId: randomUUID() });
  // Check the consumer remains active after replay. Exact inbox replay invariants are DB-tested.
  const sentinel = await created(event());
  const completedView = await call(
    'GET',
    '/api/workorders/work-orders/' + completed.id,
    { token },
  );
  assert.equal(completedView.status, 'COMPLETED');
  const cancelledView = await call(
    'GET',
    '/api/workorders/work-orders/' + cancelled.id,
    { token },
  );
  assert.equal(cancelledView.status, 'CANCELLED');
  const all = await call(
    'GET',
    '/api/workorders/work-orders?type=MAINTENANCE&equipmentId=' +
      asset.id +
      '&q=' +
      encodeURIComponent(fixtureTitle) +
      '&pageSize=100',
    { token },
  );
  for (const source of [first, second])
    assert.equal(
      all.items.filter((row) => row.maintenanceTaskId === source.aggregateId)
        .length,
      1,
    );
  assert.equal(
    messages.filter(
      (e) =>
        e.eventType === 'WorkOrderCreated' &&
        [first.aggregateId, second.aggregateId].includes(
          e.payload.maintenanceTaskId,
        ),
    ).length,
    2,
  );
  await act(sentinel, 'cancel', token, {
    reason: 'Integration sentinel cleanup',
  });
  console.log(
    'PASS fixture MaintenanceTaskDue.v1 -> real WO/inbox/outbox -> Created v1 -> Gateway workflow -> Completed/Cancelled v2',
  );
  console.log(
    'PASS replay does not recreate completed/cancelled maintenance WO; null actor and customer isolation',
  );
  console.log(
    JSON.stringify({
      fixtureProducer: true,
      completed: {
        taskId: first.aggregateId,
        workOrderId: completed.id,
        workOrderNo: completed.workOrderNo,
      },
      cancelled: {
        taskId: second.aggregateId,
        workOrderId: cancelled.id,
        workOrderNo: cancelled.workOrderNo,
      },
      sentinelId: sentinel.id,
    }),
  );
}
async function cleanup() {
  await bus.close();
  const connection = await connect(url);
  try {
    const channel = await connection.createChannel();
    for (const name of Object.values(subscriptionQueues(queue)))
      await channel.deleteQueue(name);
  } finally {
    await connection.close();
  }
}
main()
  .catch((error) => {
    console.error('FAIL ' + error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await cleanup();
    } catch (error) {
      console.error('Fixture observer cleanup failed: ' + error.message);
      process.exitCode = 1;
    }
  });

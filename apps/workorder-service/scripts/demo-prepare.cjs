// Prepare one real, reusable demo SR/WO through the Gateway. No foreign DB access.
const assert = require('node:assert/strict');
const { Client } = require('pg');
const { environment, call, login } = require('./demo-common.cjs');
const marker = 'DEMO-M2-WORKORDER-01';
const tenantId = '00000000-0000-4000-8000-000000000001';
const equipmentId = '00000000-0000-4000-8000-000000001101';
async function main() {
  environment();
  const gateway = process.env.GATEWAY_URL ?? 'http://localhost:3000';
  const manager = await login(
    gateway,
    '/api/identity/auth/login',
    'service.manager@demo.local',
  );
  const customer = await login(
    gateway,
    '/api/identity/auth/login',
    'customer.user@demo.local',
  );
  const technician = await login(
    gateway,
    '/api/identity/auth/login',
    'technician@demo.local',
  );
  for (const identity of [manager, customer, technician])
    assert.equal(identity.user.tenantId, tenantId, 'Unexpected DEMO tenant');
  const api = (
    method,
    route,
    body,
    token = manager.accessToken,
    status = 200,
  ) => call(gateway, method, route, token, body, status);
  const profile = await api(
    'GET',
    '/api/workorders/technicians/me',
    undefined,
    technician.accessToken,
  );
  const equipment = await api(
    'GET',
    '/api/assets/equipment/' + equipmentId,
    undefined,
    customer.accessToken,
  );
  assert.equal(
    equipment.customerId,
    customer.user.customerId,
    'Demo equipment must belong to the customer',
  );
  assert.notEqual(equipment.status, 'RETIRED', 'Demo equipment is retired');
  assert.ok(
    process.env.WORKORDER_DATABASE_URL,
    'WORKORDER_DATABASE_URL is required for the demo tool lock',
  );
  // Session advisory lock serializes tool instances without holding a DB transaction over HTTP.
  const db = new Client({
    connectionString: process.env.WORKORDER_DATABASE_URL,
  });
  await db.connect();
  try {
    await db.query('SELECT pg_advisory_lock(hashtextextended($1, 0))', [
      'workorder-demo-prepare:' + tenantId,
    ]);
    const candidates = [];
    for (let page = 1; ; page++) {
      const result = await api(
        'GET',
        `/api/service-requests?q=${encodeURIComponent(marker)}&pageSize=100&page=${page}`,
        undefined,
        customer.accessToken,
      );
      candidates.push(...result.items.filter((sr) => sr.title === marker));
      if (page * result.pageSize >= result.total) break;
    }
    assert.ok(
      candidates.length <= 1,
      'Multiple demo SRs found; reconcile explicitly rather than choosing the latest',
    );
    let sr = candidates[0];
    if (!sr)
      sr = await api(
        'POST',
        '/api/service-requests',
        {
          equipmentId,
          type: 'REPAIR',
          priority: 'NORMAL',
          title: marker,
          description:
            'Demo Work Order: Dispatcher assigns; Technician accepts, executes and submits the report.',
        },
        customer.accessToken,
        201,
      );
    assert.equal(sr.equipmentId, equipmentId, 'Demo SR equipment mismatch');
    assert.equal(
      sr.customerId,
      equipment.customerId,
      'Demo SR customer mismatch',
    );
    let orders = await api(
      'GET',
      `/api/workorders/work-orders?serviceRequestId=${sr.id}&pageSize=100`,
    );
    assert.ok(
      orders.total <= 1,
      'Demo SR already has multiple WO lifecycles; inspect before reusing it',
    );
    let wo = orders.items[0];
    if (!wo) {
      sr = await api('GET', '/api/service-requests/' + sr.id);
      if (sr.status === 'NEW')
        sr = await api('POST', `/api/service-requests/${sr.id}/review`);
      if (sr.status === 'REVIEWING') {
        assert.equal(
          sr.warrantyCheck?.result,
          'IN_WARRANTY',
          'Demo requires in-warranty equipment; do not bypass estimates',
        );
        sr = await api('POST', `/api/service-requests/${sr.id}/accept`);
      }
      assert.equal(
        sr.status,
        'ACCEPTED',
        'Existing demo SR is not ready for WO creation; no status is reset',
      );
      wo = await api(
        'POST',
        '/api/workorders/work-orders',
        { serviceRequestId: sr.id },
        manager.accessToken,
        201,
      );
    }
    assert.equal(wo.equipmentId, equipmentId, 'Demo WO equipment mismatch');
    assert.equal(
      wo.customerId,
      equipment.customerId,
      'Demo WO customer mismatch',
    );
    // Do not reset/reassign/complete the job on rerun. Only observe the Created event's effect.
    const deadline = Date.now() + 20000;
    do {
      sr = await api(
        'GET',
        '/api/service-requests/' + sr.id,
        undefined,
        customer.accessToken,
      );
      if (sr.status !== 'ACCEPTED' || wo.status !== 'CREATED') break;
      await new Promise((resolve) => setTimeout(resolve, 200));
    } while (Date.now() < deadline);
    assert.ok(
      !(wo.status === 'CREATED' && sr.status === 'ACCEPTED'),
      'WO exists but Created has not reached SR; inspect broker/relay, rerun reuses the same records',
    );
    console.log(
      JSON.stringify({
        marker,
        serviceRequestId: sr.id,
        requestNo: sr.requestNo,
        requestStatus: sr.status,
        workOrderId: wo.id,
        workOrderNo: wo.workOrderNo,
        workOrderStatus: wo.status,
        technicianId: profile.id,
        technicianStatus: profile.status,
        nextAction:
          wo.status === 'CREATED'
            ? 'Dispatcher assigns this WO through Web/API'
            : 'Continue existing demo state; no reset performed',
      }),
    );
  } finally {
    await db.end();
  }
}
main().catch((error) => {
  console.error('Work Order demo preparation failed: ' + error.message);
  process.exitCode = 1;
});

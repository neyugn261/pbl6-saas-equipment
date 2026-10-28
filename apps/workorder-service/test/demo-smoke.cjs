// Opt-in real Gateway smoke. Completes the marked demo job only when still CREATED.
const assert = require('node:assert/strict');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { environment, call, login } = require('../scripts/demo-common.cjs');
environment();
const cwd = path.resolve(__dirname, '..');
function tool(name, field) {
  const stdout = execFileSync(process.execPath, ['scripts/' + name + '.cjs'], {
    cwd,
    env: process.env,
    encoding: 'utf8',
    timeout: 30000,
  });
  const result = stdout
    .trim()
    .split('\n')
    .reverse()
    .find((line) => line.startsWith('{') && line.includes('"' + field + '"'));
  assert.ok(result, 'Demo tool did not return its summary');
  return JSON.parse(result);
}
async function main() {
  const firstSeed = tool('seed-dev', 'technicianId');
  assert.deepEqual(tool('seed-dev', 'technicianId'), firstSeed);
  const first = tool('demo-prepare', 'workOrderId');
  const second = tool('demo-prepare', 'workOrderId');
  assert.equal(second.serviceRequestId, first.serviceRequestId);
  assert.equal(second.workOrderId, first.workOrderId);
  assert.equal(second.workOrderStatus, first.workOrderStatus);
  console.log(
    'PASS real Identity/Organization seed twice and Gateway demo prepare twice reuse the same profile/SR/WO',
  );
  const gateway = process.env.GATEWAY_URL ?? 'http://localhost:3000';
  const manager = (
    await login(
      gateway,
      '/api/identity/auth/login',
      'service.manager@demo.local',
    )
  ).accessToken;
  const technician = (
    await login(gateway, '/api/identity/auth/login', 'technician@demo.local')
  ).accessToken;
  const customer = (
    await login(gateway, '/api/identity/auth/login', 'customer.user@demo.local')
  ).accessToken;
  const api = (method, route, body, token = manager, status = 200) =>
    call(gateway, method, route, token, body, status);
  const route = '/api/workorders/work-orders/' + first.workOrderId;
  if (first.workOrderStatus === 'CREATED') {
    await api('POST', route + '/assign', {
      technicianId: firstSeed.technicianId,
    });
    await api('POST', route + '/accept', undefined, technician);
    const busy = await api(
      'GET',
      '/api/workorders/technicians/me',
      undefined,
      technician,
    );
    assert.equal(busy.status, 'BUSY');
    tool('seed-dev', 'technicianId');
    assert.deepEqual(
      await api('GET', '/api/workorders/technicians/me', undefined, technician),
      busy,
    );
    await api('POST', route + '/start', undefined, technician);
    await api(
      'POST',
      route + '/complete',
      {
        problemDescription: 'Internal demo diagnosis',
        solution: 'Internal demo repair',
        result: 'RESOLVED',
        customerSummary: 'Demo equipment serviced',
      },
      technician,
    );
    const deadline = Date.now() + 20000;
    let sr;
    do {
      sr = await api(
        'GET',
        '/api/service-requests/' + first.serviceRequestId,
        undefined,
        customer,
      );
      if (sr.status === 'RESOLVED') break;
      await new Promise((resolve) => setTimeout(resolve, 200));
    } while (Date.now() < deadline);
    assert.equal(sr.status, 'RESOLVED');
    assert.equal(sr.resolutionSummary, 'Demo equipment serviced');
    assert.ok(!JSON.stringify(sr).includes('Internal demo'));
    await api('GET', route, undefined, customer, 403);
    console.log(
      'PASS seed preserves BUSY; real assign/accept/start/report/broker updates the customer-safe SR result',
    );
  } else
    console.log(
      'NOT RUN execution actions: marked demo job already progressed; preserving its state',
    );
  const before = await api('GET', route);
  const history = await api('GET', route + '/history');
  tool('seed-dev', 'technicianId');
  const final = tool('demo-prepare', 'workOrderId');
  assert.equal(final.workOrderId, first.workOrderId);
  assert.deepEqual(await api('GET', route), before);
  assert.deepEqual(await api('GET', route + '/history'), history);
  const matches = await api(
    'GET',
    '/api/service-requests?q=DEMO-M2-WORKORDER-01&pageSize=100',
  );
  assert.equal(
    matches.items.filter((sr) => sr.title === 'DEMO-M2-WORKORDER-01').length,
    1,
  );
  console.log(
    'PASS rerun after progress/completion preserves WO/report/history and does not create another marked SR',
  );
}
main().catch((error) => {
  console.error('Demo smoke failed: ' + error.message);
  process.exitCode = 1;
});

// Compatibility entry point: inspect the canonical seeded demo instead of creating a seventh case.
const assert = require('node:assert/strict');
const { environment, call, login } = require('./demo-common.cjs');
const catalog = require('../../../scripts/demo/catalog.cjs');
async function main() {
  environment();
  const gateway = process.env.GATEWAY_URL || 'http://localhost:3000';
  const manager = await login(gateway, '/api/identity/auth/login', 'service.manager@demo.local');
  const tech = await login(gateway, '/api/identity/auth/login', 'technician@demo.local');
  const fixture = catalog.cases.find(row => row.key === 'DEMO-HCM-INPROGRESS');
  const requests = await call(gateway, 'GET', '/api/service-requests?q=' + encodeURIComponent(fixture.title), manager.accessToken);
  const sr = requests.items.find(row => row.title === fixture.title);
  assert.ok(sr, 'Run pnpm demo:seed from the repository root first');
  const orders = await call(gateway, 'GET', '/api/workorders/work-orders?serviceRequestId=' + sr.id, manager.accessToken);
  const wo = orders.items[0];
  assert.ok(wo, 'The canonical demo Work Order is missing; inspect the seed result');
  const profile = await call(gateway, 'GET', '/api/workorders/technicians/me', tech.accessToken);
  console.log(JSON.stringify({ status: 'READY', serviceRequestId: sr.id, workOrderId: wo.id,
    workOrderNo: wo.workOrderNo, technicianId: profile.id, currentStatus: wo.status, existingLifecyclePreserved: true }));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });

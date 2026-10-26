#!/usr/bin/env node
// Real Gateway + six services + RabbitMQ. Uses DEMO fixtures and leaves the
// newly created SR/WO as evidence; no direct access to another service's DB.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const gateway = (process.env.GATEWAY_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const tenantCode = process.env.TENANT_CODE ?? 'DEMO';
const password = process.env.SEED_DEMO_PASSWORD;
if (!password) throw new Error('SEED_DEMO_PASSWORD is required');

async function call(method, path, { token, body, status = 200 } = {}) {
  const response = await fetch(gateway + path, {
    method, headers: { ...(token ? { authorization: 'Bearer ' + token } : {}),
      ...(body ? { 'content-type': 'application/json' } : {}), 'x-correlation-id': 'm2-week1-' + randomUUID() },
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(10000),
  });
  const result = await response.json().catch(() => ({}));
  assert.equal(response.status, status, `${method} ${path}: expected ${status}, got ${response.status}, code ${result.code ?? 'unknown'}`);
  return result;
}
async function login(email) {
  const result = await call('POST', '/api/identity/auth/login', { body: { tenantCode, email, password } });
  assert.ok(result.accessToken);
  return result.accessToken;
}

async function main() {
  await call('GET', '/health');
  await call('GET', '/api/workorders/health');
  const manager = await login(process.env.MANAGER_EMAIL ?? 'service.manager@demo.local');
  const technician = await login(process.env.TECHNICIAN_EMAIL ?? 'technician@demo.local');
  const customer = await login(process.env.CUSTOMER_EMAIL ?? 'customer.user@demo.local');
  const technicianUser = await call('GET', '/api/identity/auth/me', { token: technician });
  const profiles = await call('GET', '/api/workorders/technicians?pageSize=100', { token: manager });
  let profile = profiles.items.find(p => p.userId === technicianUser.id);
  if (!profile) {
    const branches = await call('GET', '/api/organization/branches?pageSize=100', { token: manager });
    const branch = branches.items.find(b => b.id === process.env.M2_BRANCH_ID || (!process.env.M2_BRANCH_ID && b.status === 'ACTIVE'));
    assert.ok(branch, 'Seed an active demo branch first');
    profile = await call('POST', '/api/workorders/technicians', { token: manager, status: 201,
      body: { userId: technicianUser.id, branchId: branch.id, employeeCode: 'DEMO-TECH-01' } });
  }
  assert.equal((await call('GET', '/api/workorders/technicians/me', { token: technician })).id, profile.id);
  console.log('PASS real Identity/Organization references and Technician me through Gateway');

  const equipment = await call('GET', '/api/assets/equipment?pageSize=100', { token: customer });
  let selected;
  for (const item of equipment.items.filter(e => e.status !== 'RETIRED')) {
    const warranty = await call('GET', `/api/assets/equipment/${item.id}/warranty-status`, { token: customer });
    if (warranty.result === 'IN_WARRANTY') { selected = item; break; }
  }
  assert.ok(selected, 'Seed equipment in warranty for the demo customer');
  const sr = await call('POST', '/api/service-requests', { token: customer, status: 201,
    body: { equipmentId: selected.id, type: 'REPAIR', priority: 'NORMAL', title: 'M2 week 1 smoke repair', description: 'Gateway and RabbitMQ integration evidence.' } });
  await call('POST', `/api/service-requests/${sr.id}/review`, { token: manager });
  await call('POST', `/api/service-requests/${sr.id}/accept`, { token: manager });
  const wo = await call('POST', '/api/workorders/work-orders', { token: manager, status: 201, body: { serviceRequestId: sr.id } });
  assert.equal(wo.status, 'CREATED');
  assert.equal(wo.equipmentId, selected.id);
  assert.equal((await call('GET', `/api/workorders/work-orders/${wo.id}`, { token: manager })).id, wo.id);
  const history = await call('GET', `/api/workorders/work-orders/${wo.id}/history`, { token: manager });
  assert.equal(history[0].newStatus, 'CREATED');
  await call('POST', '/api/workorders/work-orders', { token: manager, status: 409, body: { serviceRequestId: sr.id } });
  console.log('PASS accepted SR -> Work Order CREATED, history and duplicate protection');

  const deadline = Date.now() + 20000;
  let processing = false;
  while (Date.now() < deadline) {
    if ((await call('GET', `/api/service-requests/${sr.id}`, { token: customer })).status === 'PROCESSING') { processing = true; break; }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  assert.ok(processing, 'SR did not become PROCESSING via WorkOrderCreated; check both relays and RabbitMQ');
  console.log('PASS real WorkOrderCreated.v1 delivery: Service Request PROCESSING');
  await call('GET', '/api/workorders/work-orders', { status: 401 });
  await call('GET', `/api/workorders/work-orders/${wo.id}`, { token: customer, status: 403 });
  await call('GET', `/api/workorders/work-orders/${wo.id}`, { token: technician, status: 404 });
  const mine = await call('GET', '/api/workorders/work-orders?mine=true', { token: technician });
  assert.ok(!mine.items.some(item => item.id === wo.id));
  await call('GET', `/api/workorders/internal/work-orders/${wo.id}`, { token: manager, status: 404 });
  console.log('PASS auth, Customer isolation, Technician assignment scope and internal Gateway block');
  console.log(JSON.stringify({ serviceRequestId: sr.id, workOrderId: wo.id, workOrderNo: wo.workOrderNo, technicianId: profile.id }));
}
main().catch(error => { console.error('FAIL ' + error.message); process.exitCode = 1; });

#!/usr/bin/env node
// Local DEMO integration check for the plan controls used by the web UI.
import assert from 'node:assert/strict';

const gateway = process.env.GATEWAY_URL ?? 'http://localhost:3000';
const password = process.env.SEED_DEMO_PASSWORD;
assert.ok(password, 'SEED_DEMO_PASSWORD is required');
async function call(method, path, { token, body, status = 200 } = {}) {
  const response = await fetch(gateway + path, {
    method,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(10000),
  });
  const data = await response.json().catch(() => ({}));
  assert.equal(response.status, status, `${method} ${path}: ${response.status} ${data.code ?? ''}`);
  return data;
}
async function login(email) {
  return (await call('POST', '/api/identity/auth/login', { body: { tenantCode: 'DEMO', email, password } })).accessToken;
}
const manager = await login('service.manager@demo.local');
const customer = await login('customer.user@demo.local');
const equipmentId = '00000000-0000-4000-8000-000000001102';
const due = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
const plan = await call('POST', '/api/maintenance/maintenance-plans', { token: manager, status: 201, body: {
  equipmentId, name: 'M2 web plan verification', frequencyUnit: 'MONTH', frequencyValue: 1, nextDueDate: due,
} });
assert.equal(plan.status, 'ACTIVE');
const changed = await call('PATCH', `/api/maintenance/maintenance-plans/${plan.id}`, { token: manager, body: { name: 'M2 web plan updated' } });
assert.equal(changed.name, 'M2 web plan updated');
assert.equal((await call('PATCH', `/api/maintenance/maintenance-plans/${plan.id}`, { token: manager, body: { status: 'PAUSED' } })).status, 'PAUSED');
assert.equal((await call('PATCH', `/api/maintenance/maintenance-plans/${plan.id}`, { token: manager, body: { status: 'ACTIVE' } })).status, 'ACTIVE');
await call('GET', `/api/maintenance/maintenance-plans/${plan.id}`, { token: customer, status: 403 });
assert.equal((await call('PATCH', `/api/maintenance/maintenance-plans/${plan.id}`, { token: manager, body: { status: 'INACTIVE' } })).status, 'INACTIVE');
console.log('PASS Maintenance Plan create/edit/pause/resume/inactive and Customer User restriction');
console.log(JSON.stringify({ planId: plan.id }));

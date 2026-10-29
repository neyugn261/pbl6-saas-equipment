#!/usr/bin/env node
// Local DEMO integration check. Creates a service request and estimate through Gateway.
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
  const result = await call('POST', '/api/identity/auth/login', { body: { tenantCode: 'DEMO', email, password } });
  return result.accessToken;
}
const manager = await login('service.manager@demo.local');
const customer = await login('customer.user@demo.local');
const customerAdmin = await login('customer.admin@demo.local');
const equipmentId = '00000000-0000-4000-8000-000000001102';
const coverage = await call('GET', `/api/assets/equipment/${equipmentId}/warranty-status`, { token: customer });
assert.notEqual(coverage.result, 'IN_WARRANTY', 'DEMO-ASSET-02 should be out of warranty');
const request = await call('POST', '/api/service-requests', { token: customer, status: 201, body: {
  equipmentId, type: 'REPAIR', priority: 'NORMAL', title: 'M2 web estimate verification', description: 'Local integration check',
} });
await call('POST', `/api/service-requests/${request.id}/review`, { token: manager });
const draft = await call('POST', `/api/service-requests/${request.id}/estimates`, { token: manager, status: 201, body: {
  currency: 'VND', items: [{ itemType: 'LABOR', description: 'Kiểm tra thiết bị', quantity: '2', unitPrice: '100000' }],
} });
assert.equal(draft.totalAmount, '200000.00');
assert.equal(draft.status, 'DRAFT');
assert.equal((await call('GET', `/api/service-requests/${request.id}/estimates`, { token: customerAdmin })).length, 0);
const updated = await call('PUT', `/api/service-requests/estimates/${draft.id}`, { token: manager, body: {
  currency: 'VND', items: [{ itemType: 'LABOR', description: 'Kiểm tra thiết bị', quantity: '3', unitPrice: '100000' }],
} });
assert.equal(updated.totalAmount, '300000.00');
await call('POST', `/api/service-requests/estimates/${draft.id}/send`, { token: manager });
assert.equal((await call('GET', `/api/service-requests/${request.id}`, { token: customerAdmin })).status, 'AWAITING_CUSTOMER_APPROVAL');
await call('POST', `/api/service-requests/estimates/${draft.id}/approve`, { token: customer, status: 403 });
await call('POST', `/api/service-requests/estimates/${draft.id}/approve`, { token: customerAdmin });
assert.equal((await call('GET', `/api/service-requests/${request.id}`, { token: customerAdmin })).status, 'ACCEPTED');
await call('POST', `/api/service-requests/estimates/${draft.id}/approve`, { token: customerAdmin, status: 409 });
const rejectedRequest = await call('POST', '/api/service-requests', { token: customer, status: 201, body: {
  equipmentId, type: 'REPAIR', priority: 'NORMAL', title: 'M2 web estimate rejection verification', description: 'Local integration check',
} });
await call('POST', `/api/service-requests/${rejectedRequest.id}/review`, { token: manager });
const rejectedDraft = await call('POST', `/api/service-requests/${rejectedRequest.id}/estimates`, { token: manager, status: 201, body: {
  currency: 'VND', items: [{ itemType: 'LABOR', description: 'Kiểm tra thiết bị', quantity: '1', unitPrice: '100000' }],
} });
await call('POST', `/api/service-requests/estimates/${rejectedDraft.id}/send`, { token: manager });
await call('POST', `/api/service-requests/estimates/${rejectedDraft.id}/reject`, { token: customerAdmin, body: { reason: 'Cần sửa dự toán' } });
assert.equal((await call('GET', `/api/service-requests/${rejectedRequest.id}`, { token: customerAdmin })).status, 'COST_REJECTED');
await call('POST', `/api/service-requests/estimates/${rejectedDraft.id}/approve`, { token: customerAdmin, status: 409 });
console.log('PASS Cost Estimate draft/edit/server total, customer visibility, send, approve/reject and stale response');
console.log(JSON.stringify({ serviceRequestId: request.id, estimateId: draft.id }));

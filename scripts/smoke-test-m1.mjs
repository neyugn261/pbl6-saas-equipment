#!/usr/bin/env node
// M1 integration smoke test: Identity -> Asset -> Service Request through Gateway.
// Start the four M1 services, apply migrations and seed their DEMO fixtures first.

const gateway = (process.env.GATEWAY_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const tenantCode = process.env.TENANT_CODE ?? 'DEMO';
const password = process.env.SEED_DEMO_PASSWORD;
const webOrigin = process.env.WEB_ORIGIN ?? 'http://localhost:5173';

if (!password) {
  console.error('Set SEED_DEMO_PASSWORD to the password used by identity:seed:dev.');
  process.exit(1);
}

async function call(method, path, { token, body, headers = {}, status = 200 } = {}) {
  const response = await fetch(`${gateway}${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const raw = await response.text();
  let data;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    data = raw;
  }
  if (response.status !== status) {
    throw new Error(`${method} ${path}: expected ${status}, got ${response.status}: ${raw.slice(0, 300)}`);
  }
  return { data, response };
}

async function login(email) {
  const { data } = await call('POST', '/api/auth/login', {
    body: { tenantCode, email, password },
  });
  if (!data?.accessToken) throw new Error(`No access token for ${email}`);
  return data.accessToken;
}

async function main() {
  const { data: health } = await call('GET', '/health');
  for (const service of ['identity', 'organization', 'asset', 'service-request']) {
    if (health.services?.[service] !== 'up') throw new Error(`${service} is not ready`);
  }
  console.log('PASS Gateway aggregates the four M1 services');

  await call('GET', '/api/identity/internal/users', { status: 404 });
  await call('GET', '/api/assets/internal/equipment/test', { status: 404 });
  console.log('PASS Gateway blocks internal APIs');

  const preflight = await fetch(`${gateway}/api/auth/login`, {
    method: 'OPTIONS',
    headers: { origin: webOrigin, 'access-control-request-method': 'POST' },
  });
  if (preflight.status !== 204 || preflight.headers.get('access-control-allow-origin') !== webOrigin) {
    throw new Error('Gateway CORS preflight failed for the web origin');
  }
  console.log('PASS Web CORS preflight');

  const customerToken = await login(process.env.CUSTOMER_EMAIL ?? 'customer.user@demo.local');
  const managerToken = await login(process.env.MANAGER_EMAIL ?? 'service.manager@demo.local');
  const { data: customer } = await call('GET', '/api/identity/auth/me', { token: customerToken });
  if (!customer.customerId) throw new Error('Demo Customer User has no active customer membership');
  console.log('PASS Customer and Service Manager login through Gateway');

  const { data: customerDirectory } = await call('GET', '/api/organization/customers', {
    token: managerToken,
  });
  if (!customerDirectory.items?.some((item) => item.id === customer.customerId)) {
    throw new Error('Organization does not contain the seeded customer');
  }
  console.log('PASS Organization customer lookup');

  const { data: equipmentPage } = await call('GET', '/api/assets/equipment', {
    token: customerToken,
  });
  const candidates = process.env.M1_EQUIPMENT_ID
    ? [{ id: process.env.M1_EQUIPMENT_ID }]
    : (equipmentPage.items ?? []);
  let equipmentId;
  for (const candidate of candidates) {
    const { data: warranty } = await call(
      'GET',
      `/api/assets/equipment/${candidate.id}/warranty-status`,
      { token: customerToken },
    );
    if (warranty.result === 'IN_WARRANTY') {
      equipmentId = candidate.id;
      break;
    }
  }
  if (!equipmentId) throw new Error('No in-warranty equipment visible to the demo Customer User');
  console.log('PASS Customer can find in-warranty equipment');

  const { data: created } = await call('POST', '/api/service-requests', {
    token: customerToken,
    body: {
      equipmentId,
      type: 'REPAIR',
      priority: 'NORMAL',
      title: 'M1 smoke test repair',
      description: 'Created by the M1 integration smoke test.',
    },
    status: 201,
  });
  if (!created.id || created.status !== 'NEW') throw new Error('Service Request was not created as NEW');

  const requestPath = `/api/service-requests/${created.id}`;
  const { data: reviewing } = await call('POST', `${requestPath}/start-review`, {
    token: managerToken,
  });
  if (reviewing.status !== 'REVIEWING') throw new Error('Service Request did not enter REVIEWING');

  await call('POST', `${requestPath}/warranty-check`, { token: managerToken });
  const { data: accepted } = await call('POST', `${requestPath}/accept`, {
    token: managerToken,
  });
  if (accepted.status !== 'ACCEPTED') throw new Error('Service Request did not enter ACCEPTED');

  const { data: customerView } = await call('GET', requestPath, { token: customerToken });
  if (customerView.status !== 'ACCEPTED') throw new Error('Customer cannot see the accepted request');
  console.log(`PASS M1 vertical slice: ${created.requestNo ?? created.id} is ACCEPTED`);
}

main().catch((error) => {
  console.error(`FAIL ${error.message}`);
  process.exitCode = 1;
});

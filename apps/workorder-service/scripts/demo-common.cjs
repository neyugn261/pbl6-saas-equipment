const assert = require('node:assert/strict');
const path = require('node:path');

function environment() {
  require('dotenv').config({
    path: path.join(__dirname, '../.env'),
    quiet: true,
  });
  require('dotenv').config({
    path: path.join(__dirname, '../../../.env'),
    quiet: true,
  });
  assert.ok(
    ['development', 'test'].includes(process.env.NODE_ENV ?? 'development'),
    'Demo tools are forbidden outside development/test',
  );
  assert.ok(
    process.env.SEED_DEMO_PASSWORD,
    'Set SEED_DEMO_PASSWORD; run the Identity dev seed first',
  );
}
async function call(base, method, route, token, body, expected = 200) {
  const response = await fetch(base.replace(/\/$/, '') + route, {
    method,
    headers: {
      ...(token ? { authorization: 'Bearer ' + token } : {}),
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      'x-correlation-id': 'workorder-demo',
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(10000),
  });
  const value = await response.json().catch(() => ({}));
  // Never log login payloads, bearer tokens, signed URLs or unfiltered upstream bodies.
  assert.equal(
    response.status,
    expected,
    `${method} ${route}: HTTP ${response.status} ${value.code ?? ''}`,
  );
  return value;
}
async function login(base, route, email) {
  const result = await call(base, 'POST', route, undefined, {
    tenantCode: 'DEMO',
    email,
    password: process.env.SEED_DEMO_PASSWORD,
  });
  assert.ok(
    result.accessToken && result.user?.id,
    'Identity login response is incomplete',
  );
  return result;
}
module.exports = { environment, call, login };

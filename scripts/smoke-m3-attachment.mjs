import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const gateway = process.env.PBL6_M3_GATEWAY_URL;
const workOrderId = process.env.PBL6_M3_WORK_ORDER_ID;
const password = process.env.SEED_DEMO_PASSWORD;
assert.ok(gateway && workOrderId && password, 'Set Gateway URL, Work Order ID and demo password');
const bytes = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lXcAAAAASUVORK5CYII=',
  'base64',
);
const checksumSha256 = createHash('sha256').update(bytes).digest('hex');
const fileName = 'm3-gateway-smoke.png';
function stableKey(operation) {
  const hex = createHash('sha256').update(`${operation}:${workOrderId}`).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
async function json(response, expected) {
  const value = await response.json().catch(() => ({}));
  if (response.status !== expected) {
    throw new Error(`HTTP ${response.status}: ${value.code ?? 'UNEXPECTED_RESPONSE'}`);
  }
  return value;
}
async function api(path, method, token, body, key) {
  return fetch(new URL(path, gateway), {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(key ? { 'idempotency-key': key } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(20_000),
  });
}

try {
  const login = await json(
    await fetch(new URL('/api/auth/login', gateway), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        tenantCode: 'DEMO',
        email: 'service.manager@demo.local',
        password,
      }),
      signal: AbortSignal.timeout(20_000),
    }),
    200,
  );
  const token = login.accessToken;
  assert.ok(token, 'Login returned no access token');
  const base = `/api/workorders/work-orders/${workOrderId}`;
  const prepareResponse = await api(
    `${base}/attachment-uploads`,
    'POST',
    token,
    { fileName, mimeType: 'image/png', sizeBytes: bytes.length, checksumSha256 },
    stableKey('prepare'),
  );
  let attachmentId;
  if (prepareResponse.status === 409) {
    const result = await prepareResponse.json();
    assert.equal(result.code, 'UPLOAD_ALREADY_ATTACHED');
    attachmentId = result.details?.attachmentId;
    assert.ok(attachmentId, 'Replay did not identify the existing attachment');
  } else {
    const ticket = await json(prepareResponse, 201);
    assert.equal(ticket.method, 'PUT');
    assert.ok(ticket.uploadId && ticket.uploadUrl);
    const put = await fetch(ticket.uploadUrl, {
      method: 'PUT',
      headers: ticket.headers,
      body: bytes,
      signal: AbortSignal.timeout(30_000),
    });
    assert.ok(put.ok, `Storage PUT failed: HTTP ${put.status}`);
    const attached = await json(
      await api(
        `/api/workorders/attachment-uploads/${ticket.uploadId}/complete`,
        'POST',
        token,
        {},
        stableKey('finalize'),
      ),
      200,
    );
    attachmentId = attached.id;
    assert.ok(attachmentId, 'Finalize returned no attachment ID');
  }
  const page = await json(await api(`${base}/attachments`, 'GET', token), 200);
  assert.ok(page.items.some((item) => item.id === attachmentId));
  const download = await json(
    await api(`/api/workorders/attachments/${attachmentId}/download`, 'GET', token),
    200,
  );
  const get = await fetch(download.downloadUrl, { signal: AbortSignal.timeout(30_000) });
  assert.ok(get.ok, `Storage GET failed: HTTP ${get.status}`);
  assert.deepEqual(Buffer.from(await get.arrayBuffer()), bytes);
  console.log(`M3 attachment smoke passed: WO ${workOrderId}, attachment ${attachmentId}`);
} catch (error) {
  // Never print a signed URL, token, request body or raw upstream response.
  console.error(`M3 attachment smoke failed: ${error.message}`);
  process.exitCode = 1;
}

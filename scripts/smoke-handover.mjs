// Real HTTP (Gateway + four services), PostgreSQL and RabbitMQ. Test DBs only.
// Run after build and scripts/handover-checks.mjs migrate. Does not reset any DB.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
const serviceRequire = name => createRequire(new URL(`../apps/${name}-service/package.json`, import.meta.url));
const req = serviceRequire('asset');
req('dotenv').config({ path: '.env', quiet: true });
const { requireTestDatabaseUrl, testJwtEnv } = req('@pbl6/testing');
const { configureApp } = req('@pbl6/service-kit');
const { createPrismaAdapter } = req('@pbl6/service-kit/prisma');
const { Events, RabbitMqEventBus, OutboxRelay, enqueueEvent, subscriptionQueues } = req('@pbl6/event-contracts');
const { NestFactory } = req('@nestjs/core');
const { ConfigService } = req('@nestjs/config');
const rabbitUrl = process.env.RABBITMQ_TEST_URL || process.env.RABBITMQ_URL;
assert.ok(rabbitUrl, 'Configure RABBITMQ_TEST_URL');
const base = new URL(requireTestDatabaseUrl('ASSET_TEST_DATABASE_URL'));
const clients = {}, apps = [], queues = [], sourceEvents = [];
const tenantId = randomUUID(), customerId = randomUUID(), siteId = randomUUID(), membershipId = randomUUID();
const suffix = randomUUID().slice(0, 8), tenantCode = `HANDOVER-${suffix}`;
const exchange = `pbl6.handover.test.${suffix}`;
const password = process.env.HANDOVER_TEST_PASSWORD || `Test-only-${randomUUID()}!`;
Object.assign(process.env, testJwtEnv(), { NODE_ENV: 'test', RABBITMQ_URL: '', BCRYPT_COST: '4',
  IDENTITY_EXPOSE_ACTIVATION_TOKEN: 'false', ASSET_QR_PORTAL_BASE_URL: 'http://127.0.0.1', LOGIN_RATE_LIMIT: '100' });
for (const name of ['identity', 'organization', 'asset', 'notification']) {
  const prefix = name.toUpperCase(), url = new URL(base); url.pathname = `/${name}_test_db`;
  process.env[`${prefix}_TEST_DATABASE_URL`] ??= url.toString();
  const database = requireTestDatabaseUrl(`${prefix}_TEST_DATABASE_URL`);
  process.env[`${prefix}_DATABASE_URL`] = database;
  const { PrismaClient } = serviceRequire(name)('./dist/generated/prisma/client.js');
  clients[name] = new PrismaClient({ adapter: createPrismaAdapter(database) });
}
const bus = new RabbitMqEventBus({ url: rabbitUrl, exchange });
const nreq = serviceRequire('notification');
const { NotificationEventsService } = nreq('./dist/events/notification-events.service.js');
const { RecipientProjectionService } = nreq('./dist/events/recipient-projection.service.js');
const processor = new NotificationEventsService(clients.notification);
const projection = new RecipientProjectionService(clients.notification, processor);
for (const [label, events, handler] of [
  ['business', [Events.EquipmentHandoverChanged], e => processor.handle(e)],
  ['recipients', [Events.NotificationRecipientSnapshot], e => projection.applySnapshot(e)],
  ['bootstrap', [Events.NotificationRecipientBootstrapCompleted], e => projection.applyBootstrapCompleted(e)],
]) {
  const queue = `handover.test.${suffix}.${label}`; queues.push(queue);
  bus.subscribe({ queue, events, handler: async e => { sourceEvents.push(e.eventId); await handler(e); }, retryDelayMs: 50 });
}
async function start(name) {
  const r = name === 'api-gateway' ? createRequire(new URL('../apps/api-gateway/package.json', import.meta.url)) : serviceRequire(name);
  const { AppModule } = r('./dist/app.module.js');
  const app = await NestFactory.create(AppModule, { logger: false });
  apps.push(app);
  if (name === 'api-gateway') r('./dist/gateway.setup.js').configureGateway(app, app.get(ConfigService));
  else configureApp(app, { logger: { log() {}, warn() {}, error() {} } });
  await app.listen(0, '127.0.0.1');
  return `http://127.0.0.1:${app.getHttpServer().address().port}`;
}
async function eventually(check, description) {
  for (let i = 0; i < 100; i++) { if (await check()) return; await delay(100); }
  throw new Error(`Timed out: ${description}`);
}
let gateway, webServer;
async function http(path, token, method = 'GET', body, expected = 200) {
  const result = await fetch(`${gateway}${path}`, { method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(15000) });
  const data = await result.json();
  assert.equal(result.status, expected, `${method} ${path}: ${result.status} ${data.code ?? ''} ${data.message ?? ''}`);
  return data;
}
try {
  for (const db of Object.values(clients)) await db.$connect();
  const { identity, organization, asset, notification } = clients;
  await organization.tenant.create({ data: { id: tenantId, code: tenantCode, name: 'Handover integration' } });
  await organization.customer.create({ data: { id: customerId, tenantId, code: 'C1', name: 'Handover customer' } });
  await organization.customerSite.create({ data: { id: siteId, tenantId, customerId, code: 'S1', name: 'Test site', address: 'Test' } });
  await identity.tenantDirectory.create({ data: { tenantId, code: tenantCode, status: 'ACTIVE' } });
  const bcrypt = serviceRequire('identity')('bcryptjs');
  async function user(role, userType) {
    const created = await identity.user.create({ data: { tenantId, userType, email: `${role.toLowerCase()}-${suffix}@test.invalid`,
      fullName: role, passwordHash: await bcrypt.hash(password, 4), status: 'ACTIVE' } });
    const roleRow = await identity.role.findUniqueOrThrow({ where: { code: role } });
    await identity.userRole.create({ data: { userId: created.id, roleId: roleRow.id } });
    return created;
  }
  const manager = await user('SERVICE_MANAGER', 'TENANT_STAFF'), customer = await user('CUSTOMER_ADMIN', 'CUSTOMER');
  await organization.customerUserMembership.create({ data: { id: membershipId, tenantId, customerId, userId: customer.id } });
  await identity.userCustomerLink.create({ data: { userId: customer.id, tenantId, customerId, membershipId, status: 'ACTIVE', sourceChangedAt: new Date() } });
  await bus.start(); await eventually(() => bus.isReady(), 'broker ready');
  const runId = randomUUID(), { enqueueRecipientSnapshot } = serviceRequire('identity')('./dist/events/recipient-snapshots.js');
  await identity.$transaction(async tx => {
    await enqueueRecipientSnapshot(tx, manager.id, runId); await enqueueRecipientSnapshot(tx, customer.id, runId);
    await enqueueEvent(tx, Events.NotificationRecipientBootstrapCompleted, { tenantId, aggregateId: runId, payload: {
      bootstrapRunId: runId, expectedUsers: 2, startedAt: new Date().toISOString(), completedAt: new Date().toISOString(),
    } });
  });
  await new OutboxRelay({ db: identity, publisher: bus, producer: 'identity-service' }).runOnce();
  await eventually(async () => (await notification.recipientBootstrapRun.findUnique({ where: { bootstrapRunId: runId } }))?.status === 'COMPLETED', 'real recipient bootstrap');
  process.env.IDENTITY_SERVICE_URL = await start('identity');
  process.env.ORGANIZATION_SERVICE_URL = await start('organization');
  process.env.ASSET_SERVICE_URL = await start('asset');
  process.env.NOTIFICATION_SERVICE_URL = await start('notification');
  for (const name of ['SERVICE_REQUEST', 'WORKORDER', 'MAINTENANCE', 'INVENTORY']) process.env[`${name}_SERVICE_URL`] = 'http://127.0.0.1:9';
  gateway = await start('api-gateway');
  const login = async u => (await http('/api/identity/auth/login', null, 'POST', { tenantCode, email: u.email, password })).accessToken;
  const staffToken = await login(manager), customerToken = await login(customer);
  const model = await http('/api/assets/equipment-models', staffToken, 'POST', { manufacturer: 'Test', modelCode: suffix, name: 'Handover pump' }, 201);
  const relay = new OutboxRelay({ db: asset, publisher: bus, producer: 'asset-service' });
  async function handover() {
    const eq = await http('/api/assets/equipment', staffToken, 'POST', { modelId: model.id, customerId, customerSiteId: siteId,
      assetCode: `P-${randomUUID()}`, serialNumber: randomUUID(), handoverRequired: true }, 201);
    assert.equal(eq.status, 'OUT_OF_SERVICE');
    const h = await http('/api/assets/equipment-handovers', staffToken, 'POST', { equipmentId: eq.id, condition: 'New', notes: 'Customer-safe record',
      deliveryAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 86400000).toISOString() }, 201);
    await http(`/api/assets/equipment-handovers/${h.id}/submit`, staffToken, 'POST', {});
    await relay.runOnce();
    await eventually(async () => (await http('/api/notifications', customerToken)).items.some(n => n.resourceId === h.id), 'customer notification through Gateway');
    return { eq, h };
  }
  const first = await handover();
  await http(`/api/assets/equipment/${first.eq.id}`, staffToken, 'PATCH', { status: 'ACTIVE' }, 409);
  await http(`/api/assets/my/equipment-handovers/${first.h.id}/accept`, staffToken, 'POST', {}, 403);
  const detail = await http(`/api/assets/my/equipment-handovers/${first.h.id}`, customerToken);
  assert.equal(detail.equipmentStatus, 'OUT_OF_SERVICE'); assert.equal(detail.createdBy, undefined);
  const accepted = await http(`/api/assets/my/equipment-handovers/${first.h.id}/accept`, customerToken, 'POST', {});
  assert.equal(accepted.status, 'ACTIVATED'); assert.equal(accepted.equipmentStatus, 'ACTIVE'); assert.ok(accepted.activatedAt);
  await http(`/api/assets/my/equipment-handovers/${first.h.id}/accept`, customerToken, 'POST', {});
  await relay.runOnce();
  await eventually(async () => (await http('/api/notifications', staffToken)).items.some(n => n.resourceId === first.h.id), 'staff activation notification');
  const second = await handover();
  await http(`/api/assets/my/equipment-handovers/${second.h.id}/reject`, customerToken, 'POST', { reason: 'Wrong serial number' });
  assert.equal((await http(`/api/assets/equipment/${second.eq.id}`, staffToken)).status, 'OUT_OF_SERVICE');
  await relay.runOnce();
  await eventually(async () => (await http('/api/notifications', staffToken)).items.some(n => n.resourceId === second.h.id), 'staff rejection notification');
  const replacement = await http('/api/assets/equipment-handovers', staffToken, 'POST', { equipmentId: second.eq.id, condition: 'Corrected serial',
    deliveryAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 86400000).toISOString() }, 201);
  await http(`/api/assets/my/equipment-handovers/${second.h.id}/accept`, customerToken, 'POST', {}, 409);
  await http(`/api/assets/equipment-handovers/${replacement.id}/submit`, staffToken, 'POST', {});
  // Membership revocation is observed synchronously even while Identity's token/link is still old.
  await organization.customerUserMembership.update({ where: { id: membershipId }, data: { status: 'INACTIVE' } });
  await http(`/api/assets/my/equipment-handovers/${replacement.id}/accept`, customerToken, 'POST', {}, 403);
  assert.equal((await asset.equipment.findUniqueOrThrow({ where: { id: second.eq.id } })).status, 'OUT_OF_SERVICE');
  console.log('PASS: real Gateway + Identity + Organization + Asset + Notification + PostgreSQL + RabbitMQ.');
  console.log('PASS: accept/activation, notification/deep link, reject/replacement, staff bypass, replay, live revoked membership.');
  if (process.argv.includes('--ui')) {
    assert.ok(process.env.HANDOVER_TEST_PASSWORD, 'Set a disposable HANDOVER_TEST_PASSWORD for UI verification');
    await organization.customerUserMembership.update({ where: { id: membershipId }, data: { status: 'ACTIVE' } });
    const ui = await handover();
    const webRequire = createRequire(new URL('../apps/web/package.json', import.meta.url));
    const { createServer } = await import(pathToFileURL(webRequire.resolve('vite')).href);
    const { default: react } = await import(pathToFileURL(webRequire.resolve('@vitejs/plugin-react')).href);
    webServer = await createServer({ root: fileURLToPath(new URL('../apps/web/', import.meta.url)), configFile: false, plugins: [react()],
      server: { host: '127.0.0.1', port: 5199, strictPort: true, proxy: { '/gateway': { target: gateway, changeOrigin: true, rewrite: path => path.replace(/^\/gateway/, '') } } } });
    await webServer.listen();
    relay.start();
    console.log(JSON.stringify({ ui: 'http://127.0.0.1:5199', tenantCode, staff: manager.email, customer: customer.email,
      handoverId: ui.h.id, equipmentId: ui.eq.id }));
    console.log('UI fixture running; send a line on stdin to stop. Password is the supplied test-only environment value.');
    await new Promise(resolve => process.stdin.once('data', resolve));
    await relay.stop();
  }
} finally {
  await webServer?.close();
  for (const app of apps.reverse()) await app.close();
  await bus.close();
  const eventsReq = createRequire(new URL('../packages/event-contracts/package.json', import.meta.url));
  const connection = await eventsReq('amqplib').connect(rabbitUrl);
  const channel = await connection.createChannel();
  for (const queue of queues) for (const q of Object.values(subscriptionQueues(queue))) await channel.deleteQueue(q);
  await channel.deleteExchange(exchange); await channel.close(); await connection.close();
  // Retain isolated tenant fixtures in test DBs for diagnostics; never truncate shared data.
  for (const db of Object.values(clients)) await db.$disconnect();
}

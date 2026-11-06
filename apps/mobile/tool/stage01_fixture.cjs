/* Phase 0 fixture: isolated UUID tenants in validated test databases only.
   Runtime seeds touch each service's own DB; business transitions use Gateway APIs.
   --serve keeps the disposable API stack alive for Android; default validates and exits. */
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const { randomUUID, randomBytes } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const root = path.resolve(__dirname, '../../..');
const req = name => createRequire(path.join(root, 'apps', name === 'gateway' ? 'api-gateway' : name + '-service', 'package.json'));
const r = req('asset'); r('dotenv').config({ path: path.join(root, '.env'), quiet: true });
const { requireTestDatabaseUrl, testJwtEnv } = r('@pbl6/testing');
const { configureApp } = r('@pbl6/service-kit');
const { Events, RabbitMqEventBus, OutboxRelay, subscriptionQueues } = r('@pbl6/event-contracts');
const withNotifications = process.argv.includes('--notifications');
const withParts = process.argv.includes('--parts');
const stage = withParts ? '03' : withNotifications ? '02' : '01';
const names = ['identity', 'organization', 'asset', 'maintenance', 'workorder', 'service-request', ...(withNotifications ? ['notification'] : []), ...(withParts ? ['inventory'] : [])];
const urls = Object.fromEntries(names.map(name => [name, requireTestDatabaseUrl(name.replaceAll('-', '_').toUpperCase() + '_TEST_DATABASE_URL')]));
const broker = process.env.RABBITMQ_TEST_URL || process.env.RABBITMQ_URL;
assert.ok(broker, 'Configure a test broker for Maintenance fixture');
Object.assign(process.env, testJwtEnv(), { NODE_ENV: 'test', RABBITMQ_URL: '', MAINTENANCE_SCHEDULER_ENABLED: 'false', BCRYPT_COST: '4', LOGIN_RATE_LIMIT: '200', ASSET_QR_PORTAL_BASE_URL: 'http://portal.test' });
for (const name of names) process.env[name.replaceAll('-', '_').toUpperCase() + '_DATABASE_URL'] = urls[name];
const apps = {}, db = {}, ports = {}, relays = [];
const tenants = [randomUUID(), randomUUID()], suffix = randomUUID().slice(0, 8);
const password = 'M01-' + randomBytes(18).toString('hex') + '!aA1';
const exchange = `pbl6.test.mobile-stage${stage}.` + randomUUID();
const queues = [];
let bus;
const runtime = path.resolve(process.env.MOBILE_STAGE01_RUNTIME || `/tmp/pbl6-mobile-stage${stage}-runtime.json`);
if (fs.existsSync(runtime)) {
  const previous = JSON.parse(fs.readFileSync(runtime, 'utf8'));
  if (previous.status === 'READY' && Number.isInteger(previous.pid)) {
    let running = false;
    try { process.kill(previous.pid, 0); running = true; } catch (error) { if (error.code !== 'ESRCH') throw error; }
    assert.ok(!running, 'This runtime is already serving; stop it or choose another MOBILE_STAGE01_RUNTIME');
  }
}
const manifest = { schemaVersion: 1, pid: process.pid, exchange, baseCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(), status: 'PREPARING', password, tenants: [], orders: {} };
function saveRuntime() { fs.writeFileSync(runtime, JSON.stringify(manifest, null, 2), { mode: 0o600 }); fs.chmodSync(runtime, 0o600); }
async function freePort() { const s = net.createServer(); await new Promise(resolve => s.listen(0, '127.0.0.1', resolve)); const p = s.address().port; await new Promise(resolve => s.close(resolve)); return p; }
async function start(name) {
  const { NestFactory } = req(name)('@nestjs/core');
  const app = await NestFactory.create(req(name)('./dist/app.module.js').AppModule, { logger: false });
  // This harness owns all app lifecycles. Individual Nest signal handlers
  // would kill the shared process before its queue/runtime cleanup finishes.
  Object.defineProperty(app, 'enableShutdownHooks', { value: () => app, configurable: true });
  if (name === 'gateway') req(name)('./dist/gateway.setup.js').configureGateway(app, app.get(req(name)('@nestjs/config').ConfigService));
  else configureApp(app);
  await app.listen(ports[name], '127.0.0.1'); apps[name] = app;
  if (name !== 'gateway') db[name] = app.get(req(name)('./dist/prisma/prisma.service.js').PrismaService);
}
async function call(method, route, token, body, expected = 200, key) {
  const response = await fetch(`http://127.0.0.1:${ports.gateway}${route}`, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}), ...(key ? { 'Idempotency-Key': key } : route === '/api/assets/equipment-registrations' ? { 'Idempotency-Key': randomUUID() } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(15000) });
  const data = await response.json().catch(() => null);
  assert.equal(response.status, expected, `${method} ${route}: ${response.status} ${data?.code || ''}`);
  return data;
}
async function eventually(check) { for (let i = 0; i < 100; i++) { if (await check()) return; await new Promise(resolve => setTimeout(resolve, 100)); } throw Error('Fixture event did not settle'); }
async function user(tenantId, code, role, label, customerId) {
  const email = `${label}-${suffix}@mobile-stage01.test`;
  const row = await db.identity.user.create({ data: { tenantId, email, userType: role.startsWith('CUSTOMER') ? 'CUSTOMER' : 'TENANT_STAFF', fullName: label, status: 'ACTIVE', passwordHash: await req('identity')('bcryptjs').hash(password, 4), roles: { create: { role: { connect: { code: role } } } } } });
  if (customerId) {
    const membershipId = randomUUID();
    await db.organization.customerUserMembership.create({ data: { id: membershipId, tenantId, customerId, userId: row.id } });
    await db.identity.userCustomerLink.create({ data: { userId: row.id, tenantId, customerId, membershipId, status: 'ACTIVE', sourceChangedAt: new Date() } });
  }
  const token = (await call('POST', '/api/identity/auth/login', null, { tenantCode: code, email, password })).accessToken;
  return { id: row.id, email, token };
}
function subscribe(label, events, handler) { const queue = exchange + '.' + label; queues.push(queue); bus.subscribe({ queue, events, handler }); }
function relay(name) {
  const scoped = { $transaction: (fn, options) => db[name].$transaction(tx => fn(new Proxy(tx, { get(target, key) {
    if (key !== '$queryRawUnsafe') return Reflect.get(target, key);
    return (sql, ...args) => {
      const predicate = "WHERE status = 'PENDING' AND available_at <= now()";
      assert.ok(sql.includes(predicate), 'Outbox contract changed; refusing to relay outside fixture tenants');
      return target.$queryRawUnsafe(sql.replace(predicate, predicate + ' AND tenant_id = ANY($2::uuid[])'), ...args, tenants);
    };
  } })), options) };
  const instance = new OutboxRelay({ db: scoped, publisher: bus, producer: name + '-service', intervalMs: 100 }); instance.start(); relays.push(instance);
}
async function main() {
  for (const name of names) execFileSync('pnpm', ['--filter', name + '-service', 'db:migrate'], { cwd: root, env: process.env, stdio: 'inherit' });
  for (const name of [...names, 'gateway']) ports[name] = await freePort();
  for (const name of [...names, 'gateway']) process.env[name === 'gateway' ? 'GATEWAY_SERVICE_URL' : name.replaceAll('-', '_').toUpperCase() + '_SERVICE_URL'] = `http://127.0.0.1:${ports[name]}`;
  process.env.IDENTITY_PORT = String(ports.identity);
  for (const name of [...names, 'gateway']) await start(name);
  bus = new RabbitMqEventBus({ url: broker, exchange });
  const woConsumer = apps.workorder.get(req('workorder')('./dist/events/maintenance-events.consumer.js').MaintenanceEventsConsumer);
  const maintConsumer = apps.maintenance.get(req('maintenance')('./dist/events/work-order-events.consumer.js').WorkOrderEventsConsumer);
  const srConsumer = apps['service-request'].get(req('service-request')('./dist/events/work-order-events.consumer.js').WorkOrderEventsConsumer);
  subscribe('maintenance-due', [Events.MaintenanceTaskDueV2, Events.MaintenanceWorkOrderReplacementRequestedV2], e => woConsumer.handle(e));
  subscribe('maintenance-results', [Events.WorkOrderCreated, Events.WorkOrderCompletedV2, Events.WorkOrderCancelledV2], e => maintConsumer.handle(e));
  subscribe('request-results', [Events.WorkOrderCreated, Events.WorkOrderCompletedV2, Events.WorkOrderCancelledV2], e => srConsumer.handle(e));
  if (withNotifications) {
    const { NotificationEventsService, NOTIFICATION_BUSINESS_EVENTS } = req('notification')('./dist/events/notification-events.service.js');
    const { RecipientProjectionService } = req('notification')('./dist/events/recipient-projection.service.js');
    const processor = apps.notification.get(NotificationEventsService), recipients = apps.notification.get(RecipientProjectionService);
    subscribe('notification-business', NOTIFICATION_BUSINESS_EVENTS, e => processor.handle(e));
    subscribe('notification-recipients', [Events.NotificationRecipientSnapshot], e => recipients.applySnapshot(e));
    subscribe('notification-bootstrap', [Events.NotificationRecipientBootstrapCompleted], e => recipients.applyBootstrapCompleted(e));
  }
  await bus.start(); for (const name of ['maintenance', 'workorder', 'service-request', ...(withNotifications ? ['identity', 'asset'] : [])]) relay(name);
  const A = '/api/assets', W = '/api/workorders', S = '/api';
  const fixtures = [];
  for (const [index, tenantId] of tenants.entries()) {
    const code = `M01-${index ? 'B' : 'A'}-${suffix.toUpperCase()}`;
    await db.organization.tenant.create({ data: { id: tenantId, code, name: code, status: 'ACTIVE' } });
    await db.identity.tenantDirectory.create({ data: { tenantId, code, status: 'ACTIVE' } });
    const admin = await user(tenantId, code, 'TENANT_ADMIN', 'admin-' + index);
    const manager = await user(tenantId, code, 'SERVICE_MANAGER', 'manager-' + index);
    const tech = await user(tenantId, code, 'TECHNICIAN', 'technician-' + index);
    const branch = await call('POST', '/api/organization/branches', admin.token, { code: 'MAIN', name: 'Main branch', address: 'Test fixture' }, 201);
    const technician = await call('POST', W + '/technicians', manager.token, { userId: tech.id, branchId: branch.id, employeeCode: 'TECH-01' }, 201);
    const customer = await call('POST', '/api/organization/customers', manager.token, { code: 'CUSTOMER', name: 'Customer ' + index }, 201);
    const site = await call('POST', `/api/organization/customers/${customer.id}/sites`, manager.token, { code: 'SITE', name: 'Fixture site', address: 'Test address' }, 201);
    const customerUser = await user(tenantId, code, 'CUSTOMER_ADMIN', 'customer-' + index, customer.id);
    const model = await call('POST', A + '/equipment-models', manager.token, { manufacturer: 'Mobile fixture', modelCode: 'M01', name: 'Fixture pump' }, 201);
    const equipment = await call('POST', A + '/equipment', manager.token, { modelId: model.id, customerId: customer.id, customerSiteId: site.id, assetCode: 'EQ-01', serialNumber: randomUUID() }, 201);
    await call('POST', A + `/equipment/${equipment.id}/warranties`, manager.token, { warrantyType: 'STANDARD', startDate: '2020-01-01', endDate: '2099-12-31', terms: 'Fixture coverage' }, 201);
    fixtures.push({ tenantId, code, admin, manager, tech, technician, branch, customer, customerUser, site, model, equipment });
    manifest.tenants.push({ id: tenantId, code, admin: admin.email, manager: manager.email, technician: tech.email, customer: customerUser.email, equipmentId: equipment.id });
  }
  const a = fixtures[0], b = fixtures[1];
  const extraCustomer = await call('POST', '/api/organization/customers', a.manager.token, { code: 'CUSTOMER-OTHER', name: 'Other customer A' }, 201);
  const outsider = await user(a.tenantId, a.code, 'CUSTOMER_ADMIN', 'other-customer', extraCustomer.id);
  const second = await user(a.tenantId, a.code, 'TECHNICIAN', 'technician-alternate');
  const secondTech = await call('POST', W + '/technicians', a.manager.token, { userId: second.id, branchId: (await call('GET', '/api/organization/branches?page=1&pageSize=1', a.manager.token)).items[0].id, employeeCode: 'TECH-02' }, 201);
  manifest.tenants[0].alternateTechnician = second.email;
  manifest.tenants[0].otherCustomer = outsider.email;
  if (withParts) {
    a.inventoryUser = await user(a.tenantId, a.code, 'INVENTORY_STAFF', 'inventory');
    manifest.tenants[0].inventory = a.inventoryUser.email;
  }
  if (withNotifications) {
    for (const tenantId of tenants) execFileSync('pnpm', ['--filter', 'identity-service', 'recipient:bootstrap', tenantId], { cwd: root, env: process.env, stdio: 'inherit' });
    await eventually(async () => (await db.notification.recipientBootstrapRun.count({ where: { tenantId: { in: tenants }, status: 'COMPLETED' } })) === 2);
  }
  async function order(f, label, actions = [], technician = f.technician) {
    const sr = await call('POST', S + '/service-requests', f.customerUser.token, { equipmentId: f.equipment.id, type: 'REPAIR', priority: 'NORMAL', title: 'M01 ' + label, description: 'Mobile phase 0/1 acceptance' }, 201);
    for (const action of ['review', 'accept']) await call('POST', S + `/service-requests/${sr.id}/${action}`, f.manager.token, {});
    const wo = await call('POST', W + '/work-orders', f.manager.token, { serviceRequestId: sr.id }, 201);
    await call('POST', W + `/work-orders/${wo.id}/assign`, f.manager.token, { technicianId: technician.id });
    for (const action of actions) await call('POST', W + `/work-orders/${wo.id}/${action}`, f.tech.token,
      action === 'hold' ? { reason: 'Waiting for inspection' } : action === 'complete' ? { problemDescription: 'Fixture problem', solution: 'Fixture solution', result: 'RESOLVED', customerSummary: 'Fixture completed' } : {});
    return wo;
  }
  for (const [label, actions] of [['assigned', []], ['inProgress', ['accept', 'start']], ['onHold', ['accept', 'start', 'hold']], ['completed', ['accept', 'start', 'complete']], ['cancelled', []], ['reassigned', []], ['reject', []]]) {
    const wo = await order(a, label, actions); manifest.orders[label] = { id: wo.id, number: wo.workOrderNo };
    if (label === 'cancelled') await call('POST', W + `/work-orders/${wo.id}/cancel`, a.manager.token, { reason: 'Cancelled fixture' });
    if (label === 'reassigned') await call('POST', W + `/work-orders/${wo.id}/assign`, a.manager.token, { technicianId: secondTech.id });
  }
  const hidden = await order(a, 'hidden', [], secondTech); manifest.orders.hidden = { id: hidden.id, number: hidden.workOrderNo };
  const other = await order(b, 'otherTenant'); manifest.orders.otherTenant = { id: other.id, number: other.workOrderNo };
  // Real Model profile -> registration -> scheduler -> RabbitMQ -> checklist WO.
  const item = { id: randomUUID(), title: 'Inspect filter', action: 'INSPECT', instructions: 'Inspect and record evidence', required: true, allowNotApplicable: false };
  for (const [base, kind, body] of [[A, 'warranty-policies', { mode: 'NONE', name: 'No coverage', terms: '', reason: 'Fixture maintenance only', durationMonths: 12, coveredCauses: [], exclusions: [] }], ['/api/maintenance', 'maintenance-profiles', { mode: 'APPLY', name: 'Monthly programme', terms: 'Fixture agreement', reason: '', rules: [{ id: randomUUID(), name: 'Monthly inspection', frequencyUnit: 'MONTH', frequencyValue: 1, firstOccurrence: 1, checklist: [item] }] }]]) {
    const route = `${base}/equipment-models/${a.model.id}/${kind}`;
    const revision = await call('POST', route, a.manager.token, { body }, 201);
    await call('POST', route + `/${revision.id}/publish`, a.manager.token, { expectedVersion: revision.version }, 201);
  }
  const year = new Date().getUTCFullYear();
  const reg = await call('POST', A + '/equipment-registrations', a.manager.token, { equipment: { mode: 'NEW', data: { modelId: a.model.id, customerId: a.customer.id, customerSiteId: a.site.id, assetCode: 'EQ-CHECKLIST', serialNumber: randomUUID(), handoverDate: `${year}-01-01` } }, warranty: { mode: 'UNCONFIRMED' }, maintenance: { mode: 'UNCONFIRMED' } }, 201);
  const preview = await call('POST', A + `/equipment-registrations/${reg.id}/model-policies`, a.manager.token, { expectedVersion: reg.version }, 201);
  await call('POST', A + `/equipment-registrations/${reg.id}/submit`, a.manager.token, { expectedVersion: preview.version });
  const scheduler = apps.maintenance.get(req('maintenance')('./dist/scheduler/scheduler.service.js').SchedulerService);
  await scheduler.tick(`${year}-02-01`, a.tenantId);
  let maintenance;
  await eventually(async () => { maintenance = await db.workorder.workOrder.findFirst({ where: { tenantId: a.tenantId, equipmentId: reg.equipmentId, maintenanceTaskId: { not: null } } }); return !!maintenance; });
  await call('POST', W + `/work-orders/${maintenance.id}/assign`, a.manager.token, { technicianId: a.technician.id });
  for (const action of ['accept', 'start']) await call('POST', W + `/work-orders/${maintenance.id}/${action}`, a.tech.token, {});
  const checklist = await call('GET', W + `/work-orders/${maintenance.id}/checklist`, a.tech.token);
  assert.equal(checklist.items[0].id, item.id);
  manifest.orders.maintenance = { id: maintenance.id, number: maintenance.workOrderNo };
  if (withNotifications) {
    for (let i = 0; i < 14; i++) await order(a, 'pagination-' + i);
    await eventually(async () => (await call('GET', '/api/notifications/unread-count', a.tech.token)).unreadCount === 22);
    const inbox = await call('GET', '/api/notifications?page=1&pageSize=20&readStatus=UNREAD', a.tech.token);
    assert.equal(inbox.total, 22); assert.equal(inbox.items.length, 20);
    const next = await call('GET', '/api/notifications?page=2&pageSize=20&readStatus=UNREAD', a.tech.token);
    assert.equal(next.items.length, 2);
    assert.ok(next.items.every(n => !inbox.items.some(item => n.id === item.id)));
    const notice = [...inbox.items, ...next.items].find(n => n.resourceId === manifest.orders.completed.id);
    assert.ok(notice);
    await call('PATCH', `/api/notifications/${notice.id}/read`, b.tech.token, undefined, 404);
    await call('PATCH', `/api/notifications/${notice.id}/read`, second.token, undefined, 404);
    const read = await call('PATCH', `/api/notifications/${notice.id}/read`, a.tech.token);
    const again = await call('PATCH', `/api/notifications/${notice.id}/read`, a.tech.token);
    assert.equal(read.readAt, again.readAt);
    assert.equal((await call('GET', '/api/notifications/unread-count', a.tech.token)).unreadCount, 21);
    assert.equal((await call('GET', '/api/notifications?readStatus=READ', a.tech.token)).total, 1);
    await call('GET', `/api/notifications?tenantId=${b.tenantId}`, a.tech.token, undefined, 400);
    manifest.notifications = { unreadCount: 21, total: 22, pagination: true, ownReadIdempotent: true, sameTenantOtherUser404: true, crossTenant404: true, identityBootstrap: 'COMPLETED' };
    console.log('PASS Notification: real Identity bootstrap/outbox/broker fan-out; 22 rows, pagination, filters, idempotent mark-read, exact count, same-tenant user and cross-tenant isolation.');
  }
  if (withParts) {
    const I = '/api/inventory', token = a.inventoryUser.token;
    const mutate = (route, body, expected = 201, actor = token) => call('POST', I + route, actor, body, expected, randomUUID());
    const warehouse = await mutate('/warehouses', { branchId: a.branch.id, code: 'MAIN', name: 'Kho luc cap' });
    const fluid = await mutate('/parts', { sku: 'OIL-M03', name: 'Dau bao tri luc cap', unit: 'l', allowFractional: true });
    const gasket = await mutate('/parts', { sku: 'SEAL-M03', name: 'Vong dem luc cap', unit: 'cai' });
    for (const part of [fluid, gasket]) await mutate('/stock-transactions/receive', { warehouseId: warehouse.id, partId: part.id, quantity: '20.00', documentReference: 'M03-RECEIPT' });
    const issue = (orderId, part, quantity) => mutate(`/work-orders/${orderId}/parts`, { warehouseId: warehouse.id, partId: part.id, quantity, note: 'M03 fixture issue', unitCost: '123.45', unitCostCurrency: 'USD' });
    const running = manifest.orders.inProgress;
    const usage = await issue(running.id, fluid, '5.50');
    await mutate(`/work-order-parts/${usage.id}/return`, { quantity: '1.25', note: 'Unused', condition: 'GOOD' }, 200);
    await mutate(`/work-order-parts/${usage.id}/return`, { quantity: '0.50', note: 'Damaged', condition: 'DAMAGED' }, 200);
    const legacy = await issue(running.id, gasket, '2.00');
    // Only simulate missing pre-snapshot metadata in the owning TEST DB. Quantities
    // and every business operation above/below still come from real Gateway APIs.
    const { Prisma } = req('inventory')('./dist/generated/prisma/client.js');
    await db.inventory.workOrderPart.update({ where: { id: legacy.id }, data: { partSnapshot: Prisma.DbNull, warehouseSnapshot: Prisma.DbNull } });
    const completed = await order(a, 'partsCompleted', ['accept', 'start']);
    manifest.orders.partsCompleted = { id: completed.id, number: completed.workOrderNo };
    const used = await issue(completed.id, fluid, '3.50');
    await call('POST', W + `/work-orders/${completed.id}/complete`, a.tech.token, { problemDescription: 'Inspection', solution: 'Serviced equipment', result: 'RESOLVED', customerSummary: 'Service complete' });
    const report = await call('GET', W + `/work-orders/${completed.id}/service-report`, a.tech.token);
    const confirm = quantity => mutate(`/work-order-parts/${used.id}/confirm-use`, { quantity, serviceReportId: report.id, customerReason: 'Maintenance replacement', removedPartDisposition: 'NOT_APPLICABLE' }, 201, a.tech.token);
    await confirm('1.50'); const corrected = await confirm('0.25');
    await mutate(`/usage-confirmations/${corrected.id}/reverse`, { note: 'Correct mistaken confirmation' });
    await mutate(`/work-order-parts/${used.id}/return`, { quantity: '0.50', note: 'Unused remainder', condition: 'GOOD' }, 200);
    const cancelled = await order(a, 'partsCancelled');
    manifest.orders.partsCancelled = { id: cancelled.id, number: cancelled.workOrderNo };
    const unused = await issue(cancelled.id, gasket, '2.00');
    await call('POST', W + `/work-orders/${cancelled.id}/cancel`, a.manager.token, { reason: 'Cancelled fixture' });
    await mutate(`/work-order-parts/${unused.id}/return`, { quantity: '1.00', note: 'Inspect after cancellation', condition: 'PENDING_INSPECTION' }, 200);
    await call('PATCH', I + `/parts/${fluid.id}`, token, { name: 'Dau hien tai da doi ten', status: 'INACTIVE' });
    await call('PATCH', I + `/warehouses/${warehouse.id}`, token, { name: 'Kho hien tai da doi ten', status: 'INACTIVE' });
    const runningRows = await call('GET', I + `/work-orders/${running.id}/parts`, a.tech.token);
    assert.equal(runningRows.length, 2);
    const oil = runningRows.find(row => row.id === usage.id);
    assert.equal(oil.quantityIssued, '5.50'); assert.equal(oil.quantityReturned, '1.75'); assert.equal(oil.quantityConfirmedUsed, '0.00'); assert.equal(oil.quantityUnreconciled, '3.75');
    assert.equal(oil.partSnapshot.name, 'Dau bao tri luc cap'); assert.equal(oil.warehouseSnapshot.name, 'Kho luc cap'); assert.equal(oil.returns.length, 2);
    const history = (await call('GET', I + `/work-orders/${completed.id}/parts`, a.tech.token))[0];
    assert.equal(history.quantityOutstanding, '3.00'); assert.equal(history.quantityConfirmedUsed, '1.50'); assert.equal(history.quantityUnreconciled, '1.50'); assert.equal(history.confirmations.length, 3);
    assert.equal((await call('GET', I + `/work-orders/${manifest.orders.assigned.id}/parts`, a.tech.token)).length, 0);
    await call('GET', I + `/work-orders/${running.id}/parts`, b.tech.token, undefined, 404);
    await call('GET', I + `/work-orders/${running.id}/parts`, second.token, undefined, 404);
    await call('GET', I + `/work-orders/${running.id}/parts`, a.customerUser.token, undefined, 403);
    await call('POST', I + `/work-orders/${running.id}/parts`, a.tech.token, {}, 403, randomUUID());
    await call('POST', I + `/work-order-parts/${usage.id}/return`, a.tech.token, {}, 403, randomUUID());
    manifest.parts = { runningUsageId: usage.id, completedUsageId: used.id, legacyUsageId: legacy.id, cancelledUsageId: unused.id,
      realIssueReturn: true, realConfirmationReversal: true, historicalSnapshotsAfterRename: true, emptyOrder: true,
      sameTenantUnassigned404: true, crossTenant404: true, customer403: true, technicianIssueReturn403: true };
    console.log('PASS Parts: real ISSUE/RETURN/reservation, completed confirmation/reversal, cancelled reconciliation, immutable labels, legacy metadata, empty state and scope/mutation guards.');
  }
  await call('GET', A + `/equipment/${a.equipment.id}`, b.tech.token, undefined, 404);
  await call('GET', A + `/equipment/${a.equipment.id}`, outsider.token, undefined, 404);
  await call('GET', W + `/work-orders/${hidden.id}`, a.tech.token, undefined, 404);
  for (const name of [...names, 'gateway']) assert.equal((await fetch(`http://127.0.0.1:${ports[name]}/health`)).status, 200);
  manifest.gateway = `http://127.0.0.1:${ports.gateway}`; manifest.status = 'READY'; saveRuntime();
  console.log('PASS: two tenants, same-tenant customer isolation, alternate Technician, 10 WO fixtures, real maintenance checklist and Gateway health.');
  console.log('Private fixture manifest (password is never printed): ' + runtime);
  if (process.argv.includes('--serve')) await new Promise(resolve => { process.once('SIGINT', resolve); process.once('SIGTERM', resolve); });
}
main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(async () => {
  for (const relay of relays) await relay.stop().catch(() => {});
  if (bus) await bus.close().catch(() => {});
  for (const app of Object.values(apps).reverse()) await app.close().catch(() => {});
  if (bus) {
    const eventRequire = createRequire(path.join(root, 'packages/event-contracts/package.json'));
    const connection = await eventRequire('amqplib').connect(broker); const channel = await connection.createChannel();
    for (const queue of queues) for (const name of Object.values(subscriptionQueues(queue))) await channel.deleteQueue(name);
    await channel.deleteExchange(exchange); await connection.close();
  }
  manifest.status = process.exitCode ? 'FAILED' : 'STOPPED'; saveRuntime();
});

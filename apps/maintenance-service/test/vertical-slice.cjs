// Real Asset + Maintenance + Work Order APIs, PostgreSQL, RabbitMQ and Gateway.
// Test JWTs and local service-owned fixtures replace Identity/Organization setup.
// Work Order's implementation is loaded unchanged. No dev database is touched.
const assert = require('node:assert/strict');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { createRequire } = require('node:module');
const { execSync, execFile } = require('node:child_process');
const { promisify } = require('node:util');
require('dotenv').config({ path: '../../.env', quiet: true });
const {
  requireTestDatabaseUrl,
  signTestAccessToken,
  testJwtEnv,
} = require('@pbl6/testing');
const { configureApp } = require('@pbl6/service-kit');
const {
  RabbitMqEventBus,
  OutboxRelay,
  Events,
  subscriptionQueues,
} = require('@pbl6/event-contracts');
const { Test } = require('@nestjs/testing');
const { Logger } = require('@nestjs/common');
const root = path.resolve(__dirname, '../../..');
const req = (service) =>
  createRequire(path.join(root, 'apps', service, 'package.json'));
const assetRequire = req('asset-service'),
  woRequire = req('workorder-service'),
  gatewayRequire = req('api-gateway');
const brokerUrl = process.env.RABBITMQ_TEST_URL || process.env.RABBITMQ_URL;
assert.ok(brokerUrl, 'RABBITMQ_TEST_URL or RABBITMQ_URL is required');
const urls = Object.fromEntries(
  ['ASSET', 'MAINTENANCE', 'WORKORDER'].map((key) => [
    key,
    requireTestDatabaseUrl(key + '_TEST_DATABASE_URL'),
  ]),
);
Object.assign(process.env, testJwtEnv(), {
  NODE_ENV: 'test',
  RABBITMQ_URL: '',
  MAINTENANCE_SCHEDULER_ENABLED: 'false',
  ASSET_DATABASE_URL: urls.ASSET,
  MAINTENANCE_DATABASE_URL: urls.MAINTENANCE,
  WORKORDER_DATABASE_URL: urls.WORKORDER,
  IDENTITY_SERVICE_URL: 'http://unused.test',
  ORGANIZATION_SERVICE_URL: 'http://unused.test',
  ASSET_SERVICE_URL: 'http://unused.test',
  SERVICE_REQUEST_SERVICE_URL: 'http://unused.test',
  WORKORDER_SERVICE_URL: 'http://unused.test',
  MAINTENANCE_SERVICE_URL: 'http://unused.test',
  NOTIFICATION_SERVICE_URL: 'http://unused.test',
  INVENTORY_SERVICE_URL: 'http://unused.test',
  ASSET_QR_PORTAL_BASE_URL: 'http://portal.test',
});
const tenantId = randomUUID(),
  customerId = randomUUID(),
  equipmentId = randomUUID(),
  siteId = randomUUID(),
  userId = randomUUID();
const manager = signTestAccessToken({ role: 'SERVICE_MANAGER', tenantId });
const technician = signTestAccessToken({
  role: 'TECHNICIAN',
  tenantId,
  userId,
});
const apps = [],
  queues = [],
  ids = new Set();
const exchange = 'pbl6.test.maintenance.' + randomUUID();
let assetDb, maintenanceDb, woDb, bus;
async function application(AppModule, override) {
  let builder = Test.createTestingModule({ imports: [AppModule] });
  if (override)
    builder = builder.overrideProvider(override.token).useValue(override.value);
  const module = await builder.compile();
  const app = module.createNestApplication({ logger: false });
  configureApp(app, { logger: new Logger('maintenance-integration') });
  await app.listen(0, '127.0.0.1');
  apps.push(app);
  return app;
}
function scopedRelay(db, producer) {
  const scoped = {
    $transaction: (fn, options) =>
      db.$transaction(
        (tx) =>
          fn(
            new Proxy(tx, {
              get(target, key) {
                if (key !== '$queryRawUnsafe') return Reflect.get(target, key);
                return (sql, ...values) =>
                  target.$queryRawUnsafe(
                    sql.replace(
                      "WHERE status = 'PENDING' AND available_at <= now()",
                      "WHERE status = 'PENDING' AND available_at <= now() AND tenant_id = $2::uuid",
                    ),
                    ...values,
                    tenantId,
                  );
              },
            }),
          ),
        options,
      ),
  };
  return new OutboxRelay({ db: scoped, publisher: bus, producer });
}
async function call(base, method, route, token = manager, body, status = 200) {
  const response = await fetch(base + route, {
    method,
    headers: {
      authorization: 'Bearer ' + token,
      'content-type': 'application/json',
      'x-correlation-id': 'minh-m2-vertical-slice',
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(10000),
  });
  const data = await response.json();
  assert.equal(
    response.status,
    status,
    `${method} ${route}: ${response.status} ${data.code ?? ''}`,
  );
  return data;
}
async function wait(read, predicate, label, relays) {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    for (const relay of relays) await relay.runOnce();
    const value = await read();
    if (predicate(value)) return value;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Timed out waiting for ' + label);
}
async function main() {
  for (const [key, service] of [
    ['ASSET', 'asset-service'],
    ['MAINTENANCE', 'maintenance-service'],
    ['WORKORDER', 'workorder-service'],
  ])
    execSync('pnpm exec prisma migrate deploy', {
      cwd: path.join(root, 'apps', service),
      env: { ...process.env, [key + '_DATABASE_URL']: urls[key] },
      stdio: 'inherit',
    });
  const { ORGANIZATION_CLIENT } = assetRequire(
    './dist/organization/organization-client',
  );
  const assetApp = await application(
    assetRequire('./dist/app.module').AppModule,
    {
      token: ORGANIZATION_CLIENT,
      value: {
        getCustomer: async (id) => ({ id, status: 'ACTIVE' }),
        getSite: async (customer, site, location) => ({
          customerId: customer,
          siteId: site,
          locationId: location ?? null,
          siteStatus: 'ACTIVE',
        }),
      },
    },
  );
  process.env.ASSET_SERVICE_URL = await assetApp.getUrl();
  assetDb = assetApp.get(
    assetRequire('./dist/prisma/prisma.service').PrismaService,
  );
  const maintenanceApp = await application(
    require('../dist/app.module').AppModule,
  );
  maintenanceDb = maintenanceApp.get(
    require('../dist/prisma/prisma.service').PrismaService,
  );
  process.env.MAINTENANCE_SERVICE_URL = await maintenanceApp.getUrl();
  const workorderApp = await application(
    woRequire('./dist/app.module').AppModule,
  );
  woDb = workorderApp.get(
    woRequire('./dist/prisma/prisma.service').PrismaService,
  );
  process.env.WORKORDER_SERVICE_URL = await workorderApp.getUrl();
  const assetConfig = assetApp.get(
    assetRequire('@nestjs/config').ConfigService,
  );
  assetConfig.set('MAINTENANCE_SERVICE_URL', await maintenanceApp.getUrl());
  assetConfig.set('WORKORDER_SERVICE_URL', await workorderApp.getUrl());
  const gatewayModule = await Test.createTestingModule({
    imports: [gatewayRequire('./dist/app.module').AppModule],
  }).compile();
  const gateway = gatewayModule.createNestApplication({ logger: false });
  gatewayRequire('./dist/gateway.setup').configureGateway(
    gateway,
    gateway.get(gatewayRequire('@nestjs/config').ConfigService),
  );
  await gateway.listen(0, '127.0.0.1');
  apps.push(gateway);
  const base = await gateway.getUrl();
  const model = await assetDb.equipmentModel.create({
    data: {
      tenantId,
      manufacturer: 'M2 integration',
      modelCode: 'M2',
      name: 'Pump',
    },
  });
  await assetDb.equipment.create({
    data: {
      id: equipmentId,
      tenantId,
      modelId: model.id,
      customerId,
      customerSiteId: siteId,
      assetCode: 'M2-DEMO',
      serialNumber: randomUUID(),
    },
  });
  const tech = await woDb.technician.create({
    data: { tenantId, userId, branchId: randomUUID(), employeeCode: 'M2-TECH' },
  });
  bus = new RabbitMqEventBus({ url: brokerUrl, exchange });
  const subscribe = (name, events, handler) => {
    const queue = 'pbl6.test.' + name + '.' + randomUUID();
    queues.push(queue);
    bus.subscribe({
      queue,
      events,
      handler: async (e) => {
        ids.add(e.eventId);
        await handler(e);
      },
      retryDelayMs: 50,
    });
  };
  subscribe('equipment', [Events.EquipmentMoved], (e) =>
    maintenanceApp
      .get(
        require('../dist/events/equipment-events.consumer')
          .EquipmentEventsConsumer,
      )
      .handle(e),
  );
  subscribe('task', [Events.MaintenanceTaskDue], (e) =>
    workorderApp
      .get(
        woRequire('./dist/events/maintenance-events.consumer')
          .MaintenanceEventsConsumer,
      )
      .handle(e),
  );
  subscribe(
    'workorder',
    [
      Events.WorkOrderCreated,
      Events.WorkOrderCompletedV2,
      Events.WorkOrderCancelledV2,
    ],
    (e) =>
      maintenanceApp
        .get(
          require('../dist/events/work-order-events.consumer')
            .WorkOrderEventsConsumer,
        )
        .handle(e),
  );
  subscribe(
    'history',
    [Events.ServiceRequestStatusChanged, Events.WorkOrderCompletedV2],
    (e) =>
      assetApp
        .get(assetRequire('./dist/events/history.consumer').HistoryConsumer)
        .handle(e),
  );
  await bus.start();
  await bus.waitUntilConnected();
  const relays = [
    scopedRelay(assetDb, 'asset-service'),
    scopedRelay(maintenanceDb, 'maintenance-service'),
    scopedRelay(woDb, 'workorder-service'),
  ];
  const plan = await call(
    base,
    'POST',
    '/api/maintenance/maintenance-plans',
    manager,
    {
      equipmentId,
      name: 'M2 real producer inspection',
      frequencyUnit: 'MONTH',
      frequencyValue: 1,
      nextDueDate: '2026-01-31',
    },
    201,
  );
  const movedSite = randomUUID();
  await call(base, 'PATCH', '/api/assets/equipment/' + equipmentId, manager, {
    customerSiteId: movedSite,
  });
  await wait(
    () => call(base, 'GET', '/api/maintenance/maintenance-plans/' + plan.id),
    (p) => p.customerSiteId === movedSite,
    'EquipmentMoved snapshot',
    relays,
  );
  const scheduler = maintenanceApp.get(
    require('../dist/scheduler/scheduler.service').SchedulerService,
  );
  assert.equal(await scheduler.tick('2026-02-28', tenantId), 1);
  assert.equal(await scheduler.tick('2026-02-28', tenantId), 0);
  const task = await wait(
    () =>
      call(base, 'GET', '/api/maintenance/maintenance-tasks?planId=' + plan.id),
    (page) => page.items[0]?.status === 'WORK_ORDER_CREATED',
    'TaskDue → real WO Created',
    relays,
  );
  const first = task.items[0];
  const workOrder = await call(
    base,
    'GET',
    '/api/workorders/work-orders/' + first.workOrderId,
  );
  assert.equal(workOrder.maintenanceTaskId, first.id);
  await call(
    base,
    'POST',
    `/api/workorders/work-orders/${first.workOrderId}/assign`,
    manager,
    { technicianId: tech.id },
  );
  for (const action of ['accept', 'start'])
    await call(
      base,
      'POST',
      `/api/workorders/work-orders/${first.workOrderId}/${action}`,
      technician,
      {},
    );
  await call(
    base,
    'POST',
    `/api/workorders/work-orders/${first.workOrderId}/complete`,
    technician,
    {
      problemDescription: 'Scheduled inspection',
      rootCause: 'Routine wear',
      solution: 'Adjusted and tested',
      result: 'RESOLVED',
      customerSummary: 'Equipment ready',
    },
  );
  await wait(
    () => call(base, 'GET', '/api/maintenance/maintenance-tasks/' + first.id),
    (t) => t.status === 'COMPLETED',
    'real WO complete → Task',
    relays,
  );
  const history = await wait(
    () =>
      call(base, 'GET', '/api/assets/equipment/' + equipmentId + '/history'),
    (page) => page.items.some((h) => h.eventType === 'WORK_ORDER_COMPLETED'),
    'real WO complete → Asset history',
    relays,
  );
  assert.equal(
    history.items.filter((h) => h.eventType === 'WORK_ORDER_COMPLETED').length,
    1,
  );
  const dossier = await call(
    base,
    'GET',
    `/api/assets/equipment/${equipmentId}/dossier`,
  );
  assert.equal(dossier.workOrders.status, 'AVAILABLE');
  assert.equal(dossier.workOrders.data.total, 1);
  assert.equal(dossier.maintenance.status, 'AVAILABLE');
  assert.equal(dossier.maintenance.data.taskCounts.COMPLETED, 1);
  assert.equal(dossier.latestRecordedService.entry.metadata.result, 'RESOLVED');
  assert.equal(dossier.equipment.operationalStatus, 'UNKNOWN');
  const orderDossier = await call(
    base,
    'GET',
    `/api/assets/equipment/${equipmentId}/work-orders/${first.workOrderId}`,
  );
  assert.equal(orderDossier.status, 'AVAILABLE');
  assert.equal(orderDossier.data.report.status, 'AVAILABLE');
  const customer = signTestAccessToken({
    role: 'CUSTOMER_USER',
    tenantId,
    customerId,
  });
  const customerDossier = await call(
    base,
    'GET',
    `/api/assets/equipment/${equipmentId}/dossier`,
    customer,
  );
  assert.equal(customerDossier.workOrders.status, 'RESTRICTED');
  assert.equal(
    customerDossier.latestRecordedService.entry.metadata.customerSummary,
    'Equipment ready',
  );
  console.log(
    'PASS real dossier → Work Order report/assignment/history + Maintenance summary; customer restrictions + published result; completion preserves UNKNOWN equipment condition',
  );
  console.log(
    'PASS real Asset move → snapshot → scheduler → TaskDue → Work Order → assign/accept/start/complete → Task + Asset history via Gateway/RabbitMQ',
  );
  assert.equal(await scheduler.tick('2026-03-31', tenantId), 1);
  const next = await wait(
    () =>
      call(base, 'GET', '/api/maintenance/maintenance-tasks?planId=' + plan.id),
    (page) => page.items.some((t) => t.status === 'WORK_ORDER_CREATED'),
    'next task initial WO',
    relays,
  );
  const cancelledTask = next.items.find(
    (t) => t.status === 'WORK_ORDER_CREATED',
  );
  await call(
    base,
    'POST',
    `/api/workorders/work-orders/${cancelledTask.workOrderId}/cancel`,
    manager,
    { reason: 'Customer unavailable' },
  );
  await wait(
    () =>
      call(
        base,
        'GET',
        '/api/maintenance/maintenance-tasks/' + cancelledTask.id,
      ),
    (t) => t.status === 'PENDING',
    'real WO cancellation → Task PENDING',
    relays,
  );
  const requestId = randomUUID();
  const replacement = await call(
    base,
    'POST',
    `/api/maintenance/maintenance-tasks/${cancelledTask.id}/replacement`,
    manager,
    { requestId },
    201,
  );
  const replay = await call(
    base,
    'POST',
    `/api/maintenance/maintenance-tasks/${cancelledTask.id}/replacement`,
    manager,
    { requestId },
    201,
  );
  assert.equal(
    replay.replacementWorkOrderId,
    replacement.replacementWorkOrderId,
  );
  console.log(
    'PASS real WO cancellation → Task PENDING → durable idempotent replacement request; replacement WO producer is the Khuong handoff',
  );
  for (let i = 0; i < 2; i++) {
    // Asset runs in this process: do not block its HTTP event loop while the
    // separate seed process validates the real Asset reference.
    const output = await promisify(execFile)(
      process.execPath,
      ['scripts/seed-dev.cjs'],
      {
        cwd: path.join(root, 'apps/maintenance-service'),
        env: {
          ...process.env,
          MAINTENANCE_SEED_ACCESS_TOKEN: manager,
          MAINTENANCE_SEED_EQUIPMENT_ID: equipmentId,
        },
      },
    );
    process.stdout.write(output.stdout);
  }
  assert.equal(
    await maintenanceDb.maintenancePlan.count({
      where: { tenantId, id: '00000000-0000-4000-8000-000000003001' },
    }),
    1,
  );
  console.log('PASS demo seed twice without duplicating/resetting the Plan');
}
async function cleanup() {
  await bus?.close();
  const inboxWhere = { eventId: { in: [...ids] } };
  if (maintenanceDb) {
    const where = { tenantId };
    await maintenanceDb.maintenanceReplacementRequest.deleteMany({ where });
    await maintenanceDb.maintenanceWorkOrderLink.deleteMany({ where });
    await maintenanceDb.maintenanceTask.deleteMany({ where });
    await maintenanceDb.maintenanceHistory.deleteMany({ where });
    await maintenanceDb.maintenancePlan.deleteMany({ where });
    await maintenanceDb.equipmentSnapshot.deleteMany({ where });
    await maintenanceDb.outboxEvent.deleteMany({ where });
    await maintenanceDb.processedEvent.deleteMany({ where: inboxWhere });
  }
  if (woDb) {
    const where = { tenantId };
    for (const name of [
      'serviceReport',
      'workLog',
      'workOrderAssignment',
      'workOrderStatusHistory',
      'workOrder',
      'technician',
      'documentSequence',
      'outboxEvent',
    ])
      await woDb[name].deleteMany({ where });
    await woDb.processedEvent.deleteMany({ where: inboxWhere });
  }
  if (assetDb) {
    const where = { tenantId };
    for (const name of [
      'equipmentHistory',
      'equipment',
      'equipmentModel',
      'outboxEvent',
    ])
      await assetDb[name].deleteMany({ where });
    await assetDb.processedEvent.deleteMany({ where: inboxWhere });
  }
  for (const app of apps.reverse()) await app.close();
  if (queues.length) {
    const { connect } = createRequire(require.resolve('@pbl6/event-contracts'))(
      'amqplib',
    );
    const connection = await connect(brokerUrl),
      channel = await connection.createChannel();
    for (const queue of queues)
      for (const name of Object.values(subscriptionQueues(queue)))
        await channel.deleteQueue(name);
    await channel.deleteExchange(exchange);
    await channel.close();
    await connection.close();
  }
}
main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(cleanup)
  .catch((error) => {
    console.error('Cleanup:', error);
    process.exitCode = 1;
  });

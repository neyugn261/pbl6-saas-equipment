/* Dedicated test DBs only. Real Identity login, Gateway, service APIs and RabbitMQ.
   Fixture writes use each owning service's Prisma client; no runtime cross-DB access. */
const assert = require("node:assert/strict");
const path = require("node:path");
const { createRequire } = require("node:module");
const { randomUUID } = require("node:crypto");
const { execFileSync } = require("node:child_process");
const net = require("node:net");
const root = path.resolve(__dirname, "..");
const req = (name) =>
  createRequire(path.join(root, "apps", name + "-service", "package.json"));
const assetReq = req("asset"),
  identityReq = req("identity");
assetReq("dotenv").config({ path: path.join(root, ".env"), quiet: true });
const { requireTestDatabaseUrl, testJwtEnv } = assetReq("@pbl6/testing");
const { RabbitMqEventBus, OutboxRelay, Events, subscriptionQueues } = assetReq(
  "@pbl6/event-contracts",
);
const { Test } = assetReq("@nestjs/testing");
const { configureApp } = assetReq("@pbl6/service-kit");
const services = [
  "identity",
  "organization",
  "asset",
  "maintenance",
  "workorder",
  "service-request",
  "inventory",
  "notification",
];
const prefixes = { "service-request": "SERVICE_REQUEST" };
const urls = Object.fromEntries(
  services.map((name) => {
    const key = prefixes[name] || name.toUpperCase();
    return [name, requireTestDatabaseUrl(key + "_TEST_DATABASE_URL")];
  }),
);
const broker = process.env.RABBITMQ_TEST_URL || process.env.RABBITMQ_URL;
assert.ok(broker, "A real test broker is required");
Object.assign(process.env, testJwtEnv(), {
  NODE_ENV: "test",
  RABBITMQ_URL: "",
  MAINTENANCE_SCHEDULER_ENABLED: "false",
  ASSET_QR_PORTAL_BASE_URL: "http://portal.test",
  BCRYPT_COST: "4",
});
for (const name of services)
  process.env[(prefixes[name] || name.toUpperCase()) + "_DATABASE_URL"] =
    urls[name];
const apps = {},
  dbs = {},
  ports = {},
  relays = [];
const evidence = [];
const subscriptions = [];
let activeHandlers = 0;
let bus, channel, connection;
const tenantId = randomUUID(),
  otherTenant = randomUUID(),
  exchange = "pbl6.test.branch-scope." + randomUUID();
const password = "Policy-Test-42!";
const tenantCodeA = "POLICY-" + tenantId.slice(0, 8).toUpperCase(),
  tenantCodeB = "POLICY-" + otherTenant.slice(0, 8).toUpperCase();
async function port() {
  const s = net.createServer();
  await new Promise((resolve) => s.listen(0, "127.0.0.1", resolve));
  const p = s.address().port;
  await new Promise((resolve) => s.close(resolve));
  return p;
}
async function call(method, route, token, body, status = 200, headers = {}) {
  const response = await fetch(`http://127.0.0.1:${ports.gateway}${route}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: "Bearer " + token } : {}),
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(20000),
  });
  const data = await response.json().catch(() => null);
  assert.equal(
    response.status,
    status,
    `${method} ${route}: ${response.status} ${data?.code || ""} ${data?.message || ""}`,
  );
  return data;
}
const A = "/api/assets",
  M = "/api/maintenance",
  W = "/api/workorders",
  S = "/api";
async function start(name) {
  const r =
    name === "gateway"
      ? createRequire(path.join(root, "apps/api-gateway/package.json"))
      : req(name);
  const { AppModule } = r(
    path.join(
      root,
      "apps",
      name === "gateway" ? "api-gateway" : name + "-service",
      "dist/app.module.js",
    ),
  );
  const module = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app = module.createNestApplication({ logger: false });
  configureApp(app);
  await app.listen(ports[name], "127.0.0.1");
  apps[name] = app;
  if (name !== "gateway") {
    const { PrismaService } = r(
      path.join(
        root,
        "apps",
        name + "-service",
        "dist/prisma/prisma.service.js",
      ),
    );
    dbs[name] = app.get(PrismaService);
  }
}
async function login(email, code = tenantCodeA) {
  return (
    await call("POST", "/api/identity/auth/login", null, {
      tenantCode: code,
      email,
      password,
    })
  ).accessToken;
}
async function fixtureUser(role, tenant, email, customerId) {
  const user = await dbs.identity.user.create({
    data: {
      tenantId: tenant,
      userType: role.startsWith("CUSTOMER") ? "CUSTOMER" : "TENANT_STAFF",
      email,
      fullName: "Policy " + role,
      status: "ACTIVE",
      passwordHash: await identityReq("bcryptjs").hash(password, 4),
      roles: { create: { role: { connect: { code: role } } } },
    },
  });
  if (customerId) {
    const membership = await dbs.organization.customerUserMembership.create({
      data: { tenantId: tenant, customerId, userId: user.id, status: "ACTIVE" },
    });
    await dbs.identity.userCustomerLink.create({
      data: {
        userId: user.id,
        tenantId: tenant,
        customerId,
        membershipId: membership.id,
        status: "ACTIVE",
        sourceChangedAt: new Date(),
      },
    });
  }
  return user;
}
function relay(name) {
  const db = dbs[name];
  const scoped = {
    $transaction: (fn, options) =>
      db.$transaction(
        (tx) =>
          fn(
            new Proxy(tx, {
              get(target, key) {
                if (key !== "$queryRawUnsafe") return Reflect.get(target, key);
                return (sql, ...args) =>
                  target.$queryRawUnsafe(
                    sql.replace(
                      "WHERE status = 'PENDING' AND available_at <= now()",
                      "WHERE status = 'PENDING' AND available_at <= now() AND tenant_id = $2::uuid",
                    ),
                    ...args,
                    tenantId,
                  );
              },
            }),
          ),
        options,
      ),
  };
  const r = new OutboxRelay({
    db: scoped,
    publisher: bus,
    producer: name + "-service",
  });
  relays.push(r);
  return r;
}
async function drain(predicate) {
  const end = Date.now() + 15000;
  while (Date.now() < end) {
    for (const r of relays) await r.runOnce();
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 60));
  }
  throw Error("Timed out waiting for real event consumers");
}
async function main() {
  for (const name of services)
    execFileSync("pnpm", ["--filter", name + "-service", "db:migrate"], {
      cwd: root,
      env: process.env,
      stdio: "inherit",
    });
  for (const name of [...services, "gateway"]) ports[name] = await port();
  for (const name of [...services, "gateway"])
    process.env[
      (name === "gateway" ? "GATEWAY" : prefixes[name] || name.toUpperCase()) +
        "_SERVICE_URL"
    ] = `http://127.0.0.1:${ports[name]}`;
  Object.assign(process.env, {
    IDENTITY_PORT: String(ports.identity),
    LOGIN_RATE_LIMIT: "100",
    WORKORDER_ATTACHMENTS_ENABLED: "false",
    WORKORDER_ATTACHMENT_WORKER_ENABLED: "false",
  });
  for (const name of [...services, "gateway"]) await start(name);
  const instance = (name, module, klass) =>
    apps[name].get(
      req(name)(
        path.join(root, "apps", name + "-service", "dist", module + ".js"),
      )[klass],
    );
  const routeConsumer = instance(
    "workorder",
    "events/site-routing.consumer",
    "SiteRoutingConsumer",
  );
  const dueConsumer = instance(
    "workorder",
    "events/maintenance-events.consumer",
    "MaintenanceEventsConsumer",
  );
  const srConsumer = instance(
    "service-request",
    "events/work-order-events.consumer",
    "WorkOrderEventsConsumer",
  );
  const maintenanceConsumer = instance(
    "maintenance",
    "events/work-order-events.consumer",
    "WorkOrderEventsConsumer",
  );
  const notificationEvents = instance(
    "notification",
    "events/notification-events.service",
    "NotificationEventsService",
  );
  const recipients = instance(
    "notification",
    "events/recipient-projection.service",
    "RecipientProjectionService",
  );
  bus = new RabbitMqEventBus({ url: broker, exchange });
  function subscribe(suffix, events, handler) {
    const queue = exchange + "." + suffix;
    subscriptions.push(queue);
    bus.subscribe({
      queue,
      events,
      handler: async (e) => {
        activeHandlers++;
        try {
          return await handler(e);
        } finally {
          activeHandlers--;
        }
      },
    });
  }
  subscribe("site-routing", [Events.CustomerSiteRoutingChanged], (e) =>
    routeConsumer.handle(e),
  );
  subscribe(
    "due",
    [
      Events.MaintenanceTaskDue,
      Events.MaintenanceTaskDueV2,
      Events.MaintenanceWorkOrderReplacementRequested,
      Events.MaintenanceWorkOrderReplacementRequestedV2,
    ],
    (e) => dueConsumer.handle(e),
  );
  subscribe(
    "sr",
    [
      Events.WorkOrderCreated,
      Events.WorkOrderCompletedV2,
      Events.WorkOrderCancelledV2,
    ],
    (e) => srConsumer.handle(e),
  );
  subscribe(
    "maintenance",
    [
      Events.WorkOrderCreated,
      Events.WorkOrderCompletedV2,
      Events.WorkOrderCancelledV2,
    ],
    (e) => maintenanceConsumer.handle(e),
  );
  const { NOTIFICATION_BUSINESS_EVENTS } = req("notification")(
    path.join(
      root,
      "apps/notification-service/dist/events/notification-events.service.js",
    ),
  );
  subscribe("notifications", NOTIFICATION_BUSINESS_EVENTS, (e) =>
    notificationEvents.handle(e),
  );
  subscribe("recipient", [Events.NotificationRecipientSnapshot], (e) =>
    recipients.applySnapshot(e),
  );
  subscribe(
    "bootstrap",
    [Events.NotificationRecipientBootstrapCompleted],
    (e) => recipients.applyBootstrapCompleted(e),
  );
  await bus.start();
  for (const name of services.filter((name) => name !== "notification"))
    relay(name);
  for (const [id, code] of [
    [tenantId, tenantCodeA],
    [otherTenant, tenantCodeB],
  ]) {
    await dbs.organization.tenant.create({ data: { id, code, name: code } });
    await dbs.identity.tenantDirectory.create({
      data: { tenantId: id, code, status: "ACTIVE" },
    });
  }
  const adminUser = await fixtureUser(
    "TENANT_ADMIN",
    tenantId,
    "admin@branch.test",
  );
  const admin = await login(adminUser.email);
  const org = "/api/organization",
    I = "/api/inventory",
    N = "/api/notifications";
  const branchA = await call(
    "POST",
    org + "/branches",
    admin,
    { code: "A", name: "Chi nhánh A", address: "Address A" },
    201,
  );
  const branchB = await call(
    "POST",
    org + "/branches",
    admin,
    { code: "B", name: "Chi nhánh B", address: "Address B" },
    201,
  );
  const users = {};
  for (const [key, role, branchId] of [
    ["managerA", "SERVICE_MANAGER", branchA.id],
    ["managerB", "SERVICE_MANAGER", branchB.id],
    ["techA", "TECHNICIAN", branchA.id],
    ["techB", "TECHNICIAN", branchB.id],
    ["inventoryA", "INVENTORY_STAFF", branchA.id],
    ["inventoryB", "INVENTORY_STAFF", branchB.id],
    ["unassigned", "SERVICE_MANAGER", null],
  ]) {
    const user = await fixtureUser(role, tenantId, key + "@branch.test");
    if (branchId)
      await call(
        "POST",
        `${org}/branches/${branchId}/users`,
        admin,
        { userId: user.id, isPrimary: true },
        201,
      );
    users[key] = { ...user, token: await login(user.email) };
  }
  const a = users.managerA.token,
    b = users.managerB.token;
  await call(
    "GET",
    S + "/service-requests",
    users.unassigned.token,
    undefined,
    403,
  );
  assert.equal(
    (await call("GET", org + "/staff/me/branch", a)).branch.id,
    branchA.id,
  );
  const customer = await call(
    "POST",
    org + "/customers",
    a,
    { code: "CUSTOMER", name: "Shared customer" },
    201,
  );
  const siteA = await call(
    "POST",
    `${org}/customers/${customer.id}/sites`,
    a,
    { code: "SITE-A", name: "Site A", address: "A" },
    201,
  );
  const siteB = await call(
    "POST",
    `${org}/customers/${customer.id}/sites`,
    b,
    { code: "SITE-B", name: "Site B", address: "B" },
    201,
  );
  const siteUnknown = await call(
    "POST",
    `${org}/customers/${customer.id}/sites`,
    admin,
    { code: "SITE-X", name: "Unrouted", address: "X" },
    201,
  );
  await call(
    "PATCH",
    `${org}/sites/${siteB.id}`,
    a,
    { defaultServicingBranchId: branchA.id },
    403,
  );
  const customerUser = await fixtureUser(
    "CUSTOMER_ADMIN",
    tenantId,
    "customer@branch.test",
    customer.id,
  );
  const customerToken = await login(customerUser.email);
  const otherCustomer = await call(
    "POST",
    org + "/customers",
    admin,
    { code: "OTHER", name: "Other customer" },
    201,
  );
  const otherCustomerUser = await fixtureUser(
    "CUSTOMER_ADMIN",
    tenantId,
    "other-customer@branch.test",
    otherCustomer.id,
  );
  const otherCustomerToken = await login(otherCustomerUser.email);
  const model = await call(
    "POST",
    A + "/equipment-models",
    a,
    {
      manufacturer: "Branch fixture",
      modelCode: "MODEL",
      name: "Branch equipment model",
    },
    201,
  );
  async function equipment(code, site) {
    const result = await call(
      "POST",
      A + "/equipment",
      a,
      {
        modelId: model.id,
        customerId: customer.id,
        customerSiteId: site.id,
        assetCode: code,
        serialNumber: code,
      },
      201,
    );
    await call(
      "POST",
      `${A}/equipment/${result.id}/warranties`,
      a,
      {
        startDate: "2026-01-01",
        endDate: "2030-12-31",
        warrantyType: "STANDARD",
      },
      201,
    );
    return result;
  }
  const eqA = await equipment("EQUIPMENT-A", siteA),
    eqB = await equipment("EQUIPMENT-B", siteB),
    eqUnknown = await equipment("EQUIPMENT-X", siteUnknown);
  async function requestFor(eq) {
    return call(
      "POST",
      S + "/service-requests",
      customerToken,
      {
        equipmentId: eq.id,
        type: "WARRANTY",
        title: "Warranty request",
        description: "Does not start",
      },
      201,
    );
  }
  const srA = await requestFor(eqA),
    srB = await requestFor(eqB),
    srX = await requestFor(eqUnknown);
  assert.equal(srA.branchId, branchA.id);
  assert.equal(srB.branchId, branchB.id);
  assert.equal(srX.branchId, null);
  const listA = await call("GET", S + "/service-requests", a),
    listB = await call("GET", S + "/service-requests", b);
  assert.deepEqual(
    listA.items.map((row) => row.id),
    [srA.id],
  );
  assert.deepEqual(
    listB.items.map((row) => row.id),
    [srB.id],
  );
  assert.equal((await call("GET", S + "/service-requests", admin)).total, 3);
  await call("GET", `${S}/service-requests/${srB.id}`, a, undefined, 404);
  await call("POST", `${S}/service-requests/${srB.id}/review`, a, {}, 404);
  await call(
    "GET",
    `${S}/service-requests/${srA.id}`,
    otherCustomerToken,
    undefined,
    404,
  );
  await call(
    "PATCH",
    `${S}/service-requests/${srX.id}/branch`,
    a,
    { branchId: branchA.id, expectedBranchId: null, reason: "Unauthorized" },
    403,
  );
  await call("PATCH", `${S}/service-requests/${srX.id}/branch`, admin, {
    branchId: branchA.id,
    expectedBranchId: null,
    reason: "Initial allocation",
  });
  await call(
    "PATCH",
    `${S}/service-requests/${srX.id}/branch`,
    admin,
    {
      branchId: branchB.id,
      expectedBranchId: null,
      reason: "Stale concurrent allocation",
    },
    409,
  );
  const technicianA = await call(
    "POST",
    W + "/technicians",
    a,
    { userId: users.techA.id, branchId: branchA.id, employeeCode: "TA" },
    201,
  );
  const technicianB = await call(
    "POST",
    W + "/technicians",
    b,
    { userId: users.techB.id, branchId: branchB.id, employeeCode: "TB" },
    201,
  );
  await call(
    "POST",
    W + "/technicians",
    a,
    { userId: users.techB.id, branchId: branchA.id, employeeCode: "WRONG" },
    422,
  );
  const orders = [];
  for (const [sr, manager] of [
    [srA, a],
    [srB, b],
  ]) {
    await call("POST", `${S}/service-requests/${sr.id}/review`, manager, {});
    await call("POST", `${S}/service-requests/${sr.id}/accept`, manager, {});
    orders.push(
      await call(
        "POST",
        W + "/work-orders",
        manager,
        { serviceRequestId: sr.id },
        201,
      ),
    );
  }
  const [woA, woB] = orders;
  assert.equal(woA.branchId, branchA.id);
  assert.equal(woB.branchId, branchB.id);
  await call("GET", W + `/work-orders/${woB.id}`, a, undefined, 404);
  await call(
    "PATCH",
    W + `/work-orders/${woB.id}`,
    a,
    { title: "Forbidden" },
    404,
  );
  await call(
    "GET",
    W + `/work-orders/${woB.id}/attachments`,
    a,
    undefined,
    404,
  );
  await call(
    "POST",
    W + `/work-orders/${woA.id}/assign`,
    a,
    { technicianId: technicianB.id },
    422,
  );
  await call("POST", W + `/work-orders/${woA.id}/assign`, a, {
    technicianId: technicianA.id,
  });
  await call("POST", W + `/work-orders/${woB.id}/assign`, b, {
    technicianId: technicianB.id,
  });
  await call(
    "POST",
    W + `/work-orders/${woA.id}/accept`,
    users.techA.token,
    {},
  );
  await call(
    "GET",
    W + `/work-orders/${woA.id}`,
    users.techB.token,
    undefined,
    404,
  );
  const part = await call(
    "POST",
    I + "/parts",
    users.inventoryA.token,
    { sku: "P1", name: "Filter", unit: "cái" },
    201,
  );
  const warehouseA = await call(
    "POST",
    I + "/warehouses",
    users.inventoryA.token,
    { branchId: branchA.id, code: "WA", name: "Warehouse A" },
    201,
  );
  const warehouseB = await call(
    "POST",
    I + "/warehouses",
    users.inventoryB.token,
    { branchId: branchB.id, code: "WB", name: "Warehouse B" },
    201,
  );
  const key = () => ({ "Idempotency-Key": randomUUID() });
  for (const [warehouse, token] of [
    [warehouseA, users.inventoryA.token],
    [warehouseB, users.inventoryB.token],
  ])
    await call(
      "POST",
      I + "/stock-transactions/receive",
      token,
      {
        warehouseId: warehouse.id,
        partId: part.id,
        quantity: "10",
        note: "Initial receipt",
      },
      201,
      key(),
    );
  await call(
    "GET",
    I + `/warehouses/${warehouseB.id}`,
    users.inventoryA.token,
    undefined,
    404,
  );
  await call(
    "POST",
    I + "/stock-transactions/receive",
    users.inventoryA.token,
    {
      warehouseId: warehouseB.id,
      partId: part.id,
      quantity: "1",
      note: "Forbidden",
    },
    404,
    key(),
  );
  const issueKey = key();
  const issueBody = {
    warehouseId: warehouseA.id,
    partId: part.id,
    quantity: "2",
  };
  const issue = await call(
    "POST",
    I + `/work-orders/${woA.id}/parts`,
    users.inventoryA.token,
    issueBody,
    201,
    issueKey,
  );
  await call(
    "POST",
    I + `/work-orders/${woA.id}/parts`,
    users.inventoryA.token,
    issueBody,
    201,
    issueKey,
  );
  const operationKey = issueKey["Idempotency-Key"];
  await call(
    "GET",
    I + `/inventory-operations/${operationKey}`,
    users.inventoryB.token,
    undefined,
    404,
  );
  await call(
    "POST",
    I + `/inventory-operations/${operationKey}/retry`,
    users.inventoryB.token,
    {},
    404,
  );
  assert.equal(
    (await call("GET", I + "/stocks", users.inventoryA.token)).items.length,
    1,
  );
  assert.equal((await call("GET", I + "/stocks", admin)).items.length, 2);
  const usageId =
    issue.response?.workOrderPartId ||
    issue.response?.usage?.id ||
    issue.workOrderPartId ||
    issue.usage?.id;
  const usages = await call(
    "GET",
    I + `/work-orders/${woA.id}/parts`,
    users.inventoryA.token,
  );
  const usage = Array.isArray(usages) ? usages[0] : usages.items?.[0];
  await call(
    "POST",
    I + `/work-order-parts/${usageId || usage.id}/return`,
    users.inventoryA.token,
    { quantity: "2", condition: "GOOD", note: "Unused parts returned" },
    200,
    key(),
  );
  await call("POST", W + `/work-orders/${woA.id}/start`, users.techA.token, {});
  await call("POST", W + `/work-orders/${woA.id}/complete`, users.techA.token, {
    problemDescription: "Fault found",
    solution: "Repaired",
    result: "RESOLVED",
    customerSummary: "Equipment repaired",
  });
  // Real identity-owned recipient snapshots and bootstrap marker travel over the isolated broker.
  const runId = randomUUID(),
    identitySnapshots = identityReq(
      path.join(
        root,
        "apps/identity-service/dist/events/recipient-snapshots.js",
      ),
    );
  const allUsers = await dbs.identity.user.findMany({ where: { tenantId } });
  await dbs.identity.$transaction(async (tx) => {
    for (const user of allUsers)
      await identitySnapshots.enqueueRecipientSnapshot(tx, user.id, runId);
    await assetReq("@pbl6/event-contracts").enqueueEvent(
      tx,
      Events.NotificationRecipientBootstrapCompleted,
      {
        tenantId,
        aggregateId: runId,
        payload: {
          bootstrapRunId: runId,
          expectedUsers: allUsers.length,
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
        },
      },
    );
  });
  await drain(
    async () =>
      (
        await dbs["service-request"].serviceRequest.findUnique({
          where: { id: srA.id },
        })
      ).status === "RESOLVED" &&
      !!(await dbs.notification.recipientBootstrapRun.findFirst({
        where: { bootstrapRunId: runId, status: "COMPLETED" },
      })),
  );
  await call(
    "POST",
    `${S}/service-requests/${srA.id}/confirm`,
    customerToken,
    {},
  );
  await drain(
    async () =>
      (await dbs.notification.notification.count({ where: { tenantId } })) > 0,
  );
  const notificationsA = await call("GET", N, a),
    notificationsB = await call("GET", N, b);
  assert.ok(notificationsA.items.some((n) => n.resourceId === srA.id));
  assert.ok(
    notificationsA.items.every((n) => ![srB.id, woB.id].includes(n.resourceId)),
  );
  assert.ok(
    notificationsB.items.every(
      (n) => ![srA.id, woA.id, srX.id].includes(n.resourceId),
    ),
  );
  const hidden = await dbs.notification.notification.findFirst({
    where: { tenantId, userId: users.managerA.id, branchId: branchB.id },
  });
  if (hidden) await call("PATCH", N + `/${hidden.id}/read`, a, {}, 404);
  const reportQuery = "?from=2026-01-01T00:00:00Z&to=2031-01-01T00:00:00Z";
  assert.equal(
    (await call("GET", W + "/reports/work-orders/summary" + reportQuery, a))
      .createdCount,
    1,
  );
  assert.equal(
    (await call("GET", W + "/reports/work-orders/summary" + reportQuery, admin))
      .createdCount,
    2,
  );
  const quoteEquipment = await call(
    "POST",
    A + "/equipment",
    b,
    {
      modelId: model.id,
      customerId: customer.id,
      customerSiteId: siteB.id,
      assetCode: "QUOTE-EQUIPMENT",
      serialNumber: "QUOTE-EQUIPMENT",
    },
    201,
  );
  const quoteRequest = await requestFor(quoteEquipment);
  await call("POST", `${S}/service-requests/${quoteRequest.id}/review`, b, {});
  const estimate = await call(
    "POST",
    `${S}/service-requests/${quoteRequest.id}/estimates`,
    b,
    {
      items: [
        {
          itemType: "LABOR",
          description: "Inspection",
          quantity: "1",
          unitPrice: "100000",
        },
      ],
    },
    201,
  );
  await call(
    "POST",
    `${S}/service-requests/estimates/${estimate.id}/send`,
    a,
    {},
    404,
  );
  await call(
    "POST",
    `${S}/service-requests/estimates/${estimate.id}/send`,
    b,
    {},
  );
  await call(
    "POST",
    `${S}/service-requests/estimates/${estimate.id}/approve`,
    otherCustomerToken,
    {},
    404,
  );
  await call(
    "POST",
    `${S}/service-requests/estimates/${estimate.id}/approve`,
    customerToken,
    {},
  );
  const quoteWo = await call(
    "POST",
    W + "/work-orders",
    b,
    { serviceRequestId: quoteRequest.id },
    201,
  );
  assert.equal(quoteWo.branchId, branchB.id);
  const plan = await call(
    "POST",
    M + "/maintenance-plans",
    b,
    {
      equipmentId: eqB.id,
      name: "Scheduled maintenance",
      frequencyUnit: "MONTH",
      frequencyValue: 1,
      nextDueDate: "2026-11-09",
    },
    201,
  );
  const scheduler = instance(
    "maintenance",
    "scheduler/scheduler.service",
    "SchedulerService",
  );
  await scheduler.tick("2026-11-09", tenantId);
  await drain(
    async () =>
      !!(await dbs.workorder.workOrder.findFirst({
        where: {
          tenantId,
          maintenanceTaskId: { not: null },
          equipmentId: eqB.id,
          branchId: branchB.id,
        },
      })),
  );
  const maintenanceWo = await dbs.workorder.workOrder.findFirstOrThrow({
    where: { tenantId, equipmentId: eqB.id, maintenanceTaskId: { not: null } },
  });
  await call("GET", W + `/work-orders/${maintenanceWo.id}`, a, undefined, 404);
  await call("GET", W + `/work-orders/${maintenanceWo.id}`, b);
  // Changing routing affects new requests, not the already assigned/closed case.
  await call("PATCH", `${org}/sites/${siteA.id}`, admin, {
    defaultServicingBranchId: branchB.id,
  });
  const newRequest = await requestFor(eqA);
  assert.equal(newRequest.branchId, branchB.id);
  assert.equal(
    (await call("GET", `${S}/service-requests/${srA.id}`, admin)).branchId,
    branchA.id,
  );
  await drain(
    async () =>
      (
        await dbs.workorder.siteBranchSnapshot.findUnique({
          where: { tenantId_siteId: { tenantId, siteId: siteA.id } },
        })
      )?.branchId === branchB.id,
  );
  const route = await dbs.workorder.siteBranchSnapshot.findUniqueOrThrow({
    where: { tenantId_siteId: { tenantId, siteId: siteA.id } },
  });
  const routingEvent = {
    eventId: randomUUID(),
    eventType: "CustomerSiteRoutingChanged",
    eventVersion: 1,
    producer: "organization-service",
    tenantId,
    aggregateType: "CustomerSite",
    aggregateId: siteA.id,
    occurredAt: new Date().toISOString(),
    correlationId: null,
    payload: {
      siteId: siteA.id,
      branchId: branchA.id,
      revision: route.revision - 1,
    },
  };
  await routeConsumer.handle(routingEvent);
  assert.equal(
    (
      await dbs.workorder.siteBranchSnapshot.findUniqueOrThrow({
        where: { tenantId_siteId: { tenantId, siteId: siteA.id } },
      })
    ).branchId,
    branchB.id,
  );
  await assert.rejects(
    routeConsumer.handle({
      ...routingEvent,
      eventId: randomUUID(),
      payload: { ...routingEvent.payload, revision: route.revision },
    }),
    /Conflicting site routing revision/,
  );
  await assert.rejects(
    routeConsumer.handle({
      ...routingEvent,
      eventId: randomUUID(),
      producer: "inventory-service",
    }),
    /Invalid site routing source/,
  );
  // Live membership changes revoke the old branch even with the same access token.
  await call(
    "POST",
    `${org}/branches/${branchB.id}/users`,
    admin,
    { userId: users.managerA.id, isPrimary: true },
    201,
  );
  await call("GET", `${S}/service-requests/${srA.id}`, a, undefined, 404);
  await call("GET", `${S}/service-requests/${srB.id}`, a);
  const before = await call(
    "GET",
    I + "/stock-transactions",
    users.inventoryA.token,
  );
  assert.ok(before.items.every((t) => t.warehouseId === warehouseA.id));
  await call(
    "POST",
    `${org}/branches/${branchB.id}/users`,
    admin,
    { userId: users.inventoryA.id, isPrimary: true },
    201,
  );
  await call(
    "POST",
    I + `/work-orders/${woA.id}/parts`,
    users.inventoryA.token,
    issueBody,
    404,
    issueKey,
  );
  const secondAdminUser = await fixtureUser(
    "TENANT_ADMIN",
    otherTenant,
    "admin@branch.test",
  );
  const secondAdmin = await login(secondAdminUser.email, tenantCodeB);
  await call(
    "GET",
    `${S}/service-requests/${srA.id}`,
    secondAdmin,
    undefined,
    404,
  );
  await call("GET", W + `/work-orders/${woA.id}`, secondAdmin, undefined, 404);
  if (process.env.BRANCH_BROWSER === "true") {
    const queued = await requestFor(eqUnknown);
    const browserChecks = await require("./test-branch-service-browser.cjs")({
      root,
      ports,
      tenantCode: tenantCodeA,
      password,
      adminEmail: adminUser.email,
      managerEmail: users.managerB.email,
      unassignedEmail: users.unassigned.email,
      branchId: branchB.id,
      foreignRequestId: srA.id,
      queueRequestNo: queued.requestNo,
    });
    assert.equal(
      (
        await dbs["service-request"].serviceRequest.findUnique({
          where: { id: queued.id },
        })
      ).branchId,
      branchB.id,
    );
    evidence.push(...browserChecks);
  }
  await call(
    "POST",
    "/api/identity/users",
    admin,
    {
      email: "retired-dispatcher@branch.test",
      fullName: "Retired role",
      userType: "TENANT_STAFF",
      roles: ["DISPATCHER"],
    },
    403,
  );
  await call("PATCH", `${org}/branches/${branchB.id}`, admin, {
    status: "INACTIVE",
  });
  await call("GET", S + "/service-requests", b, undefined, 403);
  await call("PATCH", `${org}/branches/${branchB.id}`, admin, {
    status: "ACTIVE",
  });
  await apps.organization.close();
  await call("GET", S + "/service-requests", b, undefined, 503);
  await call("GET", S + "/service-requests", admin);
  evidence.push(
    "Out-of-warranty estimate send/approve and cross-branch estimate rejection",
    "Site routing ignores stale revision and rejects conflicting/forged producer",
    "Retired Dispatcher onboarding rejected; inactive branch and Organization outage fail closed",
  );
  evidence.push(
    "Real Identity/Gateway: tenant and customer isolation",
    "Primary branch resolved live; missing membership fails closed",
    "One Service Manager reviews, accepts, creates and assigns WO",
    "Request and WO list/detail/write/attachment boundaries across branches",
    "Admin unallocated queue, optimistic allocation and site routing",
    "Technician membership and cross-branch assignment rejection",
    "Inventory stock/ledger/mutations/idempotent replay/recovery branch boundaries",
    "End-to-end execution, return, report and customer confirmation",
    "Real RabbitMQ: site routing, scheduled maintenance WO and recipient bootstrap",
    "Notification list/read and reports match branch scope",
    "Membership changes apply without refreshing JWT; new routing preserves case history",
  );
  console.log(
    JSON.stringify(
      {
        status: "PASS",
        tenantId,
        branchA: branchA.id,
        branchB: branchB.id,
        assertions: evidence,
        planId: plan.id,
      },
      null,
      2,
    ),
  );
}
main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    const deadline = Date.now() + 5000;
    while (activeHandlers && Date.now() < deadline)
      await new Promise((resolve) => setTimeout(resolve, 50));
    await bus?.close().catch(() => {});
    for (const app of Object.values(apps).reverse())
      await app.close().catch(() => {});
    let conn;
    try {
      conn = await assetReq("amqplib").connect(broker);
      const ch = await conn.createChannel();
      for (const queue of subscriptions)
        for (const q of Object.values(subscriptionQueues(queue)))
          await ch.deleteQueue(q);
      await ch.deleteExchange(exchange);
    } catch {
    } finally {
      await conn?.close().catch(() => {});
    }
  });

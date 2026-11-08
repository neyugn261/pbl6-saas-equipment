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
let bus, channel, connection;
const tenantId = randomUUID(),
  otherTenant = randomUUID(),
  exchange = "pbl6.test.model-policies." + randomUUID();
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
  if (customerId)
    await dbs.identity.userCustomerLink.create({
      data: {
        userId: user.id,
        tenantId: tenant,
        customerId,
        membershipId: randomUUID(),
        status: "ACTIVE",
        sourceChangedAt: new Date(),
      },
    });
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
  process.env.IDENTITY_PORT = String(ports.identity);
  process.env.LOGIN_RATE_LIMIT = "100";
  for (const name of [...services, "gateway"]) await start(name);
  for (const [id, code] of [
    [tenantId, tenantCodeA],
    [otherTenant, tenantCodeB],
  ]) {
    await dbs.organization.tenant.create({
      data: { id, code, name: code, status: "ACTIVE" },
    });
    await dbs.identity.tenantDirectory.create({
      data: { tenantId: id, code, status: "ACTIVE" },
    });
  }
  await fixtureUser("TENANT_ADMIN", tenantId, "admin@policy.test");
  const admin = await login("admin@policy.test");
  const branch = await call(
    "POST",
    "/api/organization/branches",
    admin,
    { code: "BRANCH", name: "Policy branch", address: "Test address" },
    201,
  );
  const managerUser = await fixtureUser(
    "SERVICE_MANAGER",
    tenantId,
    "manager@policy.test",
  );
  const techUser = await fixtureUser(
    "TECHNICIAN",
    tenantId,
    "technician@policy.test",
  );
  await fixtureUser("SERVICE_MANAGER", otherTenant, "manager@policy.test");
  const manager = await login(managerUser.email),
    other = await login(managerUser.email, tenantCodeB),
    tech = await login(techUser.email);
  const customer = await call(
    "POST",
    "/api/organization/customers",
    manager,
    { code: "POLICY-CUSTOMER", name: "Policy customer" },
    201,
  );
  const site = await call(
    "POST",
    `/api/organization/customers/${customer.id}/sites`,
    manager,
    { code: "SITE", name: "Policy site", address: "Test address" },
    201,
  );
  const customerUser = await fixtureUser(
      "CUSTOMER_ADMIN",
      tenantId,
      "customer@policy.test",
      customer.id,
    ),
    customerToken = await login(customerUser.email);
  const model = await call(
    "POST",
    A + "/equipment-models",
    manager,
    { manufacturer: "Policy fixture", modelCode: "X100", name: "Model X100" },
    201,
  );
  const item = {
    id: randomUUID(),
    title: "Inspect filter",
    action: "INSPECT",
    instructions: "Replace only if damaged",
    required: true,
    allowNotApplicable: false,
  };
  const warranty = {
    mode: "APPLY",
    name: "Standard warranty",
    terms: "Manufacturing defects only",
    reason: "",
    durationMonths: 12,
    coveredCauses: ["MANUFACTURING_DEFECT"],
    exclusions: [
      {
        code: "LIQUID_INGRESS",
        text: "Damage caused by liquid ingress is excluded",
      },
    ],
  };
  const profile = {
    mode: "APPLY",
    name: "Maintenance programme",
    terms: "Agreed at handover",
    reason: "",
    rules: [
      {
        id: randomUUID(),
        name: "Quarterly inspection",
        frequencyUnit: "MONTH",
        frequencyValue: 3,
        firstOccurrence: 1,
        checklist: [item],
      },
      {
        id: randomUUID(),
        name: "Annual service",
        frequencyUnit: "YEAR",
        frequencyValue: 1,
        firstOccurrence: 1,
        checklist: [{ ...item, id: randomUUID(), title: "Annual inspection" }],
      },
    ],
  };
  const wp = `${A}/equipment-models/${model.id}/warranty-policies`,
    mp = `${M}/equipment-models/${model.id}/maintenance-profiles`;
  let w = await call("POST", wp, manager, { body: warranty }, 201),
    m = await call("POST", mp, manager, { body: profile }, 201);
  w = await call(
    "POST",
    wp + `/${w.id}/publish`,
    manager,
    { expectedVersion: w.version },
    201,
  );
  m = await call(
    "POST",
    mp + `/${m.id}/publish`,
    manager,
    { expectedVersion: m.version },
    201,
  );
  await call(
    "PUT",
    wp + `/${w.id}`,
    manager,
    { expectedVersion: w.version, body: warranty },
    409,
  );
  await call("GET", wp, other, undefined, 404);
  async function registration(serial, selectedModelId = model.id) {
    return call(
      "POST",
      A + "/equipment-registrations",
      manager,
      {
        equipment: {
          mode: "NEW",
          data: {
            modelId: selectedModelId,
            customerId: customer.id,
            customerSiteId: site.id,
            assetCode: serial,
            serialNumber: serial,
            handoverDate: "2026-01-31",
          },
        },
        warranty: { mode: "UNCONFIRMED" },
        maintenance: { mode: "UNCONFIRMED" },
      },
      201,
      { "Idempotency-Key": randomUUID() },
    );
  }
  const draft = await registration("MODEL-A");
  const preview = await call(
    "POST",
    A + `/equipment-registrations/${draft.id}/model-policies`,
    manager,
    { expectedVersion: draft.version },
    201,
  );
  assert.equal(preview.policyPreview.warranty.endDate, "2027-01-30");
  assert.equal(
    preview.policyPreview.maintenance.firstDueDates[0].date,
    "2026-04-30",
  );
  let w2 = await call(
    "POST",
    wp,
    manager,
    { body: { ...warranty, durationMonths: 24 } },
    201,
  );
  w2 = await call(
    "POST",
    wp + `/${w2.id}/publish`,
    manager,
    { expectedVersion: w2.version },
    201,
  );
  const done = await call(
    "POST",
    A + `/equipment-registrations/${draft.id}/submit`,
    manager,
    { expectedVersion: preview.version },
  );
  assert.equal(done.status, "COMPLETED");
  assert.equal(done.maintenancePlanIds.length, 2);
  assert.equal(done.maintenancePlanId, null);
  assert.equal(done.policyPreview.warranty.revisionId, w.id);
  await call(
    "GET",
    A + `/internal/equipment-registrations/${draft.id}/model-policy-input`,
    manager,
    undefined,
    404,
  );
  await call(
    "PUT",
    M + `/internal/equipment-registrations/${draft.id}/maintenance-group`,
    manager,
    undefined,
    404,
  );
  const again = await call(
    "POST",
    A + `/equipment-registrations/${draft.id}/resume`,
    manager,
    {},
  );
  assert.deepEqual(again.maintenancePlanIds, done.maintenancePlanIds);
  assert.equal(
    await dbs.asset.warranty.count({
      where: { equipmentId: draft.equipmentId },
    }),
    1,
  );
  assert.equal(
    await dbs.maintenance.maintenancePlan.count({
      where: { equipmentId: draft.equipmentId },
    }),
    2,
  );
  const b = await registration("MODEL-B"),
    previewB = await call(
      "POST",
      A + `/equipment-registrations/${b.id}/model-policies`,
      manager,
      { expectedVersion: b.version },
      201,
    );
  assert.equal(previewB.policyPreview.warranty.revisionId, w2.id);
  const safe = await call(
    "GET",
    A + `/equipment/${draft.equipmentId}/applied-policies`,
    customerToken,
  );
  assert.equal(safe.snapshot.warranty.revision, 1);
  assert.equal(safe.snapshot.hash, undefined);
  await call(
    "GET",
    A + `/equipment/${draft.equipmentId}/applied-policies`,
    other,
    undefined,
    404,
  );
  evidence.push({
    case: "policy versions, frozen handover, multiple plans, replay, customer scope",
    status: "PASS",
  });
  const woReq = req("workorder"),
    maintReq = req("maintenance"),
    srReq = req("service-request");
  const woConsumer = apps.workorder.get(
    woReq(
      path.join(
        root,
        "apps/workorder-service/dist/events/maintenance-events.consumer.js",
      ),
    ).MaintenanceEventsConsumer,
  );
  const maintConsumer = apps.maintenance.get(
    maintReq(
      path.join(
        root,
        "apps/maintenance-service/dist/events/work-order-events.consumer.js",
      ),
    ).WorkOrderEventsConsumer,
  );
  const srConsumer = apps["service-request"].get(
    srReq(
      path.join(
        root,
        "apps/service-request-service/dist/events/work-order-events.consumer.js",
      ),
    ).WorkOrderEventsConsumer,
  );
  let historyConsumer = apps.asset.get(
    assetReq(
      path.join(root, "apps/asset-service/dist/events/history.consumer.js"),
    ).HistoryConsumer,
  );
  const requestConsumer = apps.workorder.get(
    woReq(
      path.join(
        root,
        "apps/workorder-service/dist/events/service-request-events.consumer.js",
      ),
    ).ServiceRequestEventsConsumer,
  );
  bus = new RabbitMqEventBus({ url: broker, exchange });
  bus.subscribe({
    queue: exchange + ".asset-history",
    events: [Events.WorkOrderCompletedV2, Events.ServiceRequestStatusChanged],
    handler: (e) => historyConsumer.handle(e),
  });
  bus.subscribe({
    queue: exchange + ".request-orders",
    events: [Events.ServiceRequestStatusChanged],
    handler: (e) => requestConsumer.handle(e),
  });
  bus.subscribe({
    queue: exchange + ".workorder",
    events: [
      Events.MaintenanceTaskDueV2,
      Events.MaintenanceWorkOrderReplacementRequestedV2,
    ],
    handler: (e) => woConsumer.handle(e),
  });
  bus.subscribe({
    queue: exchange + ".maintenance",
    events: [
      Events.WorkOrderCreated,
      Events.WorkOrderCompletedV2,
      Events.WorkOrderCancelledV2,
    ],
    handler: (e) => maintConsumer.handle(e),
  });
  bus.subscribe({
    queue: exchange + ".requests",
    events: [
      Events.WorkOrderCreated,
      Events.WorkOrderCompletedV2,
      Events.WorkOrderCancelledV2,
    ],
    handler: (e) => srConsumer.handle(e),
  });
  await bus.start();
  relay("maintenance");
  relay("workorder");
  relay("service-request");
  const scheduler = apps.maintenance.get(
    maintReq(
      path.join(
        root,
        "apps/maintenance-service/dist/scheduler/scheduler.service.js",
      ),
    ).SchedulerService,
  );
  assert.equal(await scheduler.tick("2026-04-30", tenantId), 1);
  assert.equal(await scheduler.tick("2026-04-30", tenantId), 0);
  await drain(
    async () =>
      (await dbs.workorder.workOrder.count({
        where: { tenantId, maintenanceTaskId: { not: null } },
      })) === 1,
  );
  const order = await dbs.workorder.workOrder.findFirstOrThrow({
    where: { tenantId, maintenanceTaskId: { not: null } },
  });
  assert.equal(order.policyVersionId, m.id);
  const technician = await call(
    "POST",
    W + "/technicians",
    manager,
    { userId: techUser.id, branchId: branch.id, employeeCode: "POLICY-TECH" },
    201,
  );
  await call("POST", W + `/work-orders/${order.id}/assign`, manager, {
    technicianId: technician.id,
  });
  await call("POST", W + `/work-orders/${order.id}/accept`, tech, {});
  await call("POST", W + `/work-orders/${order.id}/start`, tech, {});
  const report = {
    problemDescription: "Routine service",
    solution: "Filter inspected",
    result: "RESOLVED",
    customerSummary: "Routine service completed",
  };
  await call(
    "POST",
    W + `/work-orders/${order.id}/complete`,
    tech,
    report,
    409,
  );
  await call(
    "POST",
    W + `/work-orders/${order.id}/checklist`,
    tech,
    {
      expectedVersion: 0,
      results: [{ itemId: randomUUID(), status: "DONE", note: "" }],
    },
    400,
  );
  await call("POST", W + `/work-orders/${order.id}/checklist`, tech, {
    expectedVersion: 0,
    results: [
      { itemId: item.id, status: "DONE", note: "Internal observation" },
    ],
  });
  await call(
    "POST",
    W + `/work-orders/${order.id}/checklist`,
    tech,
    { expectedVersion: 0, results: [] },
    409,
  );
  await call("POST", W + `/work-orders/${order.id}/complete`, tech, report);
  await drain(
    async () =>
      (await dbs.maintenance.maintenanceTask.count({
        where: { tenantId, status: "COMPLETED" },
      })) === 1,
  );
  evidence.push({
    case: "real broker, task snapshot, required checklist, report completion",
    status: "PASS",
  });
  const sr = await call(
    "POST",
    S + "/service-requests",
    customerToken,
    {
      equipmentId: draft.equipmentId,
      type: "REPAIR",
      priority: "NORMAL",
      title: "Liquid damage",
      description: "Liquid entered equipment",
    },
    201,
  );
  await call("POST", S + `/service-requests/${sr.id}/review`, manager, {});
  let detail = await call("GET", S + `/service-requests/${sr.id}`, manager);
  assert.equal(detail.assessmentRequired, true);
  assert.ok(!detail.allowedActions.includes("accept"));
  await call("POST", S + `/service-requests/${sr.id}/accept`, manager, {}, 422);
  await call(
    "POST",
    S + `/service-requests/${sr.id}/warranty-assessment`,
    manager,
    {
      expectedVersion: detail.assessmentVersion,
      cause: "LIQUID_INGRESS",
      decision: "NOT_COVERED",
      reason: "Inspection confirms liquid ingress",
    },
  );
  detail = await call("GET", S + `/service-requests/${sr.id}`, manager);
  assert.ok(detail.allowedActions.includes("create-estimate"));
  const estimate = await call(
    "POST",
    S + `/service-requests/${sr.id}/estimates`,
    manager,
    {
      currency: "VND",
      items: [
        {
          itemType: "LABOR",
          description: "Repair",
          quantity: "1",
          unitPrice: "100000",
        },
      ],
    },
    201,
  );
  await call(
    "POST",
    S + `/service-requests/estimates/${estimate.id}/send`,
    manager,
    {},
  );
  const assessmentAudit = await call(
    "GET",
    S + `/service-requests/${sr.id}/warranty-assessments`,
    manager,
  );
  assert.equal(assessmentAudit.items.length, 1);
  await call(
    "GET",
    S + `/service-requests/${sr.id}/warranty-assessments`,
    customerToken,
    undefined,
    403,
  );
  await call(
    "GET",
    S + `/service-requests/${sr.id}/warranty-assessments`,
    other,
    undefined,
    404,
  );
  await call(
    "POST",
    S + `/service-requests/${sr.id}/warranty-assessment`,
    manager,
    {
      expectedVersion: detail.assessmentVersion,
      cause: "MANUFACTURING_DEFECT",
      decision: "COVERED",
      reason: "Cannot replace a pending customer decision",
    },
    409,
  );
  await call(
    "POST",
    S + `/service-requests/estimates/${estimate.id}/approve`,
    customerToken,
    {},
  );
  assert.equal(
    (await call("GET", S + `/service-requests/${sr.id}`, manager)).status,
    "ACCEPTED",
  );
  assert.equal(
    (
      await dbs.asset.warranty.findFirstOrThrow({
        where: { equipmentId: draft.equipmentId },
      })
    ).status,
    "ACTIVE",
  );
  await call(
    "POST",
    W + "/work-orders",
    manager,
    { serviceRequestId: sr.id },
    201,
  );
  await drain(
    async () =>
      (await dbs.workorder.workOrder.count({
        where: { tenantId, serviceRequestId: sr.id },
      })) === 1,
  );
  await drain(
    async () =>
      (await dbs.asset.equipmentHistory.count({
        where: {
          tenantId,
          equipmentId: draft.equipmentId,
          eventType: "WORK_ORDER_COMPLETED",
        },
      })) === 1,
  );
  evidence.push({
    case: "real Identity login, in-term exclusion, estimate/customer approval; warranty remains active",
    status: "PASS",
  });

  // Lost response after Maintenance commit: the next request reuses the durable receipt.
  const lost = await registration("RESPONSE-LOSS"),
    lp = await call(
      "POST",
      A + `/equipment-registrations/${lost.id}/model-policies`,
      manager,
      { expectedVersion: lost.version },
      201,
    );
  const originalFetch = global.fetch;
  global.fetch = async function (input, init) {
    const response = await originalFetch(input, init);
    if (
      String(input).includes(
        `/internal/equipment-registrations/${lost.id}/maintenance-group`,
      ) &&
      init?.method === "PUT"
    )
      throw new Error("Injected lost response after remote commit");
    return response;
  };
  let pending;
  try {
    pending = await call(
      "POST",
      A + `/equipment-registrations/${lost.id}/submit`,
      manager,
      { expectedVersion: lp.version },
      202,
    );
  } finally {
    global.fetch = originalFetch;
  }
  assert.equal(pending.status, "PENDING_MAINTENANCE");
  assert.equal(
    await dbs.maintenance.maintenancePlan.count({
      where: { equipmentId: lost.equipmentId },
    }),
    2,
  );
  const resumes = await Promise.all(
    Array.from({ length: 4 }, () =>
      call(
        "POST",
        A + `/equipment-registrations/${lost.id}/resume`,
        manager,
        {},
      ),
    ),
  );
  assert.ok(resumes.every((r) => r.status === "COMPLETED"));
  assert.equal(
    await dbs.asset.equipmentHistory.count({
      where: {
        tenantId,
        referenceId: lost.id,
        eventType: "SERVICE_SETUP_COMPLETED",
      },
    }),
    1,
  );
  assert.ok(
    resumes.every(
      (r) =>
        JSON.stringify(r.maintenancePlanIds) ===
        JSON.stringify(resumes[0].maintenancePlanIds),
    ),
  );
  assert.equal(
    await dbs.asset.warranty.count({
      where: { equipmentId: lost.equipmentId },
    }),
    1,
  );
  assert.equal(
    await dbs.maintenance.maintenancePlan.count({
      where: { equipmentId: lost.equipmentId },
    }),
    2,
  );
  evidence.push({
    case: "lost remote response after commit + four parallel resumes: one Warranty and exactly two Plans",
    status: "PASS",
  });
  // Atomicity of N rules: fail the second INSERT without touching previously valid rows.
  const partial = await registration("ATOMIC-GROUP"),
    pp = await call(
      "POST",
      A + `/equipment-registrations/${partial.id}/model-policies`,
      manager,
      { expectedVersion: partial.version },
      201,
    );
  const constraint = "test_policy_" + randomUUID().replaceAll("-", "");
  await dbs.maintenance.$executeRawUnsafe(
    `ALTER TABLE maintenance_plans ADD CONSTRAINT ${constraint} CHECK (equipment_id <> '${partial.equipmentId}'::uuid OR name <> 'Annual service') NOT VALID`,
  );
  try {
    const failed = await call(
      "POST",
      A + `/equipment-registrations/${partial.id}/submit`,
      manager,
      { expectedVersion: pp.version },
      202,
    );
    assert.equal(failed.status, "PENDING_MAINTENANCE");
    assert.equal(
      await dbs.maintenance.maintenancePlan.count({
        where: { equipmentId: partial.equipmentId },
      }),
      0,
    );
    assert.equal(
      await dbs.maintenance.maintenanceSetupGroup.count({
        where: { registrationId: partial.id },
      }),
      0,
    );
  } finally {
    await dbs.maintenance.$executeRawUnsafe(
      `ALTER TABLE maintenance_plans DROP CONSTRAINT ${constraint}`,
    );
  }
  assert.equal(
    (
      await call(
        "POST",
        A + `/equipment-registrations/${partial.id}/resume`,
        manager,
        {},
      )
    ).maintenancePlanIds.length,
    2,
  );
  evidence.push({
    case: "second-rule failure rolls back the whole Maintenance group; retry recovers without a second Warranty",
    status: "PASS",
  });
  const overridden = await registration("OVERRIDE");
  await call(
    "POST",
    A + `/equipment-registrations/${overridden.id}/model-policies`,
    manager,
    { expectedVersion: overridden.version, durationMonths: 18 },
    400,
  );
  const op = await call(
    "POST",
    A + `/equipment-registrations/${overridden.id}/model-policies`,
    manager,
    {
      expectedVersion: overridden.version,
      durationMonths: 18,
      maintenanceOverrides: [
        { itemId: profile.rules[0].id, frequencyValue: 6, firstOccurrence: 1 },
      ],
      reason: "Customer maintenance agreement",
    },
    201,
  );
  assert.equal(op.policyPreview.warranty.endDate, "2027-07-30");
  assert.equal(
    op.policyPreview.maintenance.firstDueDates[0].date,
    "2026-07-31",
  );
  assert.equal(
    (
      await call(
        "POST",
        A + `/equipment-registrations/${overridden.id}/submit`,
        manager,
        { expectedVersion: op.version },
      )
    ).status,
    "COMPLETED",
  );
  await call(
    "POST",
    A + `/equipment-registrations/${b.id}/model-policies`,
    manager,
    { expectedVersion: previewB.version, policyPreview: {} },
    400,
  );
  await call(
    "POST",
    W + `/work-orders/${order.id}/checklist`,
    manager,
    { expectedVersion: 1, results: [] },
    403,
  );
  const completed = await call(
    "GET",
    M + `/maintenance-tasks/${order.maintenanceTaskId}`,
    customerToken,
  );
  assert.ok(completed.completionSummary);
  assert.ok(!JSON.stringify(completed).includes("Internal observation"));
  const candidate = await registration("RETIRED"),
    cp = await call(
      "POST",
      A + `/equipment-registrations/${candidate.id}/model-policies`,
      manager,
      { expectedVersion: candidate.version },
      201,
    );
  await call(
    "POST",
    wp + `/${w2.id}/retire`,
    manager,
    { expectedVersion: w2.version },
    201,
  );
  await call(
    "POST",
    A + `/equipment-registrations/${candidate.id}/submit`,
    manager,
    { expectedVersion: cp.version },
    409,
  );
  assert.equal(
    await dbs.asset.warranty.count({
      where: { equipmentId: candidate.equipmentId },
    }),
    0,
  );
  evidence.push({
    case: "reasoned overrides; forged source rejected; staff cannot execute technician checklist; customer summary excludes notes; retired preview cannot submit",
    status: "PASS",
  });
  const receiptDraft = await registration("BAD-RECEIPT");
  const rp = await call(
    "POST",
    A + `/equipment-registrations/${receiptDraft.id}/model-policies`,
    manager,
    { expectedVersion: receiptDraft.version, warrantyRevisionId: w.id },
    201,
  );
  global.fetch = async function (input, init) {
    const response = await originalFetch(input, init);
    if (
      String(input).includes(
        `/internal/equipment-registrations/${receiptDraft.id}/maintenance-group`,
      ) &&
      init?.method === "PUT"
    ) {
      const payload = await response.json();
      return new Response(
        JSON.stringify({ ...payload, inputHash: "0".repeat(64) }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    return response;
  };
  try {
    assert.equal(
      (
        await call(
          "POST",
          A + `/equipment-registrations/${receiptDraft.id}/submit`,
          manager,
          { expectedVersion: rp.version },
          202,
        )
      ).status,
      "PENDING_MAINTENANCE",
    );
  } finally {
    global.fetch = originalFetch;
  }
  await apps.asset.close();
  await start("asset");
  historyConsumer = apps.asset.get(
    assetReq(
      path.join(root, "apps/asset-service/dist/events/history.consumer.js"),
    ).HistoryConsumer,
  );
  const assetConfig = apps.asset.get(assetReq("@nestjs/config").ConfigService);
  assetConfig.set("MODEL_POLICIES_ENABLED", "false");
  try {
    await call(
      "POST",
      A + `/equipment-registrations/${b.id}/model-policies`,
      manager,
      { expectedVersion: previewB.version },
      503,
    );
    assert.equal(
      (
        await call(
          "POST",
          A + `/equipment-registrations/${receiptDraft.id}/resume`,
          manager,
          {},
        )
      ).status,
      "COMPLETED",
    );
  } finally {
    assetConfig.set("MODEL_POLICIES_ENABLED", "true");
  }
  const concurrent = await call("POST", wp, manager, { body: warranty }, 201);
  const publishResults = await Promise.all(
    Array.from({ length: 3 }, () =>
      fetch(`http://127.0.0.1:${ports.gateway}${wp}/${concurrent.id}/publish`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: "Bearer " + manager,
        },
        body: JSON.stringify({ expectedVersion: concurrent.version }),
      }).then((r) => r.status),
    ),
  );
  assert.deepEqual(publishResults.sort(), [201, 409, 409]);
  assert.equal(
    await dbs.asset.modelWarrantyRevision.count({
      where: { tenantId, modelId: model.id, isDefault: true },
    }),
    1,
  );
  const covered = await call(
    "POST",
    S + "/service-requests",
    customerToken,
    {
      equipmentId: draft.equipmentId,
      type: "REPAIR",
      priority: "NORMAL",
      title: "Manufacturing fault",
      description: "Manufacturing fault verified",
    },
    201,
  );
  await call("POST", S + `/service-requests/${covered.id}/review`, manager, {});
  const cd = await call("GET", S + `/service-requests/${covered.id}`, manager);
  await call(
    "POST",
    S + `/service-requests/${covered.id}/warranty-assessment`,
    manager,
    {
      expectedVersion: cd.assessmentVersion,
      cause: "UNKNOWN",
      decision: "COVERED",
      reason: "Unknown cause",
    },
    400,
  );
  await call(
    "POST",
    S + `/service-requests/${covered.id}/warranty-assessment`,
    manager,
    {
      expectedVersion: cd.assessmentVersion,
      cause: "MANUFACTURING_DEFECT",
      decision: "COVERED",
      reason: "Verified manufacturing fault",
    },
  );
  await call("POST", S + `/service-requests/${covered.id}/accept`, manager, {});
  assert.equal(
    await dbs["service-request"].costEstimate.count({
      where: { requestId: covered.id },
    }),
    0,
  );
  const accident = await call(
    "POST",
    S + "/service-requests",
    customerToken,
    {
      equipmentId: draft.equipmentId,
      type: "REPAIR",
      priority: "NORMAL",
      title: "Accidental damage",
      description: "Cause is outside the configured manufacturing-defect scope",
    },
    201,
  );
  await call(
    "POST",
    S + `/service-requests/${accident.id}/review`,
    manager,
    {},
  );
  const ad = await call("GET", S + `/service-requests/${accident.id}`, manager);
  await call(
    "POST",
    S + `/service-requests/${accident.id}/warranty-assessment`,
    manager,
    {
      expectedVersion: ad.assessmentVersion,
      cause: "ACCIDENTAL_DAMAGE",
      decision: "COVERED",
      reason: "Must not cover a cause outside the policy",
    },
    422,
  );
  await call(
    "POST",
    S + `/service-requests/${accident.id}/warranty-assessment`,
    manager,
    {
      expectedVersion: ad.assessmentVersion,
      cause: "ACCIDENTAL_DAMAGE",
      decision: "NOT_COVERED",
      reason:
        "Verified accidental damage is outside the agreed manufacturing-defect scope",
    },
  );
  assert.ok(
    (
      await call("GET", S + `/service-requests/${accident.id}`, manager)
    ).allowedActions.includes("create-estimate"),
  );
  const secondCustomer = await call(
    "POST",
    "/api/organization/customers",
    manager,
    { code: "CUSTOMER-B", name: "Other customer" },
    201,
  );
  await fixtureUser(
    "CUSTOMER_ADMIN",
    tenantId,
    "other-customer@policy.test",
    secondCustomer.id,
  );
  const outsider = await login("other-customer@policy.test");
  await call(
    "GET",
    A + `/equipment/${draft.equipmentId}/applied-policies`,
    outsider,
    undefined,
    404,
  );
  await call("GET", wp, customerToken, undefined, 403);
  evidence.push({
    case: "forged receipt cannot complete; covered cause needs no estimate; UNKNOWN rejected; same-tenant customer isolation and draft privacy",
    status: "PASS",
  });
  if (process.env.MODEL_POLICY_BROWSER === "true") {
    const missingUiModel = await call(
      "POST",
      A + "/equipment-models",
      manager,
      {
        manufacturer: "UI fixture",
        modelCode: "UI-MISSING",
        name: "Model chưa cấu hình",
      },
      201,
    );
    const noneUiModel = await call(
      "POST",
      A + "/equipment-models",
      manager,
      {
        manufacturer: "UI fixture",
        modelCode: "UI-NONE",
        name: "Model không áp dụng dịch vụ",
      },
      201,
    );
    const nwPath = `${A}/equipment-models/${noneUiModel.id}/warranty-policies`,
      nmPath = `${M}/equipment-models/${noneUiModel.id}/maintenance-profiles`;
    const nw = await call(
      "POST",
      nwPath,
      manager,
      {
        body: {
          ...warranty,
          mode: "NONE",
          reason: "Không bảo hành theo thỏa thuận",
        },
      },
      201,
    );
    await call(
      "POST",
      nwPath + `/${nw.id}/publish`,
      manager,
      { expectedVersion: nw.version },
      201,
    );
    const nm = await call(
      "POST",
      nmPath,
      manager,
      {
        body: {
          ...profile,
          mode: "NONE",
          reason: "Không bảo trì định kỳ theo thỏa thuận",
          rules: [],
        },
      },
      201,
    );
    await call(
      "POST",
      nmPath + `/${nm.id}/publish`,
      manager,
      { expectedVersion: nm.version },
      201,
    );
    const legacyUiDraft = await call(
      "POST",
      A + "/equipment-registrations",
      manager,
      {
        equipment: {
          mode: "NEW",
          data: {
            modelId: model.id,
            customerId: customer.id,
            customerSiteId: site.id,
            assetCode: "UI-LEGACY",
            serialNumber: "UI-LEGACY",
            handoverDate: "2026-01-31",
          },
        },
        warranty: {
          mode: "CREATE",
          startDate: "2026-01-31",
          endDate: "2027-01-30",
          warrantyType: "STANDARD",
          terms: "Legacy agreed warranty terms",
        },
        maintenance: {
          mode: "NONE",
          reason: "Legacy handover without maintenance",
        },
      },
      201,
      { "Idempotency-Key": randomUUID() },
    );
    const legacyUi = await call(
      "POST",
      A + `/equipment-registrations/${legacyUiDraft.id}/submit`,
      manager,
      { expectedVersion: legacyUiDraft.version },
    );
    assert.equal(legacyUi.status, "COMPLETED");
    await require("./test-model-policies-browser.cjs")({
      root,
      ports,
      tenantCode: tenantCodeA,
      password,
      modelId: model.id,
      registrationId: draft.id,
      customerId: customer.id,
      siteId: site.id,
      missingModelId: missingUiModel.id,
      noneModelId: noneUiModel.id,
      legacyRegistrationId: legacyUi.id,
      orderId: order.id,
      equipmentId: draft.equipmentId,
      requestId: sr.id,
    });
  }
  if (process.env.MODEL_POLICY_ANDROID === "true") {
    await scheduler.tick("2026-07-31", tenantId);
    await drain(
      async () =>
        (await dbs.workorder.workOrder.count({
          where: {
            tenantId,
            equipmentId: draft.equipmentId,
            maintenanceTaskId: { not: null },
            status: "CREATED",
          },
        })) > 0,
    );
    const mobileOrder = await dbs.workorder.workOrder.findFirstOrThrow({
      where: {
        tenantId,
        equipmentId: draft.equipmentId,
        maintenanceTaskId: { not: null },
        status: "CREATED",
      },
    });
    await call("POST", W + `/work-orders/${mobileOrder.id}/assign`, manager, {
      technicianId: technician.id,
    });
    const { spawn } = require("node:child_process");
    const child = spawn(
      "python3",
      [path.join(root, "apps/mobile/tool/model_policy_android.py")],
      {
        env: {
          ...process.env,
          POLICY_TEST_TENANT: tenantCodeA,
          POLICY_TEST_PASSWORD: password,
          POLICY_TEST_ORDER: mobileOrder.workOrderNo,
          POLICY_TEST_GATEWAY: String(ports.gateway),
        },
        stdio: "inherit",
      },
    );
    const code = await new Promise((resolve) => child.once("exit", resolve));
    assert.equal(code, 0, "Android UAT");
    assert.equal(
      (await call("GET", W + `/work-orders/${mobileOrder.id}`, manager)).status,
      "COMPLETED",
    );
  }
  // Independent quarterly and annual rules both remain due on the anniversary.
  await scheduler.tick("2027-01-31", tenantId);
  const anniversaryTasks = await dbs.maintenance.maintenanceTask.findMany({
    where: {
      maintenancePlanId: { in: done.maintenancePlanIds },
      scheduledDate: new Date("2027-01-31"),
    },
  });
  assert.equal(anniversaryTasks.length, 2);
  await drain(
    async () =>
      (await dbs.workorder.workOrder.count({
        where: {
          tenantId,
          maintenanceTaskId: { in: anniversaryTasks.map((t) => t.id) },
        },
      })) === 2,
  );
  const cancelled = await dbs.workorder.workOrder.findFirstOrThrow({
    where: { tenantId, maintenanceTaskId: anniversaryTasks[0].id },
  });
  await call("POST", W + `/work-orders/${cancelled.id}/assign`, manager, {
    technicianId: technician.id,
  });
  await call("POST", W + `/work-orders/${cancelled.id}/accept`, tech, {});
  const checkItem = cancelled.checklist[0];
  await call("POST", W + `/work-orders/${cancelled.id}/checklist`, tech, {
    expectedVersion: 0,
    results: [
      { itemId: checkItem.id, status: "DONE", note: "Old assignment evidence" },
    ],
  });
  const tech2User = await fixtureUser(
    "TECHNICIAN",
    tenantId,
    "technician2@policy.test",
  );
  const technician2 = await call(
    "POST",
    W + "/technicians",
    manager,
    {
      userId: tech2User.id,
      branchId: branch.id,
      employeeCode: "POLICY-TECH-2",
    },
    201,
  );
  await call("POST", W + `/work-orders/${cancelled.id}/assign`, manager, {
    technicianId: technician2.id,
  });
  await call(
    "POST",
    W + `/work-orders/${cancelled.id}/checklist`,
    tech,
    { expectedVersion: 1, results: [] },
    403,
  );
  const audit = await call(
    "GET",
    W + `/work-orders/${cancelled.id}/checklist/history`,
    manager,
  );
  assert.equal(audit.items.length, 1);
  assert.equal(audit.items[0].actorId, techUser.id);
  await call("POST", W + `/work-orders/${cancelled.id}/cancel`, manager, {
    reason: "Reschedule annual visit",
  });
  await drain(
    async () =>
      (await dbs.maintenance.maintenanceTask.count({
        where: { id: cancelled.maintenanceTaskId, status: "PENDING" },
      })) === 1,
  );
  const replacementRequest = { requestId: randomUUID() };
  const replacement = await call(
    "POST",
    M + `/maintenance-tasks/${cancelled.maintenanceTaskId}/replacement`,
    manager,
    replacementRequest,
    201,
  );
  const replacementReplay = await call(
    "POST",
    M + `/maintenance-tasks/${cancelled.maintenanceTaskId}/replacement`,
    manager,
    replacementRequest,
    201,
  );
  assert.equal(
    replacement.replacementWorkOrderId,
    replacementReplay.replacementWorkOrderId,
  );
  await drain(
    async () =>
      (await dbs.workorder.workOrder.count({
        where: { id: replacement.replacementWorkOrderId },
      })) === 1,
  );
  const fresh = await call(
    "GET",
    W + `/work-orders/${replacement.replacementWorkOrderId}`,
    manager,
  );
  assert.deepEqual(fresh.checklist, cancelled.checklist);
  assert.equal(fresh.checklistVersion, 0);
  assert.equal(fresh.checklistResults, null);
  let wn = await call(
    "POST",
    wp,
    manager,
    {
      body: {
        ...warranty,
        mode: "NONE",
        reason: "No warranty in this agreement",
      },
    },
    201,
  );
  await call(
    "POST",
    wp + `/${wn.id}/publish`,
    manager,
    { expectedVersion: wn.version },
    201,
  );
  let mn = await call(
    "POST",
    mp,
    manager,
    {
      body: {
        ...profile,
        mode: "NONE",
        reason: "No periodic maintenance in this agreement",
        rules: [],
      },
    },
    201,
  );
  await call(
    "POST",
    mp + `/${mn.id}/publish`,
    manager,
    { expectedVersion: mn.version },
    201,
  );
  const no = await registration("EXPLICIT-NONE"),
    np = await call(
      "POST",
      A + `/equipment-registrations/${no.id}/model-policies`,
      manager,
      { expectedVersion: no.version },
      201,
    );
  const noneDone = await call(
    "POST",
    A + `/equipment-registrations/${no.id}/submit`,
    manager,
    { expectedVersion: np.version },
  );
  assert.equal(noneDone.status, "COMPLETED");
  assert.equal(noneDone.warrantyId, null);
  assert.deepEqual(noneDone.maintenancePlanIds, []);
  const bare = await call(
      "POST",
      A + "/equipment-models",
      manager,
      {
        manufacturer: "No config",
        modelCode: "NO-CONFIG",
        name: "Unconfigured model",
      },
      201,
    ),
    bareDraft = await registration("MISSING-POLICY", bare.id);
  await call(
    "POST",
    A + `/equipment-registrations/${bareDraft.id}/model-policies`,
    manager,
    { expectedVersion: bareDraft.version },
    409,
  );
  evidence.push({
    case: "independent anniversary Tasks; assignment removal blocks old technician, preserves audit; replacement replay keeps frozen checklist with fresh results; NONE differs from missing configuration",
    status: "PASS",
  });
  await require('./test-maintenance-terms.cjs')({ call, A, M, manager, customerToken, other,
    warranty, item, registration, dbs, scheduler, tenantId, drain, evidence, root, ports, tenantCode: tenantCodeA, password });
  console.log(
    JSON.stringify(
      {
        status: "PASS",
        tenantId,
        references: {
          modelId: model.id,
          equipmentId: draft.equipmentId,
          registrationId: draft.id,
          planIds: done.maintenancePlanIds,
          warrantyRevisionId: w.id,
          maintenanceRevisionId: m.id,
          workOrderId: order.id,
          serviceRequestId: sr.id,
        },
        evidence,
        limits: [
          "No production database used",
          "Optional Browser/Android UAT runs only when the corresponding environment flag is true",
        ],
      },
      null,
      2,
    ),
  );
}
main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (bus) await bus.close().catch(() => {});
    for (const app of Object.values(apps).reverse())
      await app.close().catch(() => {});
    try {
      connection = await assetReq("amqplib").connect(broker);
      channel = await connection.createChannel();
      for (const suffix of [
        "workorder",
        "maintenance",
        "requests",
        "asset-history",
        "request-orders",
      ])
        for (const name of Object.values(
          subscriptionQueues(exchange + "." + suffix),
        ))
          await channel.deleteQueue(name);
      await channel.deleteExchange(exchange);
    } catch {
    } finally {
      if (connection) await connection.close().catch(() => {});
    }
  });

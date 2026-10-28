#!/usr/bin/env node
// Real Gateway verification for issue #33. The synthetic second-tenant and
// second-customer tokens exercise server-side scope without creating accounts.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { signTestAccessToken } = require("../../../packages/testing/dist");
const base = (process.env.GATEWAY_URL ?? "http://localhost:3000").replace(
  /\/$/,
  "",
);
const identityBase = (
  process.env.IDENTITY_SERVICE_URL ?? "http://localhost:3001"
).replace(/\/$/, "");
const password = process.env.SEED_DEMO_PASSWORD;
assert.ok(password, "SEED_DEMO_PASSWORD must be set in the local environment");
const tenant = "00000000-0000-4000-8000-000000000001";
const secondTenant = "00000000-0000-4000-8000-000000000009";
const customerOne = "00000000-0000-4000-8000-000000000101";
const customerTwo = "00000000-0000-4000-8000-000000000102";
const equipmentOne = "00000000-0000-4000-8000-000000001101";
const equipmentThree = "00000000-0000-4000-8000-000000001103";
const maintenanceOutage = process.argv.includes("--expect-maintenance-outage");

async function call(path, token, expected = 200, options = {}) {
  const response = await fetch(base + path, {
    ...options,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
    signal: AbortSignal.timeout(10000),
  });
  const data = await response.json().catch(() => ({}));
  assert.equal(
    response.status,
    expected,
    `${path}: expected ${expected}, got ${response.status} (${data.code ?? ""})`,
  );
  return data;
}

async function login(email) {
  // Existing M2 smoke scripts can exhaust the Gateway's shared login budget.
  const result = await fetch(identityBase + "/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ tenantCode: "DEMO", email, password }),
    signal: AbortSignal.timeout(10000),
  });
  assert.equal(
    result.status,
    200,
    `Identity login failed for ${email}: ${result.status}`,
  );
  const response = await result.json();
  assert.ok(response.accessToken);
  return response.accessToken;
}

const manager = await login("service.manager@demo.local");
const customerUser = await login("customer.user@demo.local");
const customerAdmin = await login("customer.admin@demo.local");
const otherTenant = signTestAccessToken({
  role: "SERVICE_MANAGER",
  tenantId: secondTenant,
  secret: process.env.JWT_ACCESS_SECRET,
});
const otherCustomer = signTestAccessToken({
  role: "CUSTOMER_USER",
  tenantId: tenant,
  customerId: customerTwo,
  secret: process.env.JWT_ACCESS_SECRET,
});

const dossier = await call(
  `/api/assets/equipment/${equipmentOne}/dossier`,
  manager,
);
assert.equal(dossier.equipment.id, equipmentOne);
assert.ok(dossier.timelinePreview.items.length <= 5);
for (const key of [
  "customer",
  "site",
  "contacts",
  "location",
  "requests",
  "workOrders",
  "maintenance",
  "maintenanceHistory",
]) {
  assert.ok(
    [
      "AVAILABLE",
      "RESTRICTED",
      "UNAVAILABLE",
      "NOT_CONFIGURED",
      "NOT_FOUND",
    ].includes(dossier[key].status),
    key,
  );
  if (dossier[key].status !== "AVAILABLE")
    assert.equal(dossier[key].data, null);
}
assert.equal(
  dossier.maintenance.status,
  maintenanceOutage ? "UNAVAILABLE" : "AVAILABLE",
);
for (const kind of ["service-requests", "work-orders"]) {
  const linked = await call(
    `/api/assets/equipment/${equipmentOne}/${kind}?page=1&pageSize=1`,
    manager,
  );
  assert.equal(linked.status, "AVAILABLE");
  assert.ok(linked.data.items.length <= 1);
  assert.ok(
    linked.data.items.every((item) => item.equipmentId === equipmentOne),
  );
}
if (!maintenanceOutage) {
  for (const kind of ["maintenance-plans", "maintenance-tasks"]) {
    const linked = await call(
      `/api/assets/equipment/${equipmentOne}/${kind}?page=1&pageSize=1`,
      manager,
    );
    assert.equal(linked.status, "AVAILABLE");
    assert.ok(linked.data.items.length <= 1);
  }
}
console.log(
  "PASS dossier preview, independent source statuses and maintenance availability",
);

if (process.argv.includes("--exercise-equipment-update")) {
  const original = dossier.equipment;
  const originalProfile = {
    displayName: original.displayName ?? null,
    technicalSpecifications: original.technicalSpecifications ?? null,
    commissionedDate: original.commissionedDate ?? null,
  };
  const patch = (token, body, expected = 200) =>
    call(`/api/assets/equipment/${equipmentOne}`, token, expected, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  const testDate =
    originalProfile.commissionedDate === "2025-01-01"
      ? "2025-01-02"
      : "2025-01-01";
  try {
    await patch(manager, {
      displayName: "Issue 33 equipment update check",
      technicalSpecifications: { issue33Verified: true },
      commissionedDate: testDate,
    });
    const updated = await call(
      `/api/assets/equipment/${equipmentOne}/dossier`,
      manager,
    );
    assert.equal(updated.equipment.displayName, "Issue 33 equipment update check");
    assert.equal(updated.equipment.technicalSpecifications.issue33Verified, true);
    assert.equal(updated.equipment.commissionedDate, testDate);
    await patch(
      manager,
      { operationalStatus: original.operationalStatus },
      400,
    );
    await patch(customerUser, { displayName: "Unauthorized change" }, 403);
    await patch(manager, {
      operationalStatus: original.operationalStatus,
      reason: "Issue 33 confirmation check",
      customerNote: "Confirmation test in local DEMO",
    });
    const confirmed = await call(
      `/api/assets/equipment/${equipmentOne}/dossier`,
      manager,
    );
    assert.ok(confirmed.operationalCondition.confirmedAt);
    assert.ok(
      confirmed.timelinePreview.items.some(
        (item) => item.eventType === "OPERATIONAL_STATUS_CONFIRMED",
      ),
    );
    console.log(
      "PASS equipment profile update, separate operational confirmation, reason and permission",
    );
  } finally {
    await patch(manager, originalProfile);
  }
}

const customerDossier = await call(
  `/api/assets/equipment/${equipmentOne}/dossier`,
  customerUser,
);
assert.equal(customerDossier.workOrders.status, "RESTRICTED");
assert.equal(customerDossier.workOrders.data, null);
assert.equal(customerDossier.maintenance.status, "RESTRICTED");
await call(
  `/api/assets/equipment/${equipmentThree}/dossier`,
  customerUser,
  404,
);
await call(`/api/assets/equipment/${equipmentOne}/dossier`, otherCustomer, 404);
assert.equal(
  (await call(`/api/assets/equipment/${equipmentThree}/dossier`, otherCustomer))
    .equipment.customerId,
  customerTwo,
);
await call(`/api/assets/equipment/${equipmentOne}/dossier`, otherTenant, 404);
assert.equal(
  (await call("/api/assets/equipment?pageSize=20", otherTenant)).total,
  0,
);
console.log(
  "PASS two customer scopes, second tenant token and CUSTOMER Work Order restriction",
);

const globalHistory = await call(
  "/api/assets/equipment-history?page=1&pageSize=1",
  manager,
);
assert.ok(globalHistory.total > 0 && globalHistory.items.length === 1);
if (globalHistory.total > 1) {
  const secondPage = await call(
    "/api/assets/equipment-history?page=2&pageSize=1",
    manager,
  );
  assert.notEqual(secondPage.items[0].id, globalHistory.items[0].id);
}
const timeline = await call(
  `/api/assets/equipment/${equipmentOne}/timeline?page=1&pageSize=20&sort=-occurredAt`,
  manager,
);
assert.ok(timeline.items.every((item) => item.equipmentId === equipmentOne));
const filtered = await call(
  `/api/assets/equipment-history?equipmentId=${equipmentOne}&page=1&pageSize=20`,
  manager,
);
assert.ok(filtered.items.every((item) => item.equipmentId === equipmentOne));
assert.equal(
  (
    await call(
      `/api/assets/equipment-history?equipmentId=${equipmentThree}`,
      customerUser,
    )
  ).total,
  0,
);
const model = await call(
  `/api/assets/equipment-models/${dossier.equipment.modelId}/history?page=1&pageSize=20`,
  manager,
);
assert.equal(model.model.id, dossier.equipment.modelId);
if (dossier.warranties.length) {
  const warranty = await call(
    `/api/assets/warranties/${dossier.warranties[0].id}/history?page=1&pageSize=20`,
    manager,
  );
  assert.equal(warranty.warranty.equipmentId, equipmentOne);
}
console.log(
  "PASS global, equipment, Model and Warranty history pagination/scope",
);

const orders = await call(
  `/api/workorders/work-orders?equipmentId=${equipmentOne}&pageSize=100`,
  manager,
);
assert.ok(orders.items.length > 0, "Run M2 week1/week2 smoke first");
const order =
  orders.items.find((item) => item.status === "COMPLETED") ?? orders.items[0];
const orderDetail = await call(
  `/api/assets/equipment/${equipmentOne}/work-orders/${order.id}`,
  manager,
);
assert.equal(orderDetail.status, "AVAILABLE");
assert.equal(orderDetail.data.workOrder.id, order.id);
for (const key of ["assignments", "history", "logs", "report"])
  assert.ok(orderDetail.data[key].status, key);
await call(`/api/workorders/work-orders/${order.id}`, customerUser, 403);
assert.equal(
  (
    await call(
      `/api/assets/equipment/${equipmentOne}/work-orders/${order.id}`,
      customerUser,
    )
  ).status,
  "RESTRICTED",
);
if (order.serviceRequestId) {
  const request = await call(
    `/api/assets/equipment/${equipmentOne}/service-requests/${order.serviceRequestId}`,
    manager,
  );
  assert.equal(request.status, "AVAILABLE");
  assert.ok(
    "warrantyCheck" in request.data && "calendarCoverageNow" in request.data,
  );
  assert.ok(Array.isArray(request.data.request.allowedActions));
  assert.equal(request.data.estimates.status, "AVAILABLE");
}
console.log(
  "PASS staff Work Order detail, source actions, Service Request snapshot and estimate revisions",
);

if (!maintenanceOutage) {
  const summary = await call("/api/maintenance/maintenance-summary", manager);
  assert.ok("nextDue" in summary && "overdueOpenTaskCount" in summary);
  const plans = await call(
    `/api/maintenance/maintenance-plans?equipmentId=${equipmentOne}&pageSize=20`,
    manager,
  );
  assert.ok(plans.items.length > 0, "Run Maintenance dev seed first");
  const planHistory = await call(
    `/api/maintenance/maintenance-plans/${plans.items[0].id}/history?page=1&pageSize=20`,
    manager,
  );
  assert.ok(Array.isArray(planHistory.items));
  const tasks = await call(
    `/api/maintenance/maintenance-tasks?equipmentId=${equipmentOne}&pageSize=20`,
    manager,
  );
  assert.ok(tasks.items.length > 0, "Run Maintenance scheduler tick first");
  const journey = await call(
    `/api/maintenance/maintenance-tasks/${tasks.items[0].id}/journey?page=1&pageSize=20`,
    manager,
  );
  assert.ok(
    Array.isArray(journey.workOrders) && Array.isArray(journey.replacements),
  );
  assert.ok(
    Array.isArray(journey.allowedActions) &&
      Array.isArray(journey.history.items),
  );
  await call("/api/maintenance/maintenance-summary", customerUser, 403);
  await call("/api/maintenance/maintenance-summary", customerAdmin);
  console.log(
    "PASS Maintenance Plan/Task/summary/journey and Customer Admin versus User permission",
  );

  if (process.argv.includes("--exercise-replacement")) {
    const task = tasks.items.find(
      (item) => item.status === "WORK_ORDER_CREATED" && item.workOrderId,
    );
    assert.ok(task, "A linked maintenance Work Order is required");
    await call(
      `/api/workorders/work-orders/${task.workOrderId}/cancel`,
      manager,
      200,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: "Issue 33 replacement verification" }),
      },
    );
    const journeyPath = `/api/maintenance/maintenance-tasks/${task.id}/journey`;
    let eligible;
    for (let attempt = 0; attempt < 40; attempt++) {
      eligible = await call(journeyPath, manager);
      if (eligible.allowedActions.includes("request-replacement")) break;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    assert.ok(
      eligible.allowedActions.includes("request-replacement"),
      "Maintenance did not authorize replacement after cancellation",
    );
    const requestId = randomUUID();
    await call(
      `/api/maintenance/maintenance-tasks/${task.id}/replacement`,
      manager,
      201,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ requestId }),
      },
    );
    let linked;
    for (let attempt = 0; attempt < 40; attempt++) {
      linked = await call(journeyPath, manager);
      if (
        linked.replacements.some(
          (item) => item.requestId === requestId && item.status === "LINKED",
        )
      )
        break;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    assert.ok(
      linked.replacements.some(
        (item) => item.requestId === requestId && item.status === "LINKED",
      ),
      "Replacement was not linked by Work Order consumer",
    );
    console.log(
      "PASS cancelled maintenance Work Order → allowed action → replacement linked",
    );
  }
}

#!/usr/bin/env node
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const gateway = (process.env.GATEWAY_URL ?? "http://localhost:3000").replace(
  /\/$/,
  "",
);
const tenantCode = process.env.TENANT_CODE ?? "DEMO";
const password = process.env.SEED_DEMO_PASSWORD;
if (!password) throw new Error("SEED_DEMO_PASSWORD is required");
const evidence = [];
async function call(method, path, { token, body, status = 200 } = {}) {
  const response = await fetch(gateway + path, {
    method,
    headers: {
      ...(token ? { authorization: "Bearer " + token } : {}),
      ...(body ? { "content-type": "application/json" } : {}),
      "x-correlation-id": "m2-week2-" + randomUUID(),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(10000),
  });
  const result = await response.json().catch(() => ({}));
  assert.ok(
    (Array.isArray(status) ? status : [status]).includes(response.status),
    `${method} ${path}: expected ${status}, got ${response.status}, code ${result.code ?? "unknown"}`,
  );
  return result;
}
const login = async (email) =>
  (
    await call("POST", "/api/identity/auth/login", {
      body: { tenantCode, email, password },
    })
  ).accessToken;
async function waitFor(path, token, status) {
  const deadline = Date.now() + 25000;
  do {
    const result = await call("GET", path, { token });
    if (result.status === status) return result;
    await new Promise((resolve) => setTimeout(resolve, 250));
  } while (Date.now() < deadline);
  throw new Error(
    `${path} did not reach ${status}; inspect relay/consumer and RabbitMQ`,
  );
}
async function main() {
  await call("GET", "/health");
  await call("GET", "/api/workorders/health");
  const manager = await login(
    process.env.MANAGER_EMAIL ?? "service.manager@demo.local",
  );
  const dispatcher = await login(
    process.env.DISPATCHER_EMAIL ?? "dispatcher@demo.local",
  );
  const technician = await login(
    process.env.TECHNICIAN_EMAIL ?? "technician@demo.local",
  );
  const customer = await login(
    process.env.CUSTOMER_EMAIL ?? "customer.user@demo.local",
  );
  let profile = await call("GET", "/api/workorders/technicians/me", {
    token: technician,
    status: [200, 404],
  });
  if (!profile.id) {
    const user = await call("GET", "/api/identity/auth/me", {
      token: technician,
    });
    const branches = await call(
      "GET",
      "/api/organization/branches?pageSize=100",
      { token: manager },
    );
    const branch = branches.items.find((b) => b.status === "ACTIVE");
    assert.ok(branch, "Seed an active branch");
    profile = await call("POST", "/api/workorders/technicians", {
      token: manager,
      status: 201,
      body: {
        userId: user.id,
        branchId: branch.id,
        employeeCode: "DEMO-TECH-01",
      },
    });
  }
  assert.ok(
    ["AVAILABLE", "BUSY"].includes(profile.status),
    "Demo technician must be AVAILABLE/BUSY",
  );
  const equipment = await call("GET", "/api/assets/equipment?pageSize=100", {
    token: customer,
  });
  let selected;
  for (const item of equipment.items.filter((e) => e.status !== "RETIRED")) {
    if (
      (
        await call("GET", `/api/assets/equipment/${item.id}/warranty-status`, {
          token: customer,
        })
      ).result === "IN_WARRANTY"
    ) {
      selected = item;
      break;
    }
  }
  assert.ok(selected, "Seed equipment in warranty");
  async function create() {
    const sr = await call("POST", "/api/service-requests", {
      token: customer,
      status: 201,
      body: {
        equipmentId: selected.id,
        type: "REPAIR",
        priority: "NORMAL",
        title: "M2 week 2 smoke",
        description: "Workflow integration evidence.",
      },
    });
    await call("POST", `/api/service-requests/${sr.id}/review`, {
      token: manager,
    });
    await call("POST", `/api/service-requests/${sr.id}/accept`, {
      token: manager,
    });
    const wo = await call("POST", "/api/workorders/work-orders", {
      token: manager,
      status: 201,
      body: { serviceRequestId: sr.id },
    });
    await waitFor(`/api/service-requests/${sr.id}`, customer, "PROCESSING");
    return { sr, wo };
  }
  const act = (wo, action, token, body) =>
    call("POST", `/api/workorders/work-orders/${wo.id}/${action}`, {
      token,
      body,
    });
  async function execute(result, customerAction) {
    const { sr, wo } = await create();
    await act(wo, "assign", dispatcher, { technicianId: profile.id });
    const jobs = await call("GET", "/api/workorders/work-orders?mine=true", {
      token: technician,
    });
    assert.ok(jobs.items.some((j) => j.id === wo.id));
    await act(wo, "accept", technician);
    await act(wo, "start-travel", technician);
    await act(wo, "start", technician);
    await act(wo, "hold", manager, { reason: "Smoke hold" });
    await act(wo, "resume", technician);
    const internal = "INTERNAL-" + randomUUID();
    await call("POST", `/api/workorders/work-orders/${wo.id}/logs`, {
      token: dispatcher,
      body: { note: internal },
      status: 201,
    });
    await act(wo, "complete", technician, {
      problemDescription: internal,
      rootCause: internal,
      solution: internal,
      result,
      customerSummary: "Equipment serviced; outcome " + result,
    });
    const expected = result === "UNRESOLVED" ? "ACCEPTED" : "RESOLVED";
    const view = await waitFor(
      `/api/service-requests/${sr.id}`,
      customer,
      expected,
    );
    assert.equal(view.resolutionResult, result);
    assert.equal(view.resolvedWorkOrderNo, wo.workOrderNo);
    assert.equal(
      view.resolutionSummary,
      "Equipment serviced; outcome " + result,
    );
    assert.ok(!JSON.stringify(view).includes(internal));
    await call("GET", `/api/workorders/work-orders/${wo.id}/service-report`, {
      token: customer,
      status: 403,
    });
    const saved = await call(
      "GET",
      `/api/workorders/work-orders/${wo.id}/service-report`,
      { token: technician },
    );
    assert.equal(saved.customerSummary, view.resolutionSummary);
    if (customerAction)
      await call("POST", `/api/service-requests/${sr.id}/${customerAction}`, {
        token: customer,
        body:
          customerAction === "reopen"
            ? { reason: "Please revisit" }
            : undefined,
      });
    evidence.push({
      serviceRequestId: sr.id,
      workOrderId: wo.id,
      workOrderNo: wo.workOrderNo,
      result,
      customerAction: customerAction ?? null,
    });
    console.log(
      "PASS real workflow, safe summary and " +
        (customerAction ?? expected) +
        ": " +
        result,
    );
  }
  await execute("RESOLVED", "confirm");
  await execute("PARTIALLY_RESOLVED", "reopen");
  await execute("UNRESOLVED");
  for (const cancelServiceRequest of [false, true]) {
    const { sr, wo } = await create();
    await act(wo, "assign", dispatcher, { technicianId: profile.id });
    await act(wo, "accept", technician);
    if (cancelServiceRequest) await act(wo, "start", technician);
    await call("POST", `/api/service-requests/${sr.id}/cancel`, {
      token: manager,
      body: {},
      status: 409,
    });
    await act(wo, "cancel", manager, {
      reason: "Smoke cancellation",
      cancelServiceRequest,
    });
    await waitFor(
      `/api/service-requests/${sr.id}`,
      customer,
      cancelServiceRequest ? "CANCELLED" : "ACCEPTED",
    );
    evidence.push({
      serviceRequestId: sr.id,
      workOrderId: wo.id,
      workOrderNo: wo.workOrderNo,
      cancelServiceRequest,
    });
    console.log(
      "PASS WorkOrderCancelled.v2 cancelServiceRequest=" + cancelServiceRequest,
    );
  }
  console.log(JSON.stringify({ technicianId: profile.id, cases: evidence }));
}
main().catch((error) => {
  console.error("FAIL " + error.message);
  process.exitCode = 1;
});

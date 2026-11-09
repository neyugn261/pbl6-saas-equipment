// Full seed regression, deliberately destructive only to eight validated *_test_db databases.
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const { DemoRuntime, req, root } = require("./runtime.cjs");
const catalog = require("./catalog.cjs");
const { legacy } = require("./labels.cjs");
async function seed(args) {
  await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["scripts/demo/seed.cjs", "--test", ...args],
      { cwd: root, env: process.env, stdio: "inherit" },
    );
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0
        ? resolve()
        : reject(new Error("Demo integration seed failed")),
    );
  });
}
async function snapshot(urls) {
  const { Client } = req("identity")("pg");
  const result = {};
  for (const [name, url] of Object.entries(urls)) {
    const db = new Client({ connectionString: url });
    await db.connect();
    try {
      const { rows } = await db.query(
        "SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations' ORDER BY tablename",
      );
      result[name] = {};
      for (const { tablename } of rows) {
        if (
          [
            "auth_sessions",
            "recipient_bootstrap_users",
            "recipient_bootstrap_runs",
          ].includes(tablename)
        )
          continue;
        const q = '"' + tablename.replaceAll('"', '""') + '"';
        result[name][tablename] = (
          await db.query("SELECT count(*)::int AS n FROM " + q)
        ).rows[0].n;
      }
      if (name === "inventory")
        result[name].balances = (
          await db.query(
            "SELECT warehouse_id, part_id, quantity::text, min_quantity::text FROM stocks ORDER BY warehouse_id, part_id",
          )
        ).rows;
      if (name === "service-request")
        result[name].cases = (
          await db.query(
            "SELECT id, status, active_work_order_id FROM service_requests ORDER BY id",
          )
        ).rows;
      if (name === "workorder")
        result[name].orders = (
          await db.query("SELECT id, status FROM work_orders ORDER BY id")
        ).rows;
      if (name === "asset")
        result[name].warranties = (
          await db.query(
            "SELECT id, start_date::text, end_date::text FROM warranties ORDER BY id",
          )
        ).rows;
    } finally {
      await db.end();
    }
  }
  return result;
}
async function main() {
  const r = new DemoRuntime({ test: true });
  await seed(["--reset", "--strict"]);
  const before = await snapshot(r.urls);
  assert.equal(before.identity.users, 14);
  assert.equal(before.organization.customer_sites, 4);
  assert.equal(before.workorder.service_reports, 2);
  assert.equal(before.workorder.report_attachments, 2);
  assert.equal(before.workorder.work_order_attachments, 1);
  await seed(["--strict"]);
  assert.deepEqual(
    await snapshot(r.urls),
    before,
    "Rerun must preserve stock, cases, dates, histories, messages and catalogue counts",
  );
  // Change progress and stock through the real authorized APIs, then seed again.
  const edit = new DemoRuntime({ test: true });
  try {
    await edit.preflight();
    await edit.start();
    const login = async (email) =>
      (
        await edit.api("POST", "/api/identity/auth/login", null, {
          tenantCode: catalog.tenant.code,
          email,
          password: process.env.SEED_DEMO_PASSWORD,
        })
      ).accessToken;
    const manager = await login("service.manager@demo.local"),
      inventory = await login("inventory@demo.local");
    const requests = await edit.api(
      "GET",
      "/api/service-requests?q=" + encodeURIComponent(catalog.cases[1].title),
      manager,
    );
    const orders = await edit.api(
      "GET",
      "/api/workorders/work-orders?serviceRequestId=" + requests.items[0].id,
      manager,
    );
    await edit.api(
      "POST",
      "/api/workorders/work-orders/" + orders.items[0].id + "/hold",
      manager,
      { reason: "Operator paused this demo job" },
    );
    await edit.api(
      "POST",
      "/api/inventory/stock-transactions/receive",
      inventory,
      {
        warehouseId: catalog.warehouses[0].id,
        partId: catalog.parts[0].id,
        quantity: "1",
        note: "Operator added one part after initial seed",
      },
      201,
      { "Idempotency-Key": require("node:crypto").randomUUID() },
    );
    const intake = await edit.api(
      "GET",
      "/api/service-requests?q=" + encodeURIComponent(catalog.cases[0].title),
      manager,
    );
    await edit.api(
      "POST",
      "/api/service-requests/" + intake.items[0].id + "/review",
      manager,
      {},
    );
    await edit.idle();
    // Existing installations still have the original labels. Emulate those exact values
    // on the test DBs, together with an operator's custom part name.
    const tenantId = catalog.tenant.id;
    await edit.dbs.identity.tenantDirectory.update({
      where: { tenantId },
      data: { code: legacy.tenant.code },
    });
    await edit.dbs.organization.tenant.update({
      where: { id: tenantId },
      data: { code: legacy.tenant.code, name: legacy.tenant.name },
    });
    await edit.dbs.organization.customer.update({
      where: { id: catalog.customers[0].id },
      data: { code: legacy.customers[0].code, name: legacy.customers[0].name },
    });
    await edit.dbs.inventory.part.update({
      where: { id: catalog.parts[0].id },
      data: {
        sku: legacy.parts[0].sku,
        name: "Lõi lọc theo tiêu chuẩn nội bộ",
      },
    });
    await edit.dbs.inventory.warehouse.update({
      where: { id: catalog.warehouses[0].id },
      data: { code: legacy.warehouses[0].code },
    });
    await edit.dbs.workorder.technician.update({
      where: { id: catalog.technicians[0].id },
      data: { employeeCode: legacy.technicians[0].employeeCode },
    });
    await edit.dbs["service-request"].serviceRequest.update({
      where: { id: requests.items[0].id },
      data: { title: legacy.cases[1].title },
    });
  } finally {
    await edit.close();
  }
  const edited = await snapshot(r.urls);
  await seed([]);
  assert.deepEqual(
    await snapshot(r.urls),
    edited,
    "Seed must preserve a paused job and operator stock receipts",
  );
  const { Client } = req("identity")("pg");
  for (const [service, query, expected] of [
    [
      "identity",
      "SELECT code AS value FROM tenant_directory",
      catalog.tenant.code,
    ],
    [
      "organization",
      "SELECT code AS value FROM customers WHERE id = $1",
      catalog.customers[0].code,
    ],
    [
      "inventory",
      "SELECT sku AS value FROM parts WHERE id = $1",
      catalog.parts[0].sku,
    ],
    [
      "inventory",
      "SELECT name AS value FROM parts WHERE id = $1",
      "Lõi lọc theo tiêu chuẩn nội bộ",
    ],
    [
      "workorder",
      "SELECT employee_code AS value FROM technicians WHERE id = $1",
      catalog.technicians[0].employeeCode,
    ],
  ]) {
    const db = new Client({ connectionString: r.urls[service] });
    await db.connect();
    try {
      const id =
        service === "organization"
          ? catalog.customers[0].id
          : service === "workorder"
            ? catalog.technicians[0].id
            : catalog.parts[0].id;
      assert.equal(
        (await db.query(query, query.includes("$1") ? [id] : [])).rows[0].value,
        expected,
      );
    } finally {
      await db.end();
    }
  }
  console.log(
    "PASS: clean reset, 14 logins, two-branch workflows, real broker/MinIO, legacy label upgrade, three seed runs and preservation of review/paused work, stock and custom names",
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

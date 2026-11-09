// Full seed regression, deliberately destructive only to eight validated *_test_db databases.
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const { DemoRuntime, req, root } = require("./runtime.cjs");
const catalog = require("./catalog.cjs");
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
          tenantCode: "DEMO",
          email,
          password: process.env.SEED_DEMO_PASSWORD,
        })
      ).accessToken;
    const manager = await login("service.manager@demo.local"),
      inventory = await login("inventory@demo.local");
    const requests = await edit.api(
      "GET",
      "/api/service-requests?q=DEMO-HCM-INPROGRESS",
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
    await edit.idle();
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
  console.log(
    "PASS: clean reset, 14 logins, two-branch workflows, customer isolation, real broker/MinIO, three seed runs and operator progress preservation",
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

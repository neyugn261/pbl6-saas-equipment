const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const path = require("node:path");
const { DemoRuntime, names, req, run, root } = require("./runtime.cjs");
const catalog = require("./catalog.cjs");
const A = "/api/assets",
  W = "/api/workorders",
  M = "/api/maintenance",
  I = "/api/inventory",
  S = "/api/service-requests";

function pdf(text) {
  const stream = `BT /F1 12 Tf 45 750 Td (${text.replace(/[()\\]/g, "")}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  ];
  let output = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, i) => {
    offsets.push(Buffer.byteLength(output));
    output += `${i + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(output);
  output += `xref\n0 6\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((n) => String(n).padStart(10, "0") + " 00000 n \n")
    .join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(output);
}
async function seed(options = {}) {
  const r = new DemoRuntime(options);
  const sessions = new Map();
  const api = (...args) => r.api(...args);
  const token = (email) => {
    assert.ok(sessions.has(email), "Missing demo session: " + email);
    return sessions.get(email).accessToken;
  };
  const manager = (branch) =>
    token(
      branch === "HCM"
        ? "service.manager@demo.local"
        : "service.manager.dn@demo.local",
    );
  const inventory = (branch) =>
    token(
      branch === "HCM" ? "inventory@demo.local" : "inventory.dn@demo.local",
    );
  const customer = (eq) =>
    token(
      catalog.equipment.find((e) => e.id === eq).customerId ===
        catalog.customers[0].id
        ? "customer.admin@demo.local"
        : "factory.admin@demo.local",
    );
  const ownerSeed = (service, ...args) =>
    run(["--dir", "apps/" + service + "-service", ...args]);
  let successful = false;
  try {
    await r.preflight();
    for (const name of names)
      process.env[name.replaceAll("-", "_").toUpperCase() + "_DATABASE_URL"] =
        r.urls[name];
    await run(["db:migrate"]);
    if (options.reset) await r.reset();
    await r.start();
    console.log("1/6 Identity and Organization");
    await ownerSeed("identity", "exec", "prisma", "db", "seed", "--", "--dev");
    await ownerSeed("organization", "exec", "prisma", "db", "seed");
    await ownerSeed("identity", "recipient:bootstrap", catalog.tenant.id);
    await r.idle();
    for (const u of catalog.users) {
      const login = await api("POST", "/api/identity/auth/login", null, {
        ...(u.userType === "PLATFORM_STAFF"
          ? {}
          : { tenantCode: catalog.tenant.code }),
        email: u.email,
        password: process.env.SEED_DEMO_PASSWORD,
      });
      sessions.set(u.email, login);
    }
    const admin = token("tenant.admin@demo.local");
    console.log("2/6 Equipment, QR and model policies");
    await ownerSeed("asset", "exec", "prisma", "db", "seed");
    r.state.markers ||= {};
    for (const eq of catalog.equipment) {
      const mark = "qr:" + eq.id;
      if (!r.state.markers[mark]) {
        const row = await api("GET", A + "/equipment/" + eq.id, manager("HCM"));
        if (!row.hasActiveQr)
          await api(
            "POST",
            A + "/equipment/" + eq.id + "/qr-codes",
            manager("HCM"),
            {},
            201,
          );
        r.state.markers[mark] = true;
        r.save();
      }
    }
    for (const model of catalog.models) {
      const wp = `${A}/equipment-models/${model.id}/warranty-policies`;
      const mp = `${M}/equipment-models/${model.id}/maintenance-profiles`;
      for (const [route, body] of [
        [
          wp,
          {
            mode: "APPLY",
            name: `DEMO-${model.modelCode} — Bảo hành tiêu chuẩn`,
            terms: "Bảo hành lỗi kỹ thuật do nhà sản xuất.",
            reason: "",
            durationMonths: 12,
            coveredCauses: ["MANUFACTURING_DEFECT"],
            exclusions: [
              { code: "MISUSE", text: "Không bao gồm hư hỏng do sử dụng sai." },
            ],
          },
        ],
        [
          mp,
          {
            mode: "APPLY",
            name: `DEMO-${model.modelCode} — Bảo trì định kỳ`,
            terms: "Kiểm tra định kỳ mỗi ba tháng.",
            reason: "",
            rules: [
              {
                id: catalog.id(model.modelCode === "US-100" ? 6001 : 6002),
                name: "Kiểm tra và vệ sinh",
                frequencyUnit: "MONTH",
                frequencyValue: 3,
                firstOccurrence: 1,
                checklist: [
                  "Kiểm tra nguồn điện và an toàn",
                  "Vệ sinh và kiểm tra bộ lọc",
                  "Chạy thử và ghi nhận kết quả",
                ].map((title, i) => ({
                  id: catalog.id(
                    (model.modelCode === "US-100" ? 6101 : 6201) + i,
                  ),
                  title,
                  action: "INSPECT",
                  instructions: title,
                  required: true,
                  allowNotApplicable: false,
                })),
              },
            ],
          },
        ],
      ]) {
        const policyMarker = "policy:" + route;
        if (r.state.markers[policyMarker]) continue;
        const rows = await api("GET", route, manager("HCM"));
        const existing = (Array.isArray(rows) ? rows : rows.items).find(
          (p) => p.body?.name === body.name,
        );
        if (existing && existing.status !== "DRAFT") {
          r.state.markers[policyMarker] = true; r.save(); continue;
        }
        const draft =
          existing || (await api("POST", route, manager("HCM"), { body }, 201));
        await api(
          "POST",
          `${route}/${draft.id}/publish`,
          manager("HCM"),
          { expectedVersion: draft.version },
          201,
        );
        r.state.markers[policyMarker] = true; r.save();
      }
    }
    console.log("3/6 Technicians, skills, warehouses and initial stock");
    await ownerSeed("workorder", "exec", "node", "scripts/seed-dev.cjs");
    await ownerSeed("inventory", "exec", "node", "dist/demo/seed-dev.js");
    for (const warehouse of catalog.warehouses)
      for (const part of catalog.parts) {
        const mark = "threshold:" + warehouse.id + ":" + part.id;
        if (r.state.markers[mark]) continue;
        await api(
          "PUT",
          `${I}/warehouses/${warehouse.id}/stocks/${part.id}`,
          token(warehouse.email),
          { minQuantity: part.minimum },
        );
        r.state.markers[mark] = true;
        r.save();
      }
    await r.idle();
    r.state.cases ||= {};
    const keyFor = (text) => {
      const bytes = createHash("sha256")
        .update("pbl6-demo-v2:" + text)
        .digest("hex")
        .slice(0, 32);
      return `${bytes.slice(0, 8)}-${bytes.slice(8, 12)}-4${bytes.slice(13, 16)}-8${bytes.slice(17, 20)}-${bytes.slice(20)}`;
    };
    const withKey = (text) => ({ "Idempotency-Key": keyFor(text) });
    async function attachment(order, kind, name, text, actor, visibility) {
      const listed = await api(
        "GET",
        `${W}/work-orders/${order.id}/${kind === "REPORT" ? "service-report/" : ""}attachments`,
        actor,
      );
      if (listed.items.some((a) => a.fileName === name)) return;
      const bytes = pdf(text),
        key = withKey("file:" + order.id + ":" + name);
      const upload = await api(
        "POST",
        `${W}/work-orders/${order.id}/${kind === "REPORT" ? "service-report/" : ""}attachment-uploads`,
        actor,
        {
          fileName: name,
          mimeType: "application/pdf",
          sizeBytes: bytes.length,
          checksumSha256: createHash("sha256").update(bytes).digest("hex"),
          visibility,
        },
        201,
        key,
      );
      const response = await fetch(upload.uploadUrl, {
        method: "PUT",
        headers: upload.headers,
        body: bytes,
        signal: AbortSignal.timeout(20000),
      }).catch((error) => {
        throw new Error(
          `MinIO upload to ${new URL(upload.uploadUrl).origin} failed (${error.cause?.code || error.name})`,
        );
      });
      assert.ok(response.ok, "MinIO demo file upload failed");
      await api(
        "POST",
        `${W}/attachment-uploads/${upload.uploadId}/complete`,
        actor,
        {},
        200,
        key,
      );
    }
    async function prepareCase(fixture) {
      const actor = manager(fixture.branch),
        portal = customer(fixture.equipmentId);
      const matches = await api(
        "GET",
        `${S}?q=${encodeURIComponent(fixture.key)}&pageSize=100`,
        admin,
      );
      let sr = matches.items.find((row) => row.title === fixture.title);
      const journal = r.state.cases[fixture.key];
      if (journal?.id) sr = await api("GET", S + "/" + journal.id, admin);
      // Existing cases belong to the presenter. Only a recorded interrupted seed is resumed.
      if (sr && journal?.done !== false) return sr;
      r.state.cases[fixture.key] = { id: sr?.id, done: false };
      r.save();
      if (!sr)
        sr = await api(
          "POST",
          S,
          portal,
          {
            equipmentId: fixture.equipmentId,
            type: "REPAIR",
            priority: fixture.target === "IN_PROGRESS" ? "HIGH" : "NORMAL",
            title: fixture.title,
            description:
              "Bộ dữ liệu demo: kiểm tra thiết bị, đánh giá bảo hành và xử lý theo chi nhánh phục vụ.",
          },
          201,
        );
      r.state.cases[fixture.key].id = sr.id; r.save();
      const srRoute = S + "/" + sr.id;
      if (fixture.target === "NEW") {
        r.state.cases[fixture.key] = { id: sr.id, done: true };
        r.save();
        return sr;
      }
      if (sr.status === "NEW")
        sr = await api("POST", srRoute + "/review", actor, {});
      const eq = catalog.equipment.find((e) => e.id === fixture.equipmentId);
      if (eq.warranty !== "CURRENT") {
        const estimates = await api("GET", srRoute + "/estimates", actor);
        let estimate = (
          Array.isArray(estimates) ? estimates : estimates.items
        )[0];
        if (!estimate)
          estimate = await api(
            "POST",
            srRoute + "/estimates",
            actor,
            {
              currency: "VND",
              notes:
                "Dự toán sửa chữa ngoài bảo hành, khách hàng xác nhận trước khi thực hiện.",
              validUntil: catalog.dateOffset(r.state.date, 30),
              items: [
                {
                  itemType: "LABOR",
                  description: "Chẩn đoán và sửa chữa",
                  quantity: "1",
                  unitPrice: "500000",
                },
                {
                  itemType: "PART",
                  description: "Cầu chì thay thế",
                  quantity: "1",
                  unitPrice: "25000",
                },
                {
                  itemType: "TRAVEL",
                  description: "Di chuyển đến địa điểm khách hàng",
                  quantity: "1",
                  unitPrice: "100000",
                },
              ],
            },
            201,
          );
        if (estimate.status === "DRAFT")
          estimate = await api(
            "POST",
            `${S}/estimates/${estimate.id}/send`,
            actor,
            {},
          );
        if (fixture.target === "ESTIMATE") {
          r.state.cases[fixture.key] = { id: sr.id, done: true };
          r.save();
          return sr;
        }
        if (estimate.status === "SENT")
          await api(
            "POST",
            `${S}/estimates/${estimate.id}/approve`,
            portal,
            {},
          );
      } else if (sr.status === "REVIEWING")
        await api("POST", srRoute + "/accept", actor, {});
      let orders = await api(
        "GET",
        `${W}/work-orders?serviceRequestId=${sr.id}`,
        actor,
      );
      let order =
        orders.items[0] ||
        (await api(
          "POST",
          W + "/work-orders",
          actor,
          { serviceRequestId: sr.id },
          201,
        ));
      const techEmail =
        fixture.branch === "HCM"
          ? fixture.target === "IN_PROGRESS"
            ? "technician@demo.local"
            : "technician.hcm02@demo.local"
          : "technician.dn02@demo.local";
      const techToken = token(techEmail);
      const tech = await api("GET", W + "/technicians/me", techToken);
      if (order.status === "CREATED")
        order = await api(
          "POST",
          `${W}/work-orders/${order.id}/assign`,
          actor,
          { technicianId: tech.id },
        );
      if (order.status === "ASSIGNED")
        order = await api(
          "POST",
          `${W}/work-orders/${order.id}/accept`,
          techToken,
          {},
        );
      if (order.status === "ACCEPTED")
        order = await api(
          "POST",
          `${W}/work-orders/${order.id}/start`,
          techToken,
          {},
        );
      const woRoute = `${W}/work-orders/${order.id}`;
      const logs = await api("GET", woRoute + "/logs", actor);
      for (const note of [
        "DEMO: Đã kiểm tra và xác nhận hiện tượng tại thiết bị.",
        "DEMO: Đã thống nhất phương án xử lý với khách hàng.",
      ])
        if (
          !(Array.isArray(logs) ? logs : logs.items).some(
            (log) => log.note === note,
          )
        )
          await api("POST", woRoute + "/logs", actor, { note }, 201);
      if (fixture.target === "IN_PROGRESS") {
        await api(
          "POST",
          `${I}/work-orders/${order.id}/parts`,
          inventory("HCM"),
          {
            warehouseId: catalog.warehouses[0].id,
            partId: catalog.parts[0].id,
            quantity: "2",
            note: "Cấp bộ lọc cho ca đang xử lý HCM",
          },
          [200, 201],
          withKey(fixture.key + ":issue"),
        );
        await attachment(
          order,
          "WORK_ORDER",
          "kiem-tra-ky-thuat.pdf",
          "HCM pump inspection - internal technician notes.",
          actor,
          "INTERNAL",
        );
      } else {
        if (fixture.branch === "DN" && order.status !== "COMPLETED") {
          const issue = await api(
            "POST",
            `${I}/work-orders/${order.id}/parts`,
            inventory("DN"),
            {
              warehouseId: catalog.warehouses[1].id,
              partId: catalog.parts[1].id,
              quantity: "2",
              note: "Cấp cầu chì cho ca sửa máy bơm",
            },
            [200, 201],
            withKey(fixture.key + ":issue"),
          );
          const usages = await api(
            "GET",
            `${I}/work-orders/${order.id}/parts`,
            inventory("DN"),
          );
          const usage = (Array.isArray(usages) ? usages : usages.items)[0];
          assert.ok(issue && usage, "Issued demo part must have a usage");
          await api(
            "POST",
            `${I}/work-order-parts/${usage.id}/return`,
            inventory("DN"),
            {
              quantity: "1",
              condition: "GOOD",
              note: "Trả một cầu chì chưa sử dụng",
            },
            200,
            withKey(fixture.key + ":return"),
          );
        }
        if (order.status !== "COMPLETED")
          order = await api("POST", woRoute + "/complete", techToken, {
            problemDescription:
              fixture.branch === "HCM"
                ? "Nguồn cấp máy siêu âm không ổn định."
                : "Cầu chì bảo vệ máy bơm bị đứt.",
            rootCause: "Linh kiện xuống cấp sau thời gian vận hành.",
            solution:
              "Kiểm tra nguồn, thay linh kiện phù hợp và chạy thử an toàn.",
            result: "RESOLVED",
            customerSummary:
              "Thiết bị đã hoạt động ổn định sau sửa chữa và kiểm tra.",
          });
        if (fixture.branch === "DN") {
          const usages = await api(
            "GET",
            `${I}/work-orders/${order.id}/parts`,
            inventory("DN"),
          );
          const usage = (Array.isArray(usages) ? usages : usages.items)[0];
          const report = await api(
            "GET",
            woRoute + "/service-report",
            techToken,
          );
          await api(
            "POST",
            `${I}/work-order-parts/${usage.id}/confirm-use`,
            techToken,
            {
              quantity: "1",
              serviceReportId: report.id,
              customerReason: "Thay cầu chì bị đứt để khôi phục nguồn máy bơm.",
              removedPartDisposition: "RETURNED_TO_CUSTOMER",
              removedPartNote: "Đã bàn giao cầu chì hỏng cho khách hàng.",
            },
            [200, 201],
            withKey(fixture.key + ":use"),
          );
        }
        await r.wait(
          async () =>
            ["RESOLVED", "CLOSED"].includes(
              (await api("GET", srRoute, portal)).status,
            ),
          "request resolution",
        );
        if ((await api("GET", srRoute, portal)).status === "RESOLVED")
          await api("POST", srRoute + "/confirm", portal, {});
        await attachment(
          order,
          "REPORT",
          `bien-ban-${fixture.branch.toLowerCase()}.pdf`,
          `${fixture.branch} service report - repaired, tested and accepted by customer.`,
          actor,
          "CUSTOMER",
        );
      }
      r.state.cases[fixture.key] = {
        id: sr.id,
        workOrderId: order.id,
        done: true,
      };
      r.save();
      return sr;
    }
    console.log("4/6 Six service requests, estimates and repair Work Orders");
    for (const fixture of catalog.cases) await prepareCase(fixture);
    console.log(
      "5/6 Maintenance plans, real scheduler and registration history",
    );
    await ownerSeed("maintenance", "exec", "node", "scripts/seed-dev.cjs");
    if (!r.state.markers.scheduler) {
      const { SchedulerService } = req("maintenance")(
        path.join(
          root,
          "apps/maintenance-service/dist/scheduler/scheduler.service.js",
        ),
      );
      await r.apps.maintenance
        .get(SchedulerService)
        .tick(r.state.date, catalog.tenant.id);
      await r.wait(
        async () =>
          (
            await api("GET", M + "/maintenance-tasks?pageSize=100", admin)
          ).items.filter(
            (t) =>
              catalog.plans.some((p) => p.id === t.maintenancePlanId) &&
              t.workOrderId,
          ).length === 2,
        "two scheduled maintenance Work Orders",
      );
      const tasks = await api(
        "GET",
        M + "/maintenance-tasks?planId=" + catalog.plans[1].id,
        admin,
      );
      const orderId = tasks.items[0].workOrderId;
      const order = await api("GET", W + "/work-orders/" + orderId, admin);
      if (order.status === "CREATED") {
        const tech = await api(
          "GET",
          W + "/technicians/me",
          token("technician.dn01@demo.local"),
        );
        await api("POST", `${W}/work-orders/${orderId}/assign`, manager("DN"), {
          technicianId: tech.id,
        });
      }
      r.state.markers.scheduler = true;
      r.save();
    }
    // Two completed registrations reuse the delivered equipment and existing Plans.
    // They do not create extra equipment, warranties or maintenance schedules.
    for (const [i, plan] of catalog.plans.entries()) {
      const key = withKey("registration:" + plan.id),
        actor = manager(plan.branch);
      const list = await api(
        "GET",
        `${A}/equipment-registrations?createKey=${key["Idempotency-Key"]}`,
        actor,
      );
      let registration = list.items[0];
      if (!registration)
        registration = await api(
          "POST",
          A + "/equipment-registrations",
          actor,
          {
            equipment: { mode: "EXISTING", id: plan.equipmentId },
            warranty:
              i === 0
                ? { mode: "KEEP", warrantyId: catalog.id(1205) }
                : {
                    mode: "NONE",
                    reason: "Thiết bị được tiếp nhận dịch vụ ngoài bảo hành.",
                  },
            maintenance: { mode: "KEEP", planId: plan.id },
          },
          201,
          key,
        );
      if (registration.status === "DRAFT")
        await api(
          "POST",
          `${A}/equipment-registrations/${registration.id}/submit`,
          actor,
          { expectedVersion: registration.version },
          [200, 202],
        );
    }
    await r.idle();
    console.log(
      "6/6 Verify tenant, branch, customer, inventory and notifications",
    );
    const result = await verify(r, sessions, options.strict);
    r.state.complete = true;
    r.state.summary = result;
    r.save();
    successful = true;
    console.log(
      JSON.stringify(
        {
          status: "READY",
          ...result,
          accounts: catalog.users.map((u) => ({
            email: u.email,
            role: u.role,
            branch:
              catalog.branches.find((b) => b.id === u.branchId)?.code || null,
          })),
        },
        null,
        2,
      ),
    );
    return result;
  } finally {
    if (!successful)
      console.error(
        "Seed interrupted. Re-run demo:seed to resume recorded unfinished cases; completed cases are preserved.",
      );
    await r.close();
  }
}
async function verify(r, sessions, strict = false) {
  const api = (...args) => r.api(...args),
    get = (email) => sessions.get(email).accessToken;
  const admin = get("tenant.admin@demo.local");
  const [
    branches,
    customers,
    equipment,
    requests,
    orders,
    techs,
    parts,
    warehouses,
    stocks,
    plans,
    tasks,
  ] = await Promise.all([
    api("GET", "/api/organization/branches?pageSize=100", admin),
    api("GET", "/api/organization/customers?pageSize=100", admin),
    api("GET", A + "/equipment?pageSize=100", admin),
    api("GET", S + "?pageSize=100", admin),
    api("GET", W + "/work-orders?pageSize=100", admin),
    api("GET", W + "/technicians?pageSize=100", admin),
    api("GET", I + "/parts?pageSize=100", admin),
    api("GET", I + "/warehouses?pageSize=100", admin),
    api("GET", I + "/stocks?pageSize=100", admin),
    api("GET", M + "/maintenance-plans?pageSize=100", admin),
    api("GET", M + "/maintenance-tasks?pageSize=100", admin),
  ]);
  const counts = {
    branches: branches.total,
    customers: customers.total,
    equipment: equipment.total,
    requests: requests.total,
    workOrders: orders.total,
    technicians: techs.total,
    parts: parts.total,
    warehouses: warehouses.total,
    stocks: stocks.total,
    maintenancePlans: plans.total,
    maintenanceTasks: tasks.total,
  };
  const expected = {
    branches: 2,
    customers: 2,
    equipment: 6,
    requests: 6,
    workOrders: 5,
    technicians: 4,
    parts: 3,
    warehouses: 2,
    stocks: 6,
    maintenancePlans: 2,
    maintenanceTasks: 2,
  };
  for (const [key, value] of Object.entries(expected)) {
    if (strict) assert.equal(counts[key], value, key);
    else assert.ok(counts[key] >= value, key);
  }
  for (const [i, email] of [
    "service.manager@demo.local",
    "service.manager.dn@demo.local",
  ].entries()) {
    const actor = get(email),
      branch = catalog.branches[i];
    assert.equal(
      (await api("GET", "/api/organization/staff/me/branch", actor)).branch?.id,
      branch.id,
    );
    for (const route of [S, W + "/work-orders", I + "/warehouses"])
      assert.ok(
        (await api("GET", route + "?pageSize=100", actor)).items.every(
          (row) => row.branchId === branch.id,
        ),
      );
    const foreign = requests.items.find((row) => row.branchId !== branch.id);
    if (foreign) await api("GET", S + "/" + foreign.id, actor, undefined, 404);
    assert.ok(
      (await api("GET", "/api/notifications", actor)).total > 0,
      "Manager inbox must contain real notifications",
    );
  }
  const hospital = get("customer.admin@demo.local"),
    factory = get("factory.admin@demo.local");
  for (const [actor, customerId] of [
    [hospital, catalog.customers[0].id],
    [factory, catalog.customers[1].id],
  ]) {
    assert.ok(
      (await api("GET", A + "/equipment?pageSize=100", actor)).items.every(
        (eq) => eq.customerId === customerId,
      ),
    );
    const foreign = equipment.items.find((eq) => eq.customerId !== customerId);
    await api("GET", A + "/equipment/" + foreign.id, actor, undefined, 404);
  }
  if (strict) {
    const balances = [
      ["12.00", "20.00", "0.00"],
      ["8.00", "2.00", "6.00"],
    ];
    for (const [wi, warehouse] of catalog.warehouses.entries())
      for (const [pi, part] of catalog.parts.entries()) {
        const stock = stocks.items.find(
          (s) => s.warehouseId === warehouse.id && s.partId === part.id,
        );
        assert.equal(Number(stock.quantity).toFixed(2), balances[wi][pi]);
      }
    for (const fixture of catalog.cases) {
      const row = requests.items.find((s) => s.title === fixture.title);
      assert.equal(
        row.status,
        {
          NEW: "NEW",
          IN_PROGRESS: "PROCESSING",
          CLOSED: "CLOSED",
          ESTIMATE: "AWAITING_CUSTOMER_APPROVAL",
        }[fixture.target],
      );
    }
  }
  return { tenant: catalog.tenant.code, counts, date: r.state.date };
}
module.exports = { seed, verify, pdf };
if (require.main === module)
  seed({
    reset: process.argv.includes("--reset"),
    test: process.argv.includes("--test"),
    strict: process.argv.includes("--strict"),
  }).catch((error) => {
    console.error("Demo seed failed: " + error.message);
    process.exitCode = 1;
  });

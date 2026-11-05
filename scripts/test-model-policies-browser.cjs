/* Optional UAT against the real Gateway stack owned by test-model-policies.cjs.
   Install Playwright in a temporary directory; set PLAYWRIGHT_MODULE to its module path. */
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs/promises");
module.exports = async function ({
  root,
  ports,
  tenantCode,
  password,
  modelId,
  registrationId,
  customerId,
  siteId,
  missingModelId,
  noneModelId,
  legacyRegistrationId,
  orderId,
  equipmentId,
  requestId,
}) {
  const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
  const socket = require("node:net").createServer();
  await new Promise((r) => socket.listen(0, "127.0.0.1", r));
  const webPort = socket.address().port;
  await new Promise((r) => socket.close(r));
  const base = `http://127.0.0.1:${webPort}`;
  const server = spawn(
    "pnpm",
    [
      "--filter",
      "web",
      "dev",
      "--host",
      "127.0.0.1",
      "--port",
      String(webPort),
      "--strictPort",
    ],
    {
      cwd: root,
      detached: true,
      env: {
        ...process.env,
        GATEWAY_PROXY_TARGET: `http://127.0.0.1:${ports.gateway}`,
      },
      stdio: "ignore",
    },
  );
  let browser;
  const pages = [];
  const artifacts =
    process.env.POLICY_ARTIFACTS || "/tmp/pbl6-model-policy-uat";
  await fs.mkdir(artifacts, { recursive: true });
  try {
    for (let i = 0; i < 100; i++) {
      if (
        await fetch(base)
          .then((r) => r.ok)
          .catch(() => false)
      )
        break;
      await new Promise((r) => setTimeout(r, 200));
    }
    browser = await chromium.launch({ headless: true });
    async function login(email) {
      const context = await browser.newContext({
          viewport: { width: 1440, height: 1000 },
        }),
        page = await context.newPage();
      pages.push(page);
      await page.goto(base + "/login");
      await page.getByLabel("Mã doanh nghiệp").fill(tenantCode);
      await page.getByLabel("Email", { exact: true }).fill(email);
      await page.getByLabel("Mật khẩu", { exact: true }).fill(password);
      await page
        .getByRole("button", { name: "Đăng nhập", exact: true })
        .click();
      await page.waitForURL((url) => !url.pathname.includes("login"));
      return page;
    }
    const manager = await login("manager@policy.test");
    await manager.goto(`${base}/app/equipment-models/${modelId}`);
    const warranty = manager
      .locator("section.m1-card")
      .filter({
        has: manager.getByRole("heading", {
          name: "Chính sách bảo hành",
          exact: true,
        }),
      })
      .first();
    await warranty
      .getByLabel("Tên chính sách", { exact: true })
      .fill("Browser warranty revision");
    await warranty
      .getByLabel("Điều khoản cho khách hàng", { exact: true })
      .fill("Warranty created and published through the browser");
    await warranty
      .getByRole("button", { name: "Lưu bản nháp", exact: true })
      .click();
    await warranty.getByRole("status").filter({ hasText: "Đã lưu" }).waitFor();
    await warranty.getByRole("button", { name: /Công bố phiên bản/ }).click();
    await warranty
      .getByRole("status")
      .filter({ hasText: "Đã công bố" })
      .waitFor();
    assert.equal(
      await warranty.getByLabel("Tên chính sách", { exact: true }).isDisabled(),
      true,
    );
    await manager.screenshot({
      path: artifacts + "/web-model-policies.png",
      fullPage: true,
    });
    await manager.goto(`${base}/app/equipment-registrations/${registrationId}`);
    await manager
      .getByRole("heading", { name: "Áp dụng chính sách theo Model" })
      .waitFor();
    await manager.getByText("Bảo hành · v1", { exact: true }).waitFor();
    assert.ok(
      !(await manager.locator(".registration-summary").innerText()).includes(
        "Chưa xác định",
      ),
    );
    await manager.screenshot({
      path: artifacts + "/web-handover-applied.png",
      fullPage: true,
    });
    await manager.goto(
      `${base}/app/equipment-registrations/${legacyRegistrationId}`,
    );
    await manager
      .getByRole("heading", {
        name: "Chính sách đã ghi nhận trước đây",
        exact: true,
      })
      .waitFor();
    await manager
      .getByText("Legacy agreed warranty terms", { exact: false })
      .waitFor();
    assert.ok(
      (await manager.locator(".registration-summary").innerText()).includes(
        "STANDARD",
      ),
    );
    assert.equal(
      await manager
        .getByRole("button", { name: "Áp dụng chính sách Model", exact: true })
        .count(),
      0,
    );
    // New handovers use Model policies throughout the wizard, without manual CREATE/KEEP/NONE selectors.
    async function startHandover(selectedModel, prefix) {
      const serial =
        prefix + "-" + require("node:crypto").randomUUID().slice(0, 8);
      await manager.goto(`${base}/app/equipment-registrations/new`);
      await manager
        .getByLabel("Khách hàng", { exact: true })
        .selectOption(customerId);
      await manager
        .getByRole("combobox", { name: /Địa điểm đặt thiết bị/ })
        .selectOption(siteId);
      await manager
        .getByRole("button", { name: "Tiếp tục", exact: true })
        .click();
      await manager
        .getByLabel("Model thiết bị", { exact: true })
        .selectOption(selectedModel);
      await manager.getByLabel("Mã thiết bị *", { exact: true }).fill(serial);
      await manager.getByLabel("Serial *", { exact: true }).fill(serial);
      await manager
        .getByLabel("Ngày bàn giao thực tế", { exact: true })
        .fill("2026-01-31");
      const created = manager.waitForResponse(
        (r) =>
          r.request().method() === "POST" &&
          r.url().endsWith("/equipment-registrations"),
      );
      await manager
        .getByRole("button", { name: "Tiếp tục", exact: true })
        .click();
      const response = await created;
      assert.equal(response.status(), 201);
      const row = await response.json();
      await manager.waitForURL((url) =>
        url.pathname.endsWith("/equipment-registrations/" + row.id),
      );
      assert.equal(
        await manager
          .getByLabel("Cách áp dụng bảo hành", { exact: true })
          .count(),
        0,
      );
      assert.equal(
        await manager.getByLabel("Kế hoạch bảo trì", { exact: true }).count(),
        0,
      );
      assert.deepEqual(
        (
          await manager.locator(".registration-steps button").allTextContents()
        ).map((s) => s.trim()),
        ["1. Khách hàng", "2. Thiết bị", "3. Chính sách Model", "4. Xác nhận"],
      );
      return row;
    }
    const uiDraft = await startHandover(modelId, "UI-POLICY");
    await manager.getByRole("heading", { name: /Bảo hành · v/ }).waitFor();
    await manager.getByText("2026-04-30", { exact: false }).waitFor();
    assert.equal(
      await manager
        .getByLabel("Thời hạn bảo hành riêng (tháng)", { exact: true })
        .isVisible(),
      false,
    );
    await manager.evaluate(() => window.scrollTo(0, 0));
    await manager.screenshot({
      path: artifacts + "/web-handover-model-step.png",
      fullPage: true,
      animations: "disabled",
    });
    // Model configuration stays in the authenticated tab and returns to the pinned draft.
    const pagesBefore = manager.context().pages().length;
    let previewWrites = 0;
    const countPreview = (req) => {
      if (
        req.method() === "POST" &&
        req
          .url()
          .endsWith(`/equipment-registrations/${uiDraft.id}/model-policies`)
      )
        previewWrites++;
    };
    manager.on("request", countPreview);
    const configure = manager.getByRole("link", {
      name: "Xem / cấu hình chính sách Model",
      exact: true,
    });
    assert.equal(await configure.getAttribute("target"), null);
    await configure.click();
    await manager.waitForURL(
      (url) => url.pathname === `/app/equipment-models/${modelId}`,
    );
    await manager
      .getByRole("heading", { name: "Chính sách bảo hành", exact: true })
      .waitFor();
    assert.equal(manager.context().pages().length, pagesBefore);
    await manager
      .getByRole("link", { name: "← Quay lại hồ sơ bàn giao", exact: true })
      .click();
    await manager.waitForURL(
      (url) => url.pathname === `/app/equipment-registrations/${uiDraft.id}`,
    );
    await manager
      .getByRole("heading", {
        name: "Áp dụng chính sách theo Model",
        exact: true,
      })
      .waitFor();
    assert.equal(
      await manager
        .locator(".registration-steps [aria-current=step]")
        .innerText(),
      "3. Chính sách Model",
    );
    assert.equal(
      previewWrites,
      0,
      "Returning from configuration must keep the pinned policy preview",
    );
    manager.off("request", countPreview);
    console.log(
      "PASS Model configuration link: same tab, authenticated Model editor, return to original saved draft/policy step without replaying preview.",
    );
    // Response lost after the preview is committed: reconcile via GET, never create another equipment.
    let reapplyCount = 0;
    const previewPattern = `**/equipment-registrations/${uiDraft.id}/model-policies`;
    await manager.route(previewPattern, async (route) => {
      reapplyCount++;
      await route.fetch();
      await route.abort("failed");
    });
    await manager
      .getByRole("button", {
        name: "Lấy lại chính sách hiện hành từ Model",
        exact: true,
      })
      .click();
    await manager
      .getByRole("alert")
      .filter({ hasText: /Failed to fetch|kết quả|NetworkError/ })
      .waitFor();
    await manager.unroute(previewPattern);
    const readBack = manager.waitForResponse(
      (r) =>
        r.request().method() === "GET" &&
        r.url().endsWith(`/equipment-registrations/${uiDraft.id}`),
    );
    await manager
      .getByRole("button", { name: "Tải lại kết quả đã lưu", exact: true })
      .click();
    await readBack;
    assert.equal(reapplyCount, 1);
    // Change handover date: the old calendar must be replaced by a fresh server preview.
    await manager
      .getByRole("button", { name: "2. Thiết bị", exact: true })
      .click();
    await manager
      .getByLabel("Ngày bàn giao thực tế", { exact: true })
      .fill("2026-02-28");
    const dates = manager.waitForResponse(
      (r) =>
        r.request().method() === "PATCH" && r.url().includes("/equipment/"),
    );
    await manager
      .getByRole("button", { name: "Lưu các ngày thực tế", exact: true })
      .click();
    await dates;
    const revised = manager.waitForResponse(
      (r) =>
        r.request().method() === "POST" && r.url().endsWith("/model-policies"),
    );
    await manager
      .getByRole("button", { name: "Tiếp tục", exact: true })
      .click();
    const revisedBody = await (await revised).json();
    assert.equal(revisedBody.policyPreview.warranty.startDate, "2026-02-28");
    assert.equal(
      revisedBody.policyPreview.maintenance.firstDueDates[0].date,
      "2026-05-28",
    );
    await manager
      .getByRole("button", { name: "Tiếp tục", exact: true })
      .click();
    const submitted = manager.waitForResponse(
      (r) =>
        r.request().method() === "POST" &&
        r.url().endsWith(`/equipment-registrations/${uiDraft.id}/submit`),
    );
    await manager
      .getByRole("button", { name: "Hoàn tất ghi nhận", exact: true })
      .click();
    const applied = await (await submitted).json();
    assert.equal(applied.status, "COMPLETED");
    assert.equal(applied.maintenancePlanIds.length, 2);
    const missing = await startHandover(missingModelId, "UI-MISSING");
    await manager
      .getByRole("alert")
      .filter({ hasText: "Model chưa có đủ chính sách" })
      .waitFor();
    assert.equal(
      await manager
        .getByRole("button", { name: "Hoàn tất ghi nhận", exact: true })
        .count(),
      0,
    );
    // Tenant Admin sees policy setup but cannot fall back to manual maintenance or call preview.
    const tenantAdmin = await login("admin@policy.test");
    await tenantAdmin.goto(`${base}/app/equipment-registrations/${missing.id}`);
    await tenantAdmin
      .getByRole("button", { name: "3. Chính sách Model", exact: true })
      .click();
    await tenantAdmin
      .getByText("Service Manager áp dụng chính sách và xác nhận bàn giao.", {
        exact: false,
      })
      .waitFor();
    assert.equal(
      await tenantAdmin
        .getByRole("button", { name: "Áp dụng chính sách Model", exact: true })
        .count(),
      0,
    );
    const noDraft = await startHandover(noneModelId, "UI-NONE");
    await manager
      .getByText("Không bảo hành theo thỏa thuận", { exact: true })
      .waitFor();
    await manager
      .getByText("Không bảo trì định kỳ theo thỏa thuận", { exact: true })
      .waitFor();
    await manager
      .getByRole("button", { name: "Tiếp tục", exact: true })
      .click();
    const noneSubmitted = manager.waitForResponse(
      (r) =>
        r.request().method() === "POST" &&
        r.url().endsWith(`/equipment-registrations/${noDraft.id}/submit`),
    );
    await manager
      .getByRole("button", { name: "Hoàn tất ghi nhận", exact: true })
      .click();
    const noneApplied = await (await noneSubmitted).json();
    assert.equal(noneApplied.status, "COMPLETED");
    assert.equal(noneApplied.warrantyId, null);
    assert.deepEqual(noneApplied.maintenancePlanIds, []);
    await manager.setViewportSize({ width: 390, height: 844 });
    await manager.waitForFunction(
      () =>
        document.querySelector(".m1-sidebar").getBoundingClientRect().right <=
        0,
    );
    await manager.evaluate(() => window.scrollTo(0, 0));
    assert.ok(
      await manager.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 2,
      ),
      "Handover must fit mobile viewport",
    );
    await manager.screenshot({
      path: artifacts + "/web-handover-model-mobile.png",
      fullPage: true,
      animations: "disabled",
    });
    console.log(
      "PASS Model-only handover wizard: real create/preview/submit, date recomputation, response loss recovery, missing/explicit NONE policies, Tenant Admin permissions, mobile layout.",
    );

    const tech = await login("technician@policy.test");
    await tech.goto(`${base}/app/work-orders/${orderId}`);
    await tech
      .getByRole("heading", { name: "Checklist thực hiện", exact: true })
      .waitFor();
    const checklist = tech
      .locator("section.m1-card")
      .filter({
        has: tech.getByRole("heading", {
          name: "Checklist thực hiện",
          exact: true,
        }),
      })
      .first();
    await checklist.getByText("Inspect filter", { exact: false }).waitFor();
    assert.equal(
      await checklist
        .getByRole("button", { name: "Lưu kết quả checklist" })
        .isDisabled(),
      true,
    );
    await tech.screenshot({
      path: artifacts + "/web-checklist-completed.png",
      fullPage: true,
    });
    const customer = await login("customer@policy.test");
    await customer.goto(`${base}/portal/equipment/${equipmentId}`);
    await customer
      .getByRole("heading", { name: "Chính sách dịch vụ đã áp dụng" })
      .waitFor();
    await customer.getByText("Bảo hành · v1", { exact: true }).waitFor();
    assert.ok(
      !(await customer.locator("body").innerText()).includes(
        "Internal observation",
      ),
    );
    await customer.setViewportSize({ width: 390, height: 844 });
    assert.ok(
      await customer.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 2,
      ),
      "Customer dossier must fit mobile viewport",
    );
    await customer.screenshot({
      path: artifacts + "/web-customer-policy-mobile.png",
      fullPage: true,
    });
    await customer.goto(`${base}/portal/requests/${requestId}`);
    await customer
      .getByRole("heading", { name: "Phạm vi bảo hành của sự cố" })
      .waitFor();
    await customer.getByText(/Inspection confirms liquid ingress/).waitFor();
    console.log(
      "PASS Browser: real login; create/publish policy; immutable published form; technician checklist; customer version/assessment; responsive dossier.",
    );
  } catch (error) {
    for (let i = 0; i < pages.length; i++)
      await pages[i]
        .screenshot({ path: artifacts + `/failure-${i}.png`, fullPage: true })
        .catch(() => {});
    throw error;
  } finally {
    if (browser) await browser.close();
    try {
      process.kill(-server.pid, "SIGTERM");
    } catch {}
  }
};

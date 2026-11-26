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
    const nextStep = page => page.getByRole("button", { name: "Tiếp tục", exact: true });
    const chooseVersions = page => page.getByRole("button", { name: "Chọn phiên bản chính sách Model", exact: true });
    const apply = dialog => dialog.getByRole("button", { name: "Áp dụng", exact: true });
    const complete = page => page.getByRole("button", { name: "Hoàn tất ghi nhận", exact: true });
    await manager.goto(`${base}/app/equipment-models/${modelId}#section=warranty`);
    await manager.getByLabel("Phiên bản", { exact: true }).selectOption("");
    await manager.getByLabel("Tên chính sách", { exact: true }).fill("Browser warranty revision");
    await manager.getByLabel("Điều khoản cho khách hàng", { exact: true }).fill("Terms created through the browser");
    await manager.getByRole("button", { name: "Lưu và sử dụng", exact: true }).click();
    await manager.getByRole("button", { name: "Chỉnh sửa", exact: true }).waitFor();
    assert.equal(await manager.getByLabel("Tên chính sách", { exact: true }).isDisabled(), true);
    await manager.screenshot({ path: artifacts + "/web-model-policies.png", fullPage: true });

    await manager.goto(`${base}/app/equipment-registrations/${registrationId}`);
    await manager.getByRole("heading", { name: "Kiểm tra và gửi", exact: true }).waitFor();
    await manager.getByText("Phiên bản 1", { exact: true }).first().waitFor();
    assert.equal(await chooseVersions(manager).count(), 0);
    await manager.screenshot({ path: artifacts + "/web-handover-applied.png", fullPage: true });
    await manager.goto(`${base}/app/equipment-registrations/${legacyRegistrationId}`);
    await manager.getByText("Legacy agreed warranty terms", { exact: true }).waitFor();
    assert.equal(await chooseVersions(manager).count(), 0);

    async function selectModel(code) {
      await manager.getByPlaceholder("Tìm theo tên, mã model hoặc hãng sản xuất…").fill(code);
      await manager.getByRole("option", { name: new RegExp(code) }).click();
    }
    async function startHandover(modelCode, prefix) {
      const serial = prefix + "-" + require("node:crypto").randomUUID().slice(0, 8);
      await manager.goto(`${base}/app/equipment-registrations/new?customerId=${customerId}&siteId=${siteId}`);
      await nextStep(manager).click();
      await selectModel(modelCode);
      await manager.getByLabel("Mã thiết bị *", { exact: true }).fill(serial);
      await manager.getByLabel("Serial *", { exact: true }).fill(serial);
      await manager.getByLabel("Hình thức bàn giao", { exact: true }).selectOption("STORE");
      await manager.getByLabel(/Ngày bàn giao thực tế/).fill("2026-01-31");
      const created = manager.waitForResponse(r =>
        r.request().method() === "POST" && r.url().endsWith("/equipment-registrations"),
      );
      await nextStep(manager).click();
      const response = await created;
      assert.equal(response.status(), 201);
      const row = await response.json();
      await manager.waitForURL(url => url.pathname.endsWith("/equipment-registrations/" + row.id));
      await chooseVersions(manager).waitFor();
      assert.deepEqual(
        (await manager.locator(".registration-steps button").allTextContents()).map(text => text.trim()),
        ["1. Khách hàng", "2. Thiết bị", "3. Chính sách Model", "4. Kiểm tra và gửi"],
      );
      return row;
    }
    async function openVersions() {
      await chooseVersions(manager).click();
      const dialog = manager.getByRole("dialog");
      await dialog.getByLabel("Phiên bản bảo hành", { exact: true }).waitFor();
      await dialog.getByLabel("Phiên bản bảo trì", { exact: true }).waitFor();
      return dialog;
    }
    async function checkPolicyDialogLayout(dialog, stacked = false) {
      const layout = await dialog.evaluate(el => {
        const [warranty, maintenance] = el.querySelectorAll(".model-policy-summary > .sd-card");
        const left = warranty.getBoundingClientRect();
        const right = maintenance.getBoundingClientRect();
        return {
          width: el.getBoundingClientRect().width,
          noOuterScroll: el.scrollHeight <= el.clientHeight + 2,
          stacked: right.top >= left.bottom,
        };
      });
      assert.equal(layout.stacked, stacked);
      assert.ok(layout.noOuterScroll, "Only the dialog body should scroll");
      if (!stacked) assert.ok(layout.width >= 960, "Desktop dialog should open at its wide width");
    }
    async function submit(row) {
      await nextStep(manager).click();
      const review = manager.locator(".registration-review-container");
      await review.waitFor();
      assert.equal(await review.locator("input, select, textarea, button").count(), 0);
      assert.equal(await chooseVersions(manager).count(), 0);
      assert.equal(await manager.getByRole("button", { name: "Lưu bản nháp", exact: true }).count(), 0);
      const submitted = manager.waitForResponse(r =>
        r.request().method() === "POST" && r.url().endsWith(`/equipment-registrations/${row.id}/submit`),
      );
      await complete(manager).click();
      const result = await (await submitted).json();
      assert.equal(result.status, "COMPLETED");
      return result;
    }

    const uiDraft = await startHandover("X100", "UI-POLICY");
    const previewPattern = `**/equipment-registrations/${uiDraft.id}/model-policies`;
    let applies = 0;
    await manager.route(previewPattern, async route => {
      applies++;
      await route.fetch();
      await route.abort("failed");
    });
    let dialog = await openVersions();
    await checkPolicyDialogLayout(dialog);
    await apply(dialog).click();
    await dialog.getByRole("alert").filter({ hasText: /kết quả|NetworkError/ }).waitFor();
    await manager.unroute(previewPattern);
    await dialog.getByRole("button", { name: "Tải lại kết quả đã lưu", exact: true }).click();
    await dialog.waitFor({ state: "hidden" });
    assert.equal(applies, 1);

    await manager.getByRole("button", { name: "Điều chỉnh ngoại lệ", exact: true }).click();
    dialog = manager.getByRole("dialog");
    await checkPolicyDialogLayout(dialog);
    await dialog.getByLabel("Thời hạn bảo hành (tháng)", { exact: true }).fill("15");
    await dialog.getByLabel("Chu kỳ (tháng)", { exact: true }).fill("4");
    await dialog.getByLabel("Lý do ngoại lệ", { exact: true }).fill("Thỏa thuận riêng");
    await apply(dialog).click();
    await dialog.waitFor({ state: "hidden" });
    await manager.getByText("Lý do ngoại lệ: Thỏa thuận riêng", { exact: true }).waitFor();

    await manager.getByRole("button", { name: "2. Thiết bị", exact: true }).click();
    await selectModel("UI-NONE");
    await nextStep(manager).click();
    await manager.getByText("Chưa áp dụng chính sách cho hồ sơ này.", { exact: true }).waitFor();
    await manager.getByRole("button", { name: "2. Thiết bị", exact: true }).click();
    await selectModel("X100");
    await manager.getByLabel(/Ngày bàn giao thực tế/).fill("2026-02-28");
    await nextStep(manager).click();
    dialog = await openVersions();
    const revised = manager.waitForResponse(r =>
      r.request().method() === "POST" && r.url().endsWith("/model-policies"),
    );
    await apply(dialog).click();
    const revisedBody = await (await revised).json();
    assert.equal(revisedBody.policyPreview.warranty.startDate, "2026-02-28");
    assert.equal(revisedBody.policyPreview.maintenance.firstDueDates[0].date, "2026-05-28");
    assert.equal(revisedBody.policyPreview.overrideReason, "");
    const applied = await submit(uiDraft);
    assert.equal(applied.maintenancePlanIds.length, 2);

    const missing = await startHandover("UI-MISSING", "UI-MISSING");
    dialog = await openVersions();
    await dialog.getByText("Hồ sơ này sẽ không tạo bảo hành.", { exact: true }).waitFor();
    await dialog.getByText("Hồ sơ này sẽ không tạo lịch bảo trì định kỳ.", { exact: true }).waitFor();
    assert.equal(await apply(dialog).isDisabled(), false);
    await dialog.getByRole("button", { name: "Hủy", exact: true }).click();
    assert.equal(await complete(manager).count(), 0);

    const tenantAdmin = await login("admin@policy.test");
    await tenantAdmin.goto(`${base}/app/equipment-registrations/${missing.id}`);
    await tenantAdmin.getByRole("button", { name: "3. Chính sách Model", exact: true }).click();
    await tenantAdmin.getByText("Service Manager áp dụng chính sách và xác nhận bàn giao.", { exact: true }).waitFor();
    assert.equal(await chooseVersions(tenantAdmin).count(), 0);

    const noDraft = await startHandover("UI-NONE", "UI-NONE");
    await manager.setViewportSize({ width: 390, height: 844 });
    dialog = await openVersions();
    await dialog.getByText("Không bảo hành theo thỏa thuận", { exact: true }).waitFor();
    await dialog.getByText("Không bảo trì định kỳ theo thỏa thuận", { exact: true }).waitFor();
    await checkPolicyDialogLayout(dialog, true);
    assert.ok(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth + 2));
    await manager.screenshot({ path: artifacts + "/web-handover-model-mobile.png", animations: "disabled" });
    await apply(dialog).click();
    const noneApplied = await submit(noDraft);
    assert.equal(noneApplied.warrantyId, null);
    assert.deepEqual(noneApplied.maintenancePlanIds, []);
    console.log("PASS Handover: version selection, exceptions, draft model change, review, response recovery and mobile dialog.");

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

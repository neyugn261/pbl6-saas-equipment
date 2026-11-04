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
    const tech = await login("technician@policy.test");
    await tech.goto(`${base}/app/work-orders/${orderId}`);
    await tech
      .getByRole("heading", { name: "Checklist thực hiện", exact: true })
      .waitFor();
    await tech
      .getByText("Internal observation", { exact: false })
      .first()
      .waitFor({ state: "visible" })
      .catch(() => {});
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
  } finally {
    if (browser) await browser.close();
    try {
      process.kill(-server.pid, "SIGTERM");
    } catch {}
  }
};

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const net = require("node:net");
const { spawn } = require("node:child_process");
module.exports = async function runBranchBrowser(fixture) {
  const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
  const output =
    process.env.BRANCH_BROWSER_OUTPUT || "/tmp/pbl6-branch-browser/results";
  fs.mkdirSync(output, { recursive: true });
  const socket = net.createServer();
  await new Promise((resolve) => socket.listen(0, "127.0.0.1", resolve));
  const port = socket.address().port;
  await new Promise((resolve) => socket.close(resolve));
  const origin = `http://127.0.0.1:${port}`;
  const log = fs.openSync(path.join(output, "vite.log"), "w");
  const vite = spawn(
    "pnpm",
    [
      "--filter",
      "web",
      "dev",
      "--host",
      "127.0.0.1",
      "--port",
      String(port),
      "--strictPort",
    ],
    {
      cwd: fixture.root,
      detached: true,
      stdio: ["ignore", log, log],
      env: {
        ...process.env,
        GATEWAY_PROXY_TARGET: `http://127.0.0.1:${fixture.ports.gateway}`,
        VITE_GATEWAY_API_URL: "/gateway",
        VITE_IDENTITY_API_URL: "/gateway/api/identity",
      },
    },
  );
  let browser;
  const errors = [],
    checks = [];
  try {
    const deadline = Date.now() + 20000;
    while (true) {
      try {
        if ((await fetch(origin)).ok) break;
      } catch {}
      if (Date.now() > deadline) throw Error("Vite did not start");
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    browser = await chromium.launch({
      executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined,
      headless: true,
      args: ["--no-sandbox"],
    });
    async function login(email, viewport = { width: 1440, height: 1000 }) {
      const context = await browser.newContext({ viewport });
      const page = await context.newPage();
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(origin + "/login");
      await page
        .getByLabel("Mã doanh nghiệp", { exact: true })
        .fill(fixture.tenantCode);
      await page.getByLabel("Email", { exact: true }).fill(email);
      await page.getByLabel("Mật khẩu", { exact: true }).fill(fixture.password);
      await page
        .getByRole("button", { name: "Đăng nhập", exact: true })
        .click();
      await page.waitForURL((url) => !url.pathname.includes("login"));
      return { page, context };
    }
    const manager = await login(fixture.managerEmail);
    await manager.page
      .getByText("Chi nhánh làm việc:", { exact: false })
      .waitFor();
    assert.match(await manager.page.locator("main").innerText(), /Chi nhánh B/);
    await manager.page.goto(
      origin + `/app/service-requests/${fixture.foreignRequestId}`,
    );
    await manager.page.getByText("404", { exact: false }).first().waitFor();
    await manager.page.screenshot({
      path: path.join(output, "manager-foreign-request.png"),
      fullPage: true,
    });
    checks.push(
      "Manager branch notice and foreign-request error on real backend",
    );
    await manager.context.close();
    const admin = await login(fixture.adminEmail);
    await admin.page.goto(origin + "/app/organization/users");
    await admin.page
      .getByRole("row")
      .filter({ hasText: fixture.unassignedEmail })
      .getByRole("button", { name: "Chi nhánh chính", exact: true })
      .click();
    await admin.page
      .getByRole("combobox", { name: "Chi nhánh", exact: true })
      .selectOption(fixture.branchId);
    await admin.page
      .getByRole("button", { name: "Gán chi nhánh chính", exact: true })
      .click();
    await admin.page
      .getByText("Đã gán chi nhánh chính.", { exact: false })
      .waitFor();
    await admin.page.screenshot({
      path: path.join(output, "admin-primary-branch.png"),
      fullPage: true,
    });
    checks.push("Admin assigns a primary branch through live Organization API");
    await admin.page.goto(origin + "/app/organization/service-branches");
    const row = admin.page
      .locator("article")
      .filter({ hasText: fixture.queueRequestNo });
    await row.waitFor();
    await row
      .getByRole("combobox", { name: "Chi nhánh", exact: true })
      .selectOption(fixture.branchId);
    await row
      .getByRole("textbox", { name: "Lý do phân bổ", exact: true })
      .fill("Browser acceptance allocation");
    await row
      .getByRole("button", { name: "Phân bổ chi nhánh", exact: true })
      .click();
    await row.waitFor({ state: "detached" });
    await admin.page.screenshot({
      path: path.join(output, "admin-allocation.png"),
      fullPage: true,
    });
    checks.push(
      "Admin allocates an unrouted request; queue refreshes from backend",
    );
    await admin.page.setViewportSize({ width: 390, height: 844 });
    assert.ok(
      await admin.page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
      "Mobile layout overflows",
    );
    await admin.page.screenshot({
      path: path.join(output, "admin-mobile.png"),
      fullPage: true,
    });
    checks.push("390x844 allocation screen has no horizontal overflow");
    await admin.context.close();
    assert.deepEqual(errors, []);
    fs.writeFileSync(
      path.join(output, "results.json"),
      JSON.stringify({ status: "PASS", checks, pageErrors: errors }, null, 2),
    );
    return checks;
  } finally {
    await browser?.close();
    try {
      process.kill(-vite.pid, "SIGTERM");
    } catch {}
    fs.closeSync(log);
  }
};

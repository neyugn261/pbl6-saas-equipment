const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { randomUUID } = require('node:crypto');

module.exports = async function ({ root, ports, tenantCode, password, model, customer, site, call, A, manager, dbs, drain, evidence }) {
  const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
  const socket = net.createServer();
  await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  const base = `http://127.0.0.1:${port}`;
  const server = spawn('pnpm', ['--filter', 'web', 'dev', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
    cwd: root, detached: true, stdio: 'ignore', env: { ...process.env, GATEWAY_PROXY_TARGET: `http://127.0.0.1:${ports.gateway}` },
  });
  const artifacts = process.env.HANDOVER_ARTIFACTS || '/tmp/pbl6-handover-methods-uat';
  await fs.mkdir(artifacts, { recursive: true });
  let browser, staff, portal;
  const login = async (page, email) => {
    await page.goto(`${base}/login`);
    await page.getByLabel('Mã doanh nghiệp').fill(tenantCode);
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByLabel('Mật khẩu', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
    await page.waitForURL(url => !url.pathname.includes('login'));
  };
  try {
    for (let i = 0; i < 100; i++) {
      if (await fetch(base).then(r => r.ok).catch(() => false)) break;
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) });
    const staffContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    staff = await staffContext.newPage();
    await login(staff, 'manager@policy.test');
    const createInWizard = async method => {
      await staff.goto(`${base}/app/equipment-registrations/new?customerId=${customer.id}&siteId=${site.id}`);
      await staff.getByRole('button', { name: 'Tiếp tục', exact: true }).click();
      await staff.getByLabel('Model thiết bị', { exact: true }).selectOption(model.id);
      const code = `BROWSER-${randomUUID()}`;
      await staff.getByLabel('Mã thiết bị *', { exact: true }).fill(code);
      await staff.getByLabel('Serial *', { exact: true }).fill(code);
      await staff.getByLabel('Hình thức bàn giao', { exact: true }).selectOption(method);
      await staff.getByLabel('Ngày bàn giao thực tế', { exact: true }).fill('2026-04-01');
      if (method === 'STORE') {
        assert.equal(await staff.getByLabel('Ngày lắp đặt', { exact: true }).count(), 0);
        assert.equal(await staff.locator('nav.registration-steps button').count(), 4);
      } else {
        assert.equal(await staff.locator('nav.registration-steps button').count(), 5);
        await staff.getByLabel('Ngày lắp đặt', { exact: true }).fill('2026-04-02');
        await staff.getByLabel('Tình trạng khi bàn giao *', { exact: true }).fill('Đã kiểm tra serial và phụ kiện');
        await staff.getByLabel('Ghi chú cho khách hàng', { exact: true }).fill('Xác nhận cả ngày bàn giao và lắp đặt');
      }
      await staff.getByRole('button', { name: 'Tiếp tục', exact: true }).click();
      await staff.waitForURL(/\/app\/equipment-registrations\/[a-f\d-]{36}$/);
      const id = staff.url().split('/').at(-1);
      await staff.getByRole('button', { name: 'Tiếp tục', exact: true }).click();
      await staff.getByRole('heading', { name: 'Kiểm tra thông tin ghi nhận', exact: true }).waitFor();
      await staff.screenshot({ path: `${artifacts}/${method.toLowerCase()}-review.png`, fullPage: true });
      await staff.getByRole('button', { name: method === 'STORE' ? 'Hoàn tất ghi nhận' : 'Gửi khách xác nhận', exact: true }).click();
      await staff.getByText(method === 'STORE' ? 'Đã hoàn tất bàn giao' : 'Chờ khách hàng xác nhận', { exact: true }).first().waitFor();
      const row = await call('GET', `${A}/equipment-registrations/${id}`, manager);
      assert.equal(row.status, method === 'STORE' ? 'COMPLETED' : 'PENDING_CUSTOMER_CONFIRMATION');
      if (method === 'CUSTOMER_SITE') {
        await staff.getByRole('heading', { name: 'Chờ khách hàng xác nhận bàn giao', exact: true }).waitFor();
        assert.equal(await staff.getByRole('button', { name: 'Cập nhật trạng thái', exact: true }).isEnabled(), true);
      }
      await staff.screenshot({ path: `${artifacts}/${method.toLowerCase()}-result.png`, fullPage: true });
      return row;
    };
    await createInWizard('STORE');
    const onsite = await createInWizard('CUSTOMER_SITE');
    assert.equal(await dbs.maintenance.maintenancePlan.count({ where: { equipmentId: onsite.equipmentId } }), 0);
    const customerContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    portal = await customerContext.newPage();
    await login(portal, 'customer@policy.test');
    await portal.goto(`${base}/portal/equipment-handovers/${onsite.handoverId}`);
    await portal.getByText('Ngày lắp đặt: 2026-04-02', { exact: true }).waitFor();
    await portal.getByText('Ngày đưa vào vận hành: Chưa ghi nhận', { exact: true }).waitFor();
    await portal.screenshot({ path: `${artifacts}/customer-review.png`, fullPage: true });
    await portal.getByRole('button', { name: 'Chấp thuận', exact: true }).click();
    await portal.getByRole('dialog').getByRole('button', { name: 'Xác nhận', exact: true }).click();
    await drain(async () => (await dbs.asset.equipmentRegistration.findUniqueOrThrow({ where: { id: onsite.id } })).maintenanceProvisioning === 'READY');
    await staff.getByRole('button', { name: 'Cập nhật trạng thái', exact: true }).click();
    await staff.getByRole('heading', { name: 'Khách hàng đã xác nhận', exact: true }).waitFor();
    await staff.screenshot({ path: `${artifacts}/customer-confirmed-registration.png`, fullPage: true });
    evidence.push({ case: 'Browser: creates STORE and CUSTOMER_SITE through full wizard; customer portal reads frozen dates/policies and accepts; staff sees completed fifth step', status: 'PASS', artifacts });
  } catch (error) {
    await staff?.screenshot({ path: `${artifacts}/staff-failure.png`, fullPage: true }).catch(() => {});
    await portal?.screenshot({ path: `${artifacts}/customer-failure.png`, fullPage: true }).catch(() => {});
    throw error;
  } finally {
    await browser?.close();
    try { process.kill(-server.pid, 'SIGTERM'); } catch { /* Server already stopped. */ }
  }
};

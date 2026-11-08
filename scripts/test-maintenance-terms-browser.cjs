const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const net = require('node:net');
const { spawn } = require('node:child_process');

module.exports = async function ({ root, ports, tenantCode, password, modelId, registrationId, planId }) {
  const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
  const socket = net.createServer();
  await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  const base = `http://127.0.0.1:${port}`;
  const server = spawn('pnpm', ['--filter', 'web', 'dev', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
    cwd: root, detached: true, stdio: 'ignore',
    env: { ...process.env, GATEWAY_PROXY_TARGET: `http://127.0.0.1:${ports.gateway}` },
  });
  const artifacts = process.env.POLICY_ARTIFACTS || '/tmp/pbl6-maintenance-terms-uat';
  await fs.mkdir(artifacts, { recursive: true });
  let browser, page;
  try {
    for (let i = 0; i < 100; i++) {
      if (await fetch(base).then(response => response.ok).catch(() => false)) break;
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    browser = await chromium.launch({ headless: true,
      ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) });
    page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await page.goto(`${base}/login`);
    await page.getByLabel('Mã doanh nghiệp').fill(tenantCode);
    await page.getByLabel('Email', { exact: true }).fill('manager@policy.test');
    await page.getByLabel('Mật khẩu', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
    await page.waitForURL(url => !url.pathname.includes('login'));
    await page.goto(`${base}/app/equipment-models/${modelId}#section=maintenance`);
    const panel = page.locator('section.m1-card').filter({ has: page.getByRole('heading', { name: 'Chương trình bảo trì', exact: true }) }).first();
    const revisions = panel.getByLabel('Phiên bản');
    await revisions.locator('option').nth(1).waitFor({ state: 'attached' });
    await revisions.selectOption({ index: 1 });
    await panel.getByLabel('Thời hạn bảo trì', { exact: true }).nth(2).waitFor();
    assert.equal(await panel.getByLabel('Thời hạn bảo trì', { exact: true }).count(), 3);
    await panel.getByRole('button', { name: 'Sao chép thành bản mới', exact: true }).click();
    const terms = panel.getByLabel('Thời hạn bảo trì', { exact: true });
    assert.deepEqual(await terms.nth(0).locator('option').evaluateAll(options => options.map(o => o.value)), ['YEARS', 'UNLIMITED', 'WARRANTY_END']);
    await terms.nth(0).selectOption('YEARS');
    await panel.getByLabel('Số năm bảo trì từ ngày bàn giao').fill('5');
    await terms.nth(1).selectOption('UNLIMITED');
    await terms.nth(2).selectOption('WARRANTY_END');
    const saved = page.waitForResponse(response => response.request().method() === 'POST' && response.url().endsWith('/maintenance-profiles'));
    await panel.getByRole('button', { name: 'Lưu bản nháp', exact: true }).click();
    const response = await saved;
    assert.equal(response.status(), 201);
    const row = await response.json();
    assert.deepEqual(row.body.rules.map(rule => rule.term), [{ mode: 'YEARS', years: 5 }, { mode: 'UNLIMITED' }, { mode: 'WARRANTY_END' }]);
    await panel.getByRole('status').filter({ hasText: 'Đã lưu' }).waitFor();
    await page.screenshot({ path: `${artifacts}/model-maintenance-terms.png`, fullPage: true });
    await page.goto(`${base}/app/equipment-registrations/${registrationId}`);
    await page.getByText('Ngày kết thúc: 2028-01-31', { exact: true }).first().waitFor();
    await page.getByText('Ngày kết thúc: 2027-07-30', { exact: true }).first().waitFor();
    await page.getByText('Thời hạn: Vĩnh viễn (đến khi chủ động ngừng kế hoạch)', { exact: true }).first().waitFor();
    await page.screenshot({ path: `${artifacts}/applied-maintenance-terms.png`, fullPage: true });
    await page.goto(`${base}/app/maintenance/${planId}?kind=plan`);
    await page.getByText('Thời hạn: Trong 2 năm từ ngày bàn giao', { exact: true }).waitFor();
    await page.getByText('Ngày kết thúc: 2028-01-31', { exact: true }).waitFor();
    await page.screenshot({ path: `${artifacts}/maintenance-plan-expiry.png`, fullPage: true });
    return { status: 'PASS', browser: 'Model term selection/save; applied snapshot; existing Plan still two years after new five-year draft' };
  } catch (error) {
    await page?.screenshot({ path: `${artifacts}/failure.png`, fullPage: true }).catch(() => {});
    throw error;
  } finally {
    await browser?.close();
    try { process.kill(-server.pid, 'SIGTERM'); } catch { /* Already stopped. */ }
  }
};

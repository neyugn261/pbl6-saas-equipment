// Local API demo for Minh's bulk handover, pricing and public QR changes.
// Adds labelled demo records; never resets databases or rewrites existing records.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { createRequire } = require('node:module');
const root = path.resolve(__dirname, '../..');
const req = createRequire(path.join(root, 'apps/identity-service/package.json'));
req('dotenv').config({ path: path.join(root, '.env'), quiet: true });
const catalog = require('./catalog.cjs');
const web = new URL(process.env.MINH_UX_WEB_URL || 'http://localhost:5173');
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(web.hostname), 'Local Web only');
assert.ok(!process.env.NODE_ENV || process.env.NODE_ENV === 'development', 'Development only');
assert.ok(process.env.SEED_DEMO_PASSWORD, 'SEED_DEMO_PASSWORD is required');
const verifyOnly = process.argv.includes('--verify');
const sessions = new Map();
const checks = [];
const A = '/api/assets', O = '/api/organization', I = '/api/inventory';
const S = '/api/service-requests', W = '/api/workorders/work-orders';
const marker = 'DEMO UX MINH 20261119';
// Match the existing seed utilities: authenticate against local Identity so
// repeated multi-role verification does not consume the human Web login quota.
const identity = new URL(process.env.IDENTITY_SERVICE_URL || 'http://localhost:3001');
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(identity.hostname), 'Local Identity only');
function key(label) {
  const hex = createHash('sha256').update(`${catalog.tenant.id}:minh-ux-v1:${label}`).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
async function call(route, email, method = 'GET', body, expected, idempotencyKey) {
  const token = email ? sessions.get(email)?.accessToken : null;
  const authUtility = ['/api/identity/auth/login', '/api/identity/auth/logout'].includes(route);
  const response = await fetch(authUtility ? new URL(route.replace('/api/identity', ''), identity) : new URL('/gateway' + route, web), {
    method,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20000),
  });
  const result = response.status === 204 ? null : await response.json().catch(() => ({}));
  if (expected ? response.status !== expected : !response.ok)
    throw Error(`${method} ${route.split('/public/equipment-by-qr/')[0]}: ${response.status} ${JSON.stringify(result)}`);
  checks.push({ method, route: route.includes('/public/equipment-by-qr/') ? '/api/assets/public/equipment-by-qr/[local-demo-token]' : route, status: response.status });
  return result;
}
async function ensure(listRoute, email, match, createRoute, body) {
  const list = await call(listRoute, email);
  const found = (Array.isArray(list) ? list : list.items).find(match);
  if (found) return found;
  assert.ok(!verifyOnly, `Missing demo record: ${listRoute}`);
  return call(createRoute, email, 'POST', body);
}
async function main() {
  const admin = 'tenant.admin@demo.local';
  const emails = [admin, 'service.manager@demo.local', 'service.manager.dn@demo.local', 'inventory@demo.local', 'inventory.dn@demo.local', 'customer.admin@demo.local', 'factory.admin@demo.local'];
  try {
    for (const email of emails) {
      sessions.set(email, await call('/api/identity/auth/login', null, 'POST', {
        tenantCode: catalog.tenant.code, email, password: process.env.SEED_DEMO_PASSWORD,
      }));
    }
    const models = await call(A + '/equipment-models?pageSize=100', admin);
    assert.ok(models.items.length, 'Seed equipment models first');
    const records = [];
    const partSpecs = [
      { sku: 'UX-LOC-01', name: 'DEMO UX · Bộ lọc bảo trì', unit: 'cái', costPrice: '80000', standardPrice: '120000' },
      { sku: 'UX-CC-01', name: 'DEMO UX · Cầu chì thay thế', unit: 'cái', costPrice: '15000', standardPrice: '25000' },
      { sku: 'UX-GIA-CHUA-CAU-HINH', name: 'DEMO UX · Vật tư chưa cấu hình giá', unit: 'cái' },
    ];
    for (const [index, branch] of catalog.branches.entries()) {
      const code = branch.code;
      const manager = index ? 'service.manager.dn@demo.local' : 'service.manager@demo.local';
      const inventory = index ? 'inventory.dn@demo.local' : 'inventory@demo.local';
      const customer = catalog.customers[index];
      const portal = index ? 'factory.admin@demo.local' : 'customer.admin@demo.local';
      const staff = await call(O + '/staff/me/branch', manager);
      assert.equal(staff.branch?.id, branch.id, 'Incorrect manager branch');
      const site = await ensure(`${O}/customers/${customer.id}/sites`, admin,
        row => row.code === `UX-${code}`, `${O}/customers/${customer.id}/sites`, {
          code: `UX-${code}`, name: `DEMO UX · Địa điểm ${code}`, address: `Địa điểm demo kiểm thử ${code}`,
          defaultServicingBranchId: branch.id,
        });
      assert.equal(site.defaultServicingBranchId, branch.id, 'Demo site routing was changed; preserve and review it manually');
      const location = await ensure(`${O}/sites/${site.id}/locations`, admin,
        row => row.code === 'UX-PHONG', `${O}/sites/${site.id}/locations`, { code: 'UX-PHONG', name: 'DEMO UX · Phòng kỹ thuật', type: 'ROOM' });
      const warehouse = await ensure(I + '/warehouses?pageSize=100', inventory,
        row => row.code === `UX-KHO-${code}`, I + '/warehouses', { code: `UX-KHO-${code}`, name: `DEMO UX · Kho ${code}`, branchId: branch.id });
      const parts = [];
      for (const spec of partSpecs) {
        const part = await ensure(I + '/parts?pageSize=100', inventory, row => row.sku === spec.sku, I + '/parts', spec);
        parts.push(part);
        if (!verifyOnly) await call(I + '/stock-transactions/receive', inventory, 'POST', {
          warehouseId: warehouse.id, partId: part.id, quantity: '10',
          note: `${marker} · Tồn demo ${code}/${spec.sku}`, documentReference: `UX-${code}-${spec.sku}`,
        }, undefined, key(`receive:${code}:${spec.sku}`));
      }
      const model = models.items[index % models.items.length];
      const batchKey = key(`bulk:${code}`);
      const batchBody = { customerId: customer.id, customerSiteId: site.id, defaultLocationId: location.id,
        deliveryMethod: 'CUSTOMER_SITE', defaultModelId: model.id,
        csv: `assetCode,serialNumber,displayName\nUX-${code}-LO-01,UX-${code}-SN-LO-01,DEMO UX Máy bàn giao 01\nUX-${code}-LO-02,UX-${code}-SN-LO-02,DEMO UX Máy bàn giao 02\n` };
      const probeCode = `UX-PREVIEW-${code}-${Date.now()}`;
      const preview = await call(A + '/bulk-handovers/preview', manager, 'POST', {
        ...batchBody, csv: `assetCode,serialNumber,displayName\n${probeCode},${probeCode},Máy chỉ kiểm tra không ghi dữ liệu\n`,
      });
      assert.equal(preview.valid, true, 'Fresh CSV preview must succeed');
      let batch;
      if (!verifyOnly) {
        // A repeated seed reuses the exact command, including the original actor.
        batch = await call(A + '/bulk-handovers', manager, 'POST', batchBody, undefined, batchKey);
        assert.equal(batch.registrations.length, 2);
        const duplicate = await call(A + '/bulk-handovers', manager, 'POST', batchBody, undefined, batchKey);
        assert.deepEqual(duplicate, batch, 'Batch replay must not create another pair');
      } else batch = await call(`${A}/bulk-handovers/${batchKey}`, manager);
      for (const registration of batch.registrations) {
        await call(`${A}/equipment-registrations/${registration.id}`, manager);
      }
      const duplicates = await call(A + '/bulk-handovers/preview', manager, 'POST', batchBody);
      assert.equal(duplicates.valid, false, 'Existing serials must be rejected by preview');
      const csvPath = path.join(root, 'tmp', `minh-ux-${code.toLowerCase()}.csv`);
      fs.mkdirSync(path.dirname(csvPath), { recursive: true });
      fs.writeFileSync(csvPath, `\uFEFFassetCode,serialNumber,displayName\nUX-${code}-THU-01,UX-${code}-SN-THU-01,Máy thử nhập 01\nUX-${code}-THU-02,UX-${code}-SN-THU-02,Máy thử nhập 02\n`);
      const equipment = await ensure(A + '/equipment?pageSize=100', manager,
        row => row.assetCode === `UX-${code}-DICH-VU`, A + '/equipment', {
          modelId: model.id, customerId: customer.id, customerSiteId: site.id, locationId: location.id,
          assetCode: `UX-${code}-DICH-VU`, serialNumber: `UX-${code}-SN-DICH-VU`,
          displayName: `DEMO UX · Máy dịch vụ ${code}`, handoverRequired: false,
          description: `${marker} · Hồ sơ độc lập cho QR và khảo sát; không xác nhận thay khách các hồ sơ bàn giao lô.`,
        });
      const dossier = await call(`${A}/equipment/${equipment.id}/dossier`, manager);
      assert.equal(dossier.equipment.id, equipment.id, 'Equipment dossier must open');
      const qrRoute = `${A}/equipment/${equipment.id}/qr-codes`;
      let qr = await call(qrRoute, manager);
      if (qr.state !== 'ACTIVE') {
        assert.ok(!verifyOnly, 'Missing QR');
        await call(qrRoute, manager, 'POST', {});
        qr = await call(qrRoute, manager);
      }
      let setting = await call(qrRoute + '/public', manager);
      if (!setting.enabled) {
        assert.ok(!verifyOnly, 'Demo QR has been disabled');
        await call(qrRoute + '/public', manager, 'PUT', { enabled: true });
        setting = await call(qrRoute + '/public', manager);
      }
      const publicRoute = `${A}/public/equipment-by-qr/${qr.code.token}`;
      const projection = await call(publicRoute, null);
      for (const forbidden of ['serialNumber', 'customerId', 'customerSiteId', 'locationId', 'history']) assert.ok(!(forbidden in projection));
      const inquiryDescription = `${marker} · ${code} · Máy phát tiếng ồn bất thường. Đây là báo lỗi demo chờ nhân viên xác minh.`;
      const inquiryList = await call(A + '/public-qr-inquiries?pageSize=100', manager);
      let inquiry = inquiryList.items.find(row => row.description === inquiryDescription);
      if (!inquiry) {
        assert.ok(!verifyOnly, 'Missing public QR inquiry');
        const body = { formToken: projection.formToken, contactName: 'Người gửi DEMO UX', contactPhone: '0000000000', description: inquiryDescription, consent: true };
        const result = await call(publicRoute + '/inquiries', null, 'POST', body);
        const repeated = await call(publicRoute + '/inquiries', null, 'POST', body);
        assert.equal(result.reference, repeated.reference, 'Public inquiry replay must not duplicate');
        inquiry = { id: result.reference };
      }
      const title = `DEMO UX · Khảo sát máy ${code}`;
      let request = await ensure(S + '?pageSize=100', manager, row => row.title === title, S,
        { equipmentId: equipment.id, type: 'INSPECTION', priority: 'NORMAL', title, description: `${marker} · Khảo sát trước khi xác định bảo hành và dự toán.` });
      if (request.status === 'NEW' && !verifyOnly) request = await call(`${S}/${request.id}/review`, manager, 'POST', {});
      const order = await ensure(W + '?pageSize=100', manager, row => row.serviceRequestId === request.id, W,
        { serviceRequestId: request.id, type: 'INSPECTION', title });
      await call(`${W}/${order.id}`, manager);
      const scopedInquiries = await call(A + '/public-qr-inquiries?pageSize=100', manager);
      assert.ok(scopedInquiries.items.some(row => row.id === inquiry.id), 'Manager must see the demo inquiry');
      const stock = await call(`${I}/stocks?warehouseId=${warehouse.id}&pageSize=100`, inventory);
      assert.ok(parts.every(part => stock.items.some(row => row.partId === part.id)), 'Demo warehouse must have stock rows');
      const recommended = await call(`${I}/work-orders/${order.id}/recommended-parts`, manager);
      assert.ok(['NO_SNAPSHOT', 'WITHDRAWN', 'APPROVED'].includes(recommended.state), 'Recommended parts API must respond with an explicit state');
      const visiblePart = await call(`${I}/parts/${parts[0].id}`, manager);
      assert.ok(!('costPrice' in visiblePart), 'Manager must not see cost price');
      await call(`${I}/parts/${parts[0].id}/pricing`, manager, 'PUT', { expectedVersion: visiblePart.pricingVersion, costPrice: '1' }, 403);
      // Customer private QR uses the same authenticated equipment permission checks.
      await call(`${A}/qr/${qr.code.token}`, portal);
      const foreignManager = index ? 'service.manager@demo.local' : 'service.manager.dn@demo.local';
      await call(`${W}/${order.id}`, foreignManager, 'GET', undefined, 404);
      const publicSettingsForeign = await fetch(new URL('/gateway' + qrRoute + '/public', web), { headers: { authorization: `Bearer ${sessions.get(foreignManager).accessToken}` } });
      assert.ok([403,404].includes(publicSettingsForeign.status), 'Foreign branch must not manage QR');
      records.push({ branch: code, manager, inventory, siteId: site.id, warehouseId: warehouse.id,
        partIds: parts.map(p => p.id), batchKey, registrationIds: batch.registrations.map(r => r.id),
        equipmentId: equipment.id, workOrderId: order.id, inquiryId: inquiry.id,
        publicQrUrl: setting.publicUrl, secureQrUrl: setting.publicUrl + '/secure', estimateStatus: recommended.state });
      console.log(JSON.stringify({ branch: code, registrationDrafts: batch.registrations.length, parts: parts.length, workOrder: order.id, estimateStatus: recommended.state }));
    }
    const directory = path.join(root, 'tmp');
    fs.mkdirSync(directory, { recursive: true });
    const lines = ['# Demo UX Minh — dữ liệu local', '', `Kiểm tra: ${new Date().toISOString()}`, '',
      'Mã doanh nghiệp: MP. Mật khẩu lấy từ SEED_DEMO_PASSWORD trong .env.',
      'Dữ liệu có nhãn DEMO UX. Hồ sơ lô là nháp; WO là khảo sát. Chưa có producer báo giá, không giả lập khách đã duyệt.', '',
      '| Trang | Link |', '| --- | --- |',
      `| Danh sách bàn giao | [Mở trang](${web.origin}/app/equipment-registrations) |`,
      `| Nhập lô | [Mở trang](${web.origin}/app/bulk-handovers) |`,
      `| Danh mục phụ tùng | [Mở trang](${web.origin}/app/inventory/parts) |`,
      `| Hàng chờ QR | [Mở trang](${web.origin}/app/public-qr-inquiries) |`];
    for (const row of records) {
      lines.push('', `## ${row.branch}`, '', `Service Manager: ${row.manager}; sửa giá bằng: ${row.inventory}.`, '',
        `Nhập lô: chọn địa điểm DEMO UX · Địa điểm ${row.branch}, vị trí DEMO UX · Phòng kỹ thuật và model bất kỳ. [Tải CSV](${path.join(root, 'tmp', `minh-ux-${row.branch.toLowerCase()}.csv`).replaceAll('\\', '/')}). Đổi serial/mã máy nếu đã nhập file này trước đó.`, '',
        `- [Hồ sơ bàn giao](${web.origin}/app/equipment-registrations/${row.registrationIds[0]})`,
        `- [Giá phụ tùng](${web.origin}/app/inventory/parts/${row.partIds[0]})`,
        `- [Thiết bị](${web.origin}/app/equipment/${row.equipmentId})`,
        `- [Cấu hình QR](${web.origin}/app/equipment/${row.equipmentId}/public-qr)`,
        `- [QR công khai](${row.publicQrUrl})`, `- [QR sau đăng nhập](${row.secureQrUrl})`,
        `- [WO khảo sát](${web.origin}/app/work-orders/${row.workOrderId})`);
    }
    fs.writeFileSync(path.join(directory, 'minh-ux-demo-links.md'), lines.join('\n') + '\n');
    fs.writeFileSync(path.join(directory, 'minh-ux-demo-evidence.json'), JSON.stringify({ date: new Date().toISOString(), verifyOnly, records, checks }, null, 2));
    console.log(JSON.stringify({ status: 'PASS', checks: checks.length, links: 'tmp/minh-ux-demo-links.md' }));
  } finally {
    for (const session of sessions.values()) await call('/api/identity/auth/logout', null, 'POST', { refreshToken: session.refreshToken }).catch(() => {});
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });

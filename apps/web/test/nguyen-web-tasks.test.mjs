import test from 'node:test'
import assert from 'node:assert/strict'
import { hooks, nodes, settle, webTab } from './helpers/web-tab.mjs'

test('location hierarchy includes descendants, handles cycles and never turns unavailable counts into zero', () => {
  const tab = webTab(async () => {})
  const { buildLocationTree } = tab.load('features/workspace/location-tree.ts')
  const rows = [{ id: 'building', name: 'Nhà A' }, { id: 'floor', name: 'Tầng 1', parentId: 'building' }, { id: 'room', name: 'Phòng máy', parentId: 'floor' }]
  const normal = buildLocationTree(rows, { building: 1, room: 2 })
  assert.equal(normal.roots[0].equipmentCount, 3)
  assert.equal(normal.roots[0].children[0].equipmentCount, 2)
  assert.equal(buildLocationTree(rows).roots[0].equipmentCount, null)
  const broken = buildLocationTree([{ id: 'a', name: 'A', parentId: 'b' }, { id: 'b', name: 'B', parentId: 'a' }, { id: 'c', name: 'C', parentId: 'missing' }])
  assert.equal(broken.invalidAncestry, true)
  assert.equal(broken.roots.length, 3)
})

test('equipment URL round-trip keeps purchase dates separate and preserves hidden-column filters', () => {
  const tab = webTab(async () => {})
  const { equipmentFilters, equipmentViewParams } = tab.load('features/equipment/list-view.ts')
  const query = new URLSearchParams('customerId=customer&purchaseFrom=2026-01-01&handoverTo=2026-11-21&locationId=room')
  const filters = equipmentFilters(query)
  const result = equipmentViewParams(filters, ' Máy 001 ', 3)
  assert.equal(result.get('purchaseFrom'), '2026-01-01')
  assert.equal(result.get('handoverTo'), '2026-11-21')
  assert.equal(result.get('q'), 'Máy 001')
  assert.equal(result.get('locationId'), 'room')
  assert.equal(result.get('page'), '3')
})

test('equipment customer filters use the signed-in customer on the portal, including URL overrides and reset', () => {
  const tab = webTab(async () => {})
  const { equipmentFilters, equipmentViewParams, scopeEquipmentFilters, emptyEquipmentFilters } = tab.load('features/equipment/list-view.ts')
  const requested = equipmentFilters(new URLSearchParams('customerId=other-customer&siteId=site&locationId=room&status=ACTIVE'))
  for (const role of ['CUSTOMER_ADMIN', 'CUSTOMER_USER']) {
    const profile = { userType: 'CUSTOMER', customerId: 'own-customer', roles: [role] }
    const scoped = scopeEquipmentFilters(requested, profile)
    const params = equipmentViewParams(scoped, '')
    assert.equal(params.get('customerId'), 'own-customer')
    assert.equal(params.get('siteId'), 'site')
    assert.equal(params.get('locationId'), 'room')
    assert.equal(params.get('status'), 'ACTIVE')
    assert.equal(scopeEquipmentFilters(emptyEquipmentFilters, profile).customerId, 'own-customer')
  }
  assert.equal(scopeEquipmentFilters(requested, { userType: 'TENANT_STAFF', customerId: null }).customerId, 'other-customer')
  assert.equal(scopeEquipmentFilters(requested, { userType: 'CUSTOMER', customerId: null }).customerId, '')
  assert.equal(requested.customerId, 'other-customer')
})

test('branch selection filters only supported list DTOs and is discarded with a different session', async () => {
  const paths = []
  const tab = webTab(async (url) => { paths.push(url); return Response.json({ items: [], total: 0 }) })
  tab.branches.selectBranch('branch-a')
  await tab.client.api.workorders('/work-orders?page=2')
  await tab.client.api.workorders('/reports/technicians?from=a&to=b')
  await tab.client.api.assetM2('/equipment?page=1')
  await tab.client.api.workorders('/work-orders/one')
  assert.ok(paths[0].endsWith('/work-orders?page=2&branchId=branch-a'))
  assert.ok(paths[1].includes('branchId=branch-a'))
  assert.ok(paths[2].endsWith('/equipment?page=1'))
  assert.ok(paths[3].endsWith('/work-orders/one'))
  tab.changeSession()
  assert.equal(tab.branches.selectedBranchId(), '')
})

test('a late GET from the previous branch is rejected instead of rendering in the new branch', async () => {
  let resolve
  const tab = webTab(() => new Promise(done => { resolve = done }))
  tab.branches.selectBranch('old')
  const request = tab.client.api.workorders('/work-orders')
  tab.branches.selectBranch('new')
  resolve(Response.json({ items: [{ id: 'old-branch-data' }] }))
  await assert.rejects(request, error => error.code === 'VIEW_CHANGED')
})

function dispatchHarness(storage = new Map(), write = async () => { throw new TypeError('response lost') }) {
  const tab = webTab(async () => {} , {}, storage), h = hooks(), calls = []
  const { default: Dispatch } = tab.load('features/workspace/QuickDispatch.tsx', {
    react: h.react, 'react/jsx-runtime': h.jsx, 'react-router-dom': { Link: 'link' },
    '../../api/client': { ...tab.client, api: { workorders: async (path, options) => { calls.push({ path, options }); return write(path, options) } } },
    '../../auth/session': tab.session, '../../routes/registration-shared': { DirectoryPicker: 'picker' }, './management.css': {},
  })
  const props = { requestId: 'request', branchId: 'branch', onChanged() {} }
  return { h, calls, tab, render: () => h.render(Dispatch, props) }
}

test('quick dispatch sends one atomic WO command and locks double submit and retry after a lost response', async () => {
  const { render, calls } = dispatchHarness()
  let tree = render()
  nodes(tree, node => node.type === 'picker')[0].props.onChange('technician')
  tree = render()
  const submit = nodes(tree, node => node.type === 'form')[0].props.onSubmit
  const first = submit({ preventDefault() {} }), second = submit({ preventDefault() {} })
  await Promise.all([first, second])
  assert.equal(calls.length, 1)
  assert.equal(calls[0].path, '/work-orders/quick-dispatch')
  assert.equal(calls[0].options.body.technicianId, 'technician')
  tree = render()
  assert.equal(nodes(tree, node => node.type === 'fieldset')[0].props.disabled, true)
  await nodes(tree, node => node.type === 'form')[0].props.onSubmit({ preventDefault() {} })
  assert.equal(calls.length, 1)
})

test('quick dispatch retains uncertain outcome after remount and reconciles using a read without replay', async () => {
  const storage = new Map()
  const first = dispatchHarness(storage)
  first.tab.changeSession()
  let tree = first.render()
  nodes(tree, node => node.type === 'picker')[0].props.onChange('technician')
  tree = first.render()
  await nodes(tree, node => node.type === 'form')[0].props.onSubmit({ preventDefault() {} })
  first.h.unmount()
  const next = dispatchHarness(storage, async () => ({ items: [{ id: 'order', workOrderNo: 'WO-001', status: 'ASSIGNED' }], total: 1 }))
  tree = next.render()
  assert.equal(nodes(tree, node => node.type === 'fieldset')[0].props.disabled, true)
  await nodes(tree, node => node.type === 'button' && node.props.children === 'Kiểm tra lệnh đã tạo')[0].props.onClick()
  await settle(); tree = next.render()
  assert.equal(next.calls.length, 1)
  assert.equal(next.calls[0].options, undefined)
  assert.ok(nodes(tree, node => node.props.to === '/app/work-orders/order').length)
})

test('KPI drilldown sends the exact report interval and technician ID, with an accessible table fallback', async () => {
  const tab = webTab(async () => {}), h = hooks(), reads = []
  const charts = Object.fromEntries(['Bar', 'BarChart', 'CartesianGrid', 'Legend', 'ResponsiveContainer', 'Tooltip', 'XAxis', 'YAxis'].map(key => [key, key]))
  const { default: Visuals } = tab.load('features/reports/TechnicianKpiVisuals.tsx', {
    react: h.react, 'react/jsx-runtime': h.jsx, 'react-router-dom': { Link: 'link' }, recharts: charts,
    '../../routes/registration-data': { useDirectory: (_area, path) => { if (path) reads.push(path); return { loading: false, value: path ? { items: [], total: 0 } : undefined } } },
    '../workspace/management.css': {},
  })
  const props = { items: [{ technicianId: 'tech', fullName: 'Nguyễn A', employeeCode: 'T01', completedCount: 2, onTimeRate: null }], from: '2026-11-01T00:00:00+07:00', to: '2026-11-22T00:00:00+07:00' }
  let tree = h.render(Visuals, props)
  assert.ok(nodes(tree, node => node.type === 'table').length)
  nodes(tree, node => node.type === 'button')[0].props.onClick()
  tree = h.render(Visuals, props)
  const params = new URLSearchParams(reads[0].split('?')[1])
  assert.equal(params.get('from'), props.from)
  assert.equal(params.get('to'), props.to)
  assert.ok(reads[0].startsWith('/reports/technicians/tech/work-orders?'))
})

test('service managers cannot use the Web create-request capability while both customer roles keep it', () => {
  const tab = webTab(async () => {})
  const { creators, has } = tab.load('auth/access.ts')
  assert.equal(has(['SERVICE_MANAGER'], creators), false)
  assert.equal(has(['CUSTOMER_ADMIN'], creators), true)
  assert.equal(has(['CUSTOMER_USER'], creators), true)
})

test('CSV import maps custom headers, keeps serial zeros and submits mapped data to the real preview contract', async () => {
  const tab = webTab(async () => {}), h = hooks(), calls = []
  const sheet = tab.load('features/equipment/spreadsheet.ts')
  const { BulkHandoverPage } = tab.load('routes/MinhAssetUx.tsx', {
    react: h.react, 'react/jsx-runtime': h.jsx, 'react-router-dom': { Link: 'link', useParams: () => ({}) },
    '../api/client': { ...tab.client, api: { asset: async (path, options) => { calls.push({ path, options }); return { valid: true, count: 1, rows: [] } } } },
    '../api/config': tab.config, '../auth/session': tab.session, './registration-shared': { DirectoryPicker: 'picker', SetupPage: 'setup' },
    './registration-data': { useDirectory: () => ({}), errorText: error => error.message }, './minh-asset-ux.css': {},
    '../display-names': tab.load('display-names.ts'), '../features/equipment/spreadsheet': sheet,
  })
  const root = h.render(BulkHandoverPage), render = () => h.render(root.type, root.props)
  let tree = render()
  nodes(tree, node => node.type === 'picker')[0].props.onChange('customer')
  tree = render(); nodes(tree, node => node.type === 'picker')[1].props.onChange('site')
  tree = render(); nodes(tree, node => node.type === 'picker')[2].props.onChange('model')
  tree = render()
  await nodes(tree, node => node.type === 'input' && node.props.type === 'file')[0].props.onChange({ target: { files: [{ name: 'machines.csv', size: 50, text: async () => 'machine_code,serial\nMAY-001,0000123' }] } })
  tree = render()
  const map = nodes(tree, node => node.type === 'fieldset' && JSON.stringify(node).includes('Ghép cột trong tệp')).at(-1)
  const selects = nodes(map, node => node.type === 'select')
  selects[1].props.onChange({ target: { value: 'machine_code' } })
  tree = render()
  const mapped = nodes(tree, node => node.type === 'fieldset' && JSON.stringify(node).includes('Ghép cột trong tệp')).at(-1)
  nodes(mapped, node => node.type === 'select')[2].props.onChange({ target: { value: 'serial' } })
  tree = render()
  await nodes(tree, node => node.type === 'form')[0].props.onSubmit({ preventDefault() {} })
  await settle()
  assert.equal(calls[0].path, '/bulk-handovers/preview')
  assert.equal(calls[0].options.body.rows[0].assetCode, 'MAY-001')
  assert.equal(calls[0].options.body.rows[0].serialNumber, '0000123')
  assert.equal(calls[0].options.body.rows[0].modelId, 'model')
})

test('shared toolbar debounces search for 300 ms and accepts URL changes without remounting the input', () => {
  const tab = webTab(async () => {}), h = hooks(), calls = []
  let timer
  const window = { setTimeout(callback, delay) { assert.equal(delay, 300); timer = callback; return 1 }, clearTimeout() { timer = null } }
  const { default: Toolbar } = tab.load('features/workspace/TableToolbar.tsx', { react: h.react, 'react/jsx-runtime': h.jsx, 'lucide-react': { Search: 'search-icon' }, './management.css': {} }, { window })
  const onQuery = value => calls.push(value)
  let tree = h.render(Toolbar, { query: '', onQuery })
  nodes(tree, node => node.type === 'input')[0].props.onChange({ target: { value: 'Máy 001' } })
  tree = h.render(Toolbar, { query: '', onQuery })
  assert.equal(calls.length, 0)
  timer()
  assert.deepEqual(calls, ['Máy 001'])
  tree = h.render(Toolbar, { query: 'Máy 001', onQuery })
  assert.equal(nodes(tree, node => node.type === 'input')[0].props.value, 'Máy 001')
  tree = h.render(Toolbar, { query: 'Từ URL khác', onQuery })
  assert.equal(nodes(tree, node => node.type === 'input')[0].props.value, 'Từ URL khác')
  h.unmount()
})

test('mapped Excel dates normalize after renaming a column while serial values remain text', () => {
  const tab = webTab(async () => {})
  const { mapImportRows } = tab.load('features/equipment/spreadsheet.ts')
  const rows = mapImportRows([{ Ngay_mua: '45292', Serial: '000123' }], { purchaseDate: 'Ngay_mua', serialNumber: 'Serial' }, true)
  assert.equal(rows[0].purchaseDate, '2024-01-01')
  assert.equal(rows[0].serialNumber, '000123')
})

test('column order is shared by the equipment grid and export, while customer rows omit internal registration actions', () => {
  const tab = webTab(async () => {}), h = hooks()
  const { equipmentExportColumns, moveEquipmentColumn } = tab.load('features/equipment/list-view.ts')
  const columns = moveEquipmentColumn(['serial', 'dates'], 'dates', -1)
  assert.equal(columns.join(','), 'dates,serial')
  const fields = equipmentExportColumns(columns)
  assert.ok(fields.indexOf('purchaseDate') < fields.indexOf('serialNumber'))
  assert.equal(fields.includes('costPrice'), false)
  const { default: Row } = tab.load('features/equipment/EquipmentGridRow.tsx', {
    'react/jsx-runtime': h.jsx, 'react-router-dom': { Link: 'link' }, '../../components/Badges': { StatusBadge: 'badge' },
    '../workspace/service-detail-data': tab.load('features/workspace/service-detail-data.ts'),
  })
  const tree = Row({ item: { id: 'machine', assetCode: 'M01', serialNumber: '000123', handoverDate: null, status: 'ACTIVE' }, portal: true, canManage: false, columns, selected: false, onSelect() {}, operationalLabels: {} })
  const cells = nodes(tree, node => node.type === 'td')
  assert.equal(cells[2].props['data-label'], 'Mua / bàn giao / lắp đặt')
  assert.equal(cells[3].props['data-label'], 'Số sê-ri')
  assert.equal(nodes(tree, node => node.type === 'link' && node.props.to.includes('equipment-registrations')).length, 0)
  assert.ok(nodes(tree, node => node.props.to === '/portal/equipment/machine').length)
})

test('equipment rows use full-detail links without a quick-view action and retain table data and selection', () => {
  for (const portal of [true, false]) {
    const tab = webTab(async () => {}), h = hooks(), selections = []
    const { default: Row } = tab.load('features/equipment/EquipmentGridRow.tsx', {
      'react/jsx-runtime': h.jsx, 'react-router-dom': { Link: 'link' },
      '../../components/Badges': { StatusBadge: 'badge' },
      '../workspace/service-detail-data': tab.load('features/workspace/service-detail-data.ts'),
    })
    const tree = Row({ item: { id: 'machine', assetCode: 'SA-003', serialNumber: '000123', status: 'ACTIVE', model: { name: 'Máy siêu âm' }, purchaseDate: '2026-11-01' }, portal, canManage: false, columns: ['serial', 'dates'], selected: false, onSelect: value => selections.push(value), operationalLabels: {} })
    const detail = nodes(tree, node => node.type === 'link' && node.props.children === 'Xem chi tiết')[0]
    assert.equal(detail.props.to, `${portal ? '/portal' : '/app'}/equipment/machine`)
    assert.equal(detail.props['aria-label'], 'Xem chi tiết thiết bị SA-003')
    assert.equal(nodes(tree, node => node.type === 'button' && node.props.children === 'Xem nhanh').length, 0)
    assert.equal(nodes(tree, node => node.type === 'dialog').length, 0)
    assert.equal(nodes(tree, node => node.type === 'td' && node.props['data-label'] === 'Số sê-ri')[0].props.children, '000123')
    assert.ok(JSON.stringify(tree).includes('2026-11-01'))
    nodes(tree, node => node.type === 'input' && node.props.type === 'checkbox')[0].props.onChange({ target: { checked: true } })
    assert.deepEqual(selections, [true])
  }
})

test('equipment filter offers collapse and expand toggle to hide and show advanced filters', () => {
  const tab = webTab(async () => {})
  const { equipmentFilters } = tab.load('features/equipment/list-view.ts')
  const defaultFilters = equipmentFilters(new URLSearchParams(''))
  assert.equal(defaultFilters.status, '')
  assert.equal(defaultFilters.siteId, '')
  assert.equal(defaultFilters.purchaseFrom, '')
  // URL with advanced filters marks them present
  const advancedUrlFilters = equipmentFilters(new URLSearchParams('siteId=site-1&purchaseFrom=2026-11-01'))
  assert.equal(advancedUrlFilters.siteId, 'site-1')
  assert.equal(advancedUrlFilters.purchaseFrom, '2026-11-01')
})



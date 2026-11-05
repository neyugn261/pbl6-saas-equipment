import test from 'node:test'
import assert from 'node:assert/strict'
import { hooks, nodes, settle, webTab } from './helpers/web-tab.mjs'

const tab = webTab(async () => { throw new Error('Unexpected request') })
const labels = tab.load('display-names.ts')
test('full name, employee code, empty/null/error fallback never use a database ID', () => {
  assert.equal(labels.technicianName('Nguyễn Văn A', 'TECH-001'), 'Nguyễn Văn A (TECH-001)')
  assert.equal(labels.technicianName(null, 'TECH-001'), 'TECH-001')
  assert.equal(labels.technicianName(' ', null), 'Kỹ thuật viên không xác định')
  for (const kind of ['branch', 'warehouse', 'part', 'user', 'site', 'equipment', 'customer']) {
    assert.equal(labels.displayName(kind, { name: 'Tên hiện tại' }), 'Tên hiện tại')
    assert.equal(labels.displayName(kind, { name: '' }), labels.displayName(kind, null))
    assert.equal(labels.displayName(kind, { name: 'Tên mới' }, { name: 'Tên lịch sử' }), 'Tên lịch sử')
    assert.equal(labels.displayName(kind, { name: 'Tên mới' }, { code: 'OLD' }), 'OLD')
  }
})
function renderM2(componentName, response, path = '') {
  const h = hooks()
  const module = tab.load('routes/M2Pages.tsx', {
    react: h.react, 'react/jsx-runtime': h.jsx,
    'react-router-dom': { Link: 'a', useParams: () => ({ id: 'work' }), useLocation: () => ({ pathname: path, search: '' }) },
    '../api/client': { ...tab.client, api: { workorders: async () => response, assetM2: async () => ({ status: 'AVAILABLE', data: {
      assignments: { status: 'AVAILABLE', data: response.assignments ?? [] }, history: { status: 'AVAILABLE', data: [] }, logs: { status: 'AVAILABLE', data: [] }, report: { status: 'NOT_FOUND', data: null },
    } }) } },
    '../auth/session': tab.session, '../display-names': labels,
    '../features/attachments/AttachmentsPanel': { AttachmentsPanel: 'attachments' },
  })
  return { render: () => h.render(module[componentName]), h }
}
function expand(tree) {
  if (Array.isArray(tree)) return tree.map(expand)
  if (!tree || typeof tree !== 'object') return tree
  if (typeof tree.type === 'function') return expand(tree.type(tree.props))
  return { ...tree, props: { ...tree.props, children: expand(tree.props?.children) } }
}
test('technician list renders fullName and code for inactive rows beyond page 100', async () => {
  const { render } = renderM2('TechniciansPage', { items: [{ id: 'tech-id', userId: 'user-id', fullName: 'Nguyễn Văn A', employeeCode: 'T1', status: 'INACTIVE' }], total: 205 })
  render(); await settle(); const tree = expand(render())
  assert.ok(nodes(tree, n => n.type === 'a' && n.props.children === 'Nguyễn Văn A (T1)').length)
  assert.equal(nodes(tree, n => n.props.children === 'user-id').length, 0)
})
test('current technician and inactive assignment history use distinct names and keep link IDs', async () => {
  const { render } = renderM2('WorkOrderPage', { id: 'work', equipmentId: 'equipment', currentTechnicianId: 'current-id', currentTechnicianName: 'Current technician', currentTechnicianEmployeeCode: 'T2',
    assignments: [{ id: 'assignment', technicianId: 'inactive-id', technicianName: 'Historical technician', technicianEmployeeCode: 'T1', status: 'UNASSIGNED' }] })
  render(); await settle(); render(); await settle(); const tree = expand(render())
  assert.ok(nodes(tree, n => n.type === 'dd' && n.props.children === 'Current technician (T2)').length)
  assert.ok(nodes(tree, n => n.type === 'a' && n.props.to === '/app/technicians/inactive-id' && n.props.children === 'Historical technician (T1)').length)
})
test('ledger labels use per-row snapshot/current metadata, independent of ACTIVE dropdown pagination', () => {
  const rows = Array.from({ length: 205 }, (_, i) => ({ warehouseId: `w-${i}`, partId: `p-${i}`, warehouse: { name: `Kho ${i}` }, part: { name: `Phụ tùng ${i}` } }))
  rows.push(rows[204])
  for (const row of rows) {
    assert.equal(labels.displayName('warehouse', row.warehouse), row.warehouse.name)
    assert.equal(labels.displayName('part', row.part), row.part.name)
  }
  assert.equal(labels.displayName('part', { name: 'Renamed inactive part' }, { name: 'Original part' }), 'Original part')
})
test('ledger component renders inactive rows outside dropdowns, preserving historical snapshots', async () => {
  const h = hooks()
  const empty = { items: [], total: 0, page: 1, pageSize: 20 }
  const ledger = { items: [{ id: 'txn', createdAt: '2026-11-01', quantity: '1', type: 'RECEIVE', partId: 'part-205', warehouseId: 'warehouse-205',
    part: { name: 'Current part' }, warehouse: { name: 'Inactive warehouse' }, partSnapshot: { name: 'Historical part' } }], total: 205 }
  const api = { inventory: async path => path.startsWith('/stock-transactions?') ? ledger : empty, workorders: async () => empty }
  const { InventoryTransactionsPage } = tab.load('features/inventory/InventoryPages.tsx', { react: h.react, 'react/jsx-runtime': h.jsx,
    'react-router-dom': { Link: 'a' }, '../../api/client': { ...tab.client, api }, '../../auth/session': tab.session,
    './stock-mutation': tab.stock, '../../display-names': labels })
  h.render(InventoryTransactionsPage); await settle(); const tree = expand(h.render(InventoryTransactionsPage))
  assert.ok(nodes(tree, n => n.type === 'td' && n.props.children === 'Inactive warehouse').length)
  assert.ok(nodes(tree, n => n.type === 'td' && n.props.children === 'Historical part').length)
  assert.equal(nodes(tree, n => n.type === 'td' && ['part-205', 'warehouse-205', 'Current part'].includes(n.props.children)).length, 0)
})
test('warehouse list uses scoped branch name and keeps branch ID as form value', async () => {
  const h = hooks()
  const empty = { items: [], total: 0, page: 1, pageSize: 20 }
  const api = { inventory: async path => path.startsWith('/warehouses?page=') ? {
    ...empty, items: [{ id: 'warehouse-id', branchId: 'branch-id', branchName: 'Chi nhánh Hà Nội', code: 'W1', name: 'Kho chính', status: 'ACTIVE' }], total: 1,
  } : empty }
  const { InventoryWarehousesPage } = tab.load('features/inventory/InventoryPages.tsx', { react: h.react, 'react/jsx-runtime': h.jsx,
    'react-router-dom': { Link: 'a' }, '../../api/client': { ...tab.client, api }, '../../auth/session': tab.session,
    './stock-mutation': tab.stock, '../../display-names': labels })
  h.render(InventoryWarehousesPage); await settle(); const tree = expand(h.render(InventoryWarehousesPage))
  assert.ok(nodes(tree, n => n.type === 'td' && n.props.children === 'Chi nhánh Hà Nội').length)
  assert.equal(nodes(tree, n => n.type === 'td' && n.props.children === 'branch-id').length, 0)
})

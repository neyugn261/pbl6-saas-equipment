import test from 'node:test'
import assert from 'node:assert/strict'
import { hooks, nodes, settle, webTab } from './helpers/web-tab.mjs'
import { detailUI } from './helpers/service-detail.mjs'
import { draftHook } from './helpers/draft.mjs'

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
    './DossierQr': { default: 'dossier-qr' },
    '../features/workspace/ServiceDetailUI': detailUI(tab,h),
    '../features/workspace/EquipmentPartsHistory': { default: 'parts-history' },
    '../features/workspace/WorkOrderReadiness': { WorkOrderLocation: 'work-location' },
    '../features/workspace/TechnicianOrderContext': { default: 'technician-context' },
    '../features/workspace/use-form-draft': draftHook(tab,h),
    '../features/workspace/ui-values': tab.load('features/workspace/ui-values.ts'),
    '../features/workspace/service-detail-data':tab.load('features/workspace/service-detail-data.ts'),
    '../features/workspace/WorkspaceUI': {EntityPicker:'picker',RelatedName:'related-name'},
    '../features/attachments/AttachmentsPanel': { AttachmentsPanel: 'attachments' },
    './ModelPolicyPanels': {
      MaintenancePolicyDetails: 'policy-details',
      WorkOrderChecklist: 'work-order-checklist',
      AppliedPolicyPanel: 'applied-policy-panel',
    },
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
  const transactionId = 'fc69918c-5352-4fa3-9f12-a0da30756943'
  const orderId = 'fc69918c-5352-4fa3-9f12-a0da30756944'
  const otherOrderId = 'fc69918c-5352-4fa3-9f12-a0da30756945'
  const row = { id: transactionId, createdAt: '2026-11-01', quantity: '1', type: 'ISSUE', partId: 'part-205', warehouseId: 'warehouse-205',
    referenceType: 'WORK_ORDER', referenceId: orderId,
    part: { name: 'Current part' }, warehouse: { name: 'Inactive warehouse' }, partSnapshot: { name: 'Historical part' } }
  const ledger = { items: [row, { ...row, id: 'txn-2', referenceId: otherOrderId }], total: 205 }
  const api = {
    inventory: async path => path.startsWith('/stock-transactions?') ? ledger : empty,
    workorders: async () => ({ ...empty, items: [{ id: orderId, workOrderNo: 'WO-007', status: 'COMPLETED' }] }),
  }
  const { InventoryTransactionsPage } = tab.load('features/inventory/InventoryPages.tsx', { react: h.react, 'react/jsx-runtime': h.jsx,
    'react-router-dom': { Link: 'a' }, '../../api/client': { ...tab.client, api }, '../../auth/session': tab.session,
    './stock-mutation': tab.stock, '../../display-names': labels, '../workspace/ui-values':tab.load('features/workspace/ui-values.ts') })
  h.render(InventoryTransactionsPage); await settle(); const tree = expand(h.render(InventoryTransactionsPage))
  assert.ok(nodes(tree, n => n.type === 'td' && n.props.children === 'Inactive warehouse').length)
  assert.ok(nodes(tree, n => n.type === 'td' && n.props.children === 'Historical part').length)
  assert.ok(nodes(tree, n => n.type === 'td' && n.props.children === 'WO-007').length)
  assert.ok(nodes(tree, n => n.type === 'td' && n.props.children === 'Lệnh công việc liên quan').length)
  const visibleText = nodes(tree, n => typeof n.props?.children === 'string').map(n => n.props.children)
  for (const value of [transactionId, orderId, otherOrderId, 'part-205', 'warehouse-205', 'Current part']) {
    assert.ok(!visibleText.some(text => text.includes(value)), value)
  }
})
test('warehouse list uses scoped branch name and keeps branch ID as form value', async () => {
  const h = hooks()
  const empty = { items: [], total: 0, page: 1, pageSize: 20 }
  const api = { inventory: async path => path.startsWith('/warehouses?page=') ? {
    ...empty, items: [{ id: 'warehouse-id', branchId: 'branch-id', branchName: 'Chi nhánh Hà Nội', code: 'W1', name: 'Kho chính', status: 'ACTIVE' }], total: 1,
  } : empty }
  const { InventoryWarehousesPage } = tab.load('features/inventory/InventoryPages.tsx', { react: h.react, 'react/jsx-runtime': h.jsx,
    'react-router-dom': { Link: 'a' }, '../../api/client': { ...tab.client, api }, '../../auth/session': tab.session,
    './stock-mutation': tab.stock, '../../display-names': labels, '../workspace/ui-values':tab.load('features/workspace/ui-values.ts') })
  h.render(InventoryWarehousesPage); await settle(); const tree = expand(h.render(InventoryWarehousesPage))
  assert.ok(nodes(tree, n => n.type === 'td' && n.props.children === 'Chi nhánh Hà Nội').length)
  assert.equal(nodes(tree, n => n.type === 'td' && n.props.children === 'branch-id').length, 0)
})

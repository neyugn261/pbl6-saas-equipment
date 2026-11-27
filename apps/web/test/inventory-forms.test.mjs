import assert from 'node:assert/strict'
import test from 'node:test'
import { hooks, nodes, settle, webTab } from './helpers/web-tab.mjs'

function transactionPage(tab, h) {
  return tab.load('features/inventory/InventoryPages.tsx', {
    react: h.react, 'react/jsx-runtime': h.jsx, 'react-router-dom': { Link: 'link' },
    'lucide-react': { Search: 'icon', Plus: 'icon' },
    '../workspace/WorkspaceUI': { PageHeading: 'page-heading', DataState: ({ children }) => children, Pagination: 'pagination', EmptyState: 'empty-state' },
    '../workspace/TableToolbar': { default: 'table-toolbar' },
    '../../components/Badges': { StatusBadge: 'badge' }, './inventory-parts.css': {},
    '../../components/PageTitle': { PageTitle: 'page-title' },
    '../../api/client': tab.client, '../../auth/session': tab.session, './stock-mutation': tab.stock,
    '../../display-names': tab.load('display-names.ts'),
    '../workspace/ui-values': tab.load('features/workspace/ui-values.ts'),
    './WarehouseReceipt': { WarehouseReceipt: 'warehouse-receipt' },
    './InventoryDialog': { InventoryDialog: 'inventory-dialog', RequiredMark: 'required-mark' },
    '../workspace/ServiceDetailUI': { ServiceCard: 'service-card', ServiceFacts: 'service-facts' },
    '../workspace/workspace-data': { useWorkspaceData: () => ({ data: undefined, loading: false }) },
    './PartPricing': { PartPricing: 'part-pricing' },
    './prices': tab.load('features/inventory/prices.ts'),
  }).InventoryTransactionsPage
}

test('transaction form opens on demand, preserves canceled draft and stays open on rejection until saved', async () => {
  const posts = []
  let rejectPost = true
  const tab = webTab((url, options) => {
    if (options.method === 'POST') {
      posts.push(JSON.parse(options.body))
      return rejectPost
        ? Response.json({ code: 'INVALID_REFERENCE', message: 'Kiểm tra kho đã chọn.' }, { status: 422 })
        : Response.json({ id: 'created' })
    }
    return Response.json({ items: [], total: 0, page: 1, pageSize: 20 })
  })
  const h = hooks()
  const Page = transactionPage(tab, h)
  let tree = h.render(Page)
  await settle(); tree = h.render(Page)
  const heading = () => nodes(tree, node => node.type === 'page-heading')[0]
  const open = () => { heading().props.actions.props.onClick(); tree = h.render(Page) }
  assert.equal(heading().props.actions.props['aria-expanded'], false)
  assert.equal(nodes(tree, node => node.type === 'form').length, 0)
  open()
  const change = (label, value) => {
    const parent = nodes(tree, node => node.type === 'label' && node.props.children[0] === label)[0]
    nodes(parent, node => ['input', 'select'].includes(node.type))[0].props.onChange({ target: { value } })
    tree = h.render(Page)
  }
  change('Kho', 'warehouse-1'); change('Phụ tùng', 'part-1')
  change('Số lượng', '2'); change('Ghi chú', 'Nhập bổ sung')
  nodes(tree, node => node.type === 'button' && node.props.children === 'Hủy')[0].props.onClick()
  tree = h.render(Page)
  assert.equal(posts.length, 0)
  assert.equal(nodes(tree, node => node.type === 'form').length, 0)
  open()
  assert.equal(heading().props.actions.props['aria-expanded'], true)
  const submit = async () => {
    nodes(tree, node => node.type === 'form')[0].props.onSubmit({ preventDefault() {} })
    await settle(); tree = h.render(Page)
  }
  await submit()
  assert.equal(posts.length, 1)
  assert.equal(posts[0].quantity, '2')
  assert.equal(posts[0].note, 'Nhập bổ sung')
  assert.equal(nodes(tree, node => node.type === 'fieldset').length, 1)
  assert.ok(nodes(tree, node => node.props?.role === 'alert').length)
  rejectPost = false
  await submit()
  assert.equal(posts.length, 2)
  assert.equal(nodes(tree, node => node.type === 'form').length, 0)
  assert.equal(heading().props.actions.props['aria-expanded'], false)
  h.unmount()
})

test('restored uncertain transaction opens the locked form and cannot be hidden by cancel', async () => {
  const tab = webTab((url, options) => {
    if (options.method === 'POST') throw new TypeError('response lost')
    return Response.json({ items: [], total: 0, page: 1, pageSize: 20 })
  })
  const mutation = new tab.stock.StockMutation(JSON.stringify(['tenant', 'staff']), tab.session.getSessionGeneration())
  await assert.rejects(mutation.execute({
    mode: 'RECEIVE', path: '/stock-transactions/receive',
    body: { warehouseId: 'warehouse-1', partId: 'part-1', quantity: '2', note: 'Nhập bổ sung' },
  }))
  const h = hooks()
  const Page = transactionPage(tab, h)
  const tree = h.render(Page)
  assert.equal(nodes(tree, node => node.type === 'page-heading')[0].props.actions.props['aria-expanded'], true)
  assert.equal(nodes(tree, node => node.type === 'fieldset')[0].props.disabled, true)
  assert.equal(nodes(tree, node => node.type === 'button' && node.props.children === 'Hủy')[0].props.disabled, true)
  assert.equal(nodes(tree, node => node.type === 'section' && node.props['aria-label'] === 'Giao dịch chưa xác nhận').length, 1)
  h.unmount()
})

test('warehouse creation preserves the canceled draft and refreshes the list after saving', async () => {
  const posts = []
  let completePost
  let listReads = 0
  const tab = webTab((url, options) => {
    if (options.method === 'POST') {
      posts.push({ url, body: JSON.parse(options.body) })
      return new Promise(resolve => { completePost = () => resolve(Response.json({ id: 'created' })) })
    }
    if (url.includes('/warehouses?')) listReads++
    return Response.json({ items: [], total: 0, page: 1, pageSize: 20 })
  })
  const h = hooks()
  const { InventoryWarehousesPage } = tab.load('features/inventory/InventoryPages.tsx', {
    react: h.react, 'react/jsx-runtime': h.jsx, 'react-router-dom': { Link: 'link' },
    '../workspace/WorkspaceUI': { PageHeading: 'page-heading', DataState: ({ children }) => children, Pagination: 'pagination', EmptyState: 'empty-state' },
    '../workspace/TableToolbar': { default: 'table-toolbar' },
    '../../components/Badges': { StatusBadge: 'badge' }, './inventory-parts.css': {},
    '../../components/PageTitle': { PageTitle: 'page-title' },
    '../../api/client': tab.client, '../../auth/session': tab.session, './stock-mutation': tab.stock,
    '../../display-names': tab.load('display-names.ts'),
    '../workspace/ui-values': tab.load('features/workspace/ui-values.ts'),
    './WarehouseReceipt': { WarehouseReceipt: 'warehouse-receipt' },
    './InventoryDialog': { InventoryDialog: 'inventory-dialog', RequiredMark: 'required-mark' },
    '../workspace/ServiceDetailUI': { ServiceCard: 'service-card', ServiceFacts: 'service-facts' },
    '../workspace/workspace-data': { useWorkspaceData: () => ({ data: undefined, loading: false }) },
    './PartPricing': { PartPricing: 'part-pricing' },
  })
  let tree = h.render(InventoryWarehousesPage)
  await settle(); tree = h.render(InventoryWarehousesPage)
  const open = () => {
    nodes(tree, node => node.type === 'page-heading')[0].props.actions.props.onClick()
    tree = h.render(InventoryWarehousesPage)
  }
  const change = (field, value) => {
    const form = nodes(tree, node => node.type === 'form')[0]
    const controls = nodes(form, node => ['input', 'select', 'textarea'].includes(node.type))
    controls[field].props.onChange({ target: { value } })
    tree = h.render(InventoryWarehousesPage)
  }
  open()
  change(0, 'branch-1'); change(1, 'KHO-02'); change(2, 'Kho phụ tùng'); change(3, 'Đà Nẵng')
  nodes(tree, node => node.type === 'button' && node.props.children === 'Hủy')[0].props.onClick()
  tree = h.render(InventoryWarehousesPage)
  assert.equal(posts.length, 0)
  assert.equal(nodes(tree, node => node.type === 'fieldset').length, 0)
  open()
  const readsBeforeSave = listReads
  const submit = nodes(tree, node => node.type === 'form')[0].props.onSubmit
  submit({ preventDefault() {} })
  submit({ preventDefault() {} })
  await settle(); tree = h.render(InventoryWarehousesPage)
  assert.equal(nodes(tree, node => node.type === 'fieldset')[0].props.disabled, true)
  assert.equal(nodes(tree, node => node.type === 'button' && node.props.children === 'Hủy')[0].props.disabled, true)
  assert.equal(posts.length, 1)
  assert.ok(posts[0].url.endsWith('/warehouses'))
  assert.deepEqual(posts[0].body, { branchId: 'branch-1', code: 'KHO-02', name: 'Kho phụ tùng', address: 'Đà Nẵng' })
  completePost()
  await settle(); tree = h.render(InventoryWarehousesPage)
  await settle(); tree = h.render(InventoryWarehousesPage)
  assert.equal(nodes(tree, node => node.type === 'fieldset').length, 0)
  assert.ok(listReads > readsBeforeSave)
  h.unmount()
})

test('warehouse import parses known and new SKUs and reports duplicate or malformed rows', async () => {
  const tab = webTab()
  const { readWarehouseReceipt } = tab.load('features/inventory/warehouse-receipt-data.ts', {
    '../equipment/spreadsheet': tab.load('features/equipment/spreadsheet.ts'),
  })
  const file = new File(['sku,quantity,name,unit,allowFractional\n001,4,,,\nNEW,"2,5",Ống dẫn,m,true\n001,1,,,\nBAD,0,,,'], 'nhap-kho.csv')
  const { lines, errors } = await readWarehouseReceipt(file)
  assert.deepEqual(JSON.parse(JSON.stringify(lines)), [
    { sku: '001', quantity: '4' },
    { sku: 'NEW', quantity: '2.5', name: 'Ống dẫn', unit: 'm', allowFractional: true },
  ])
  assert.match(errors[0], /Mục 3.*trùng/)
  assert.match(errors[1], /Mục 4.*lớn hơn 0/)
})

test('warehouse receipt replays the same batch key after losing the response', async () => {
  const keys = [], payloads = []
  let lost = true
  const tab = webTab((_url, options) => {
    keys.push(new Headers(options.headers).get('Idempotency-Key'))
    payloads.push(JSON.parse(options.body))
    if (lost) throw new TypeError('response lost')
    return Response.json({ count: 2 })
  })
  const request = {
    mode: 'RECEIVE_BATCH',
    path: '/warehouses/00000000-0000-4000-8000-000000000001/receipts',
    body: { lines: [{ sku: 'A', quantity: '5' }, { sku: 'B', quantity: '2' }], note: 'Đã nhận' },
  }
  const mutation = new tab.stock.StockMutation('tenant:staff', tab.session.getSessionGeneration(), 'receipts')
  await assert.rejects(mutation.execute(request))
  const restored = new tab.stock.StockMutation('tenant:staff', tab.session.getSessionGeneration(), 'receipts')
  assert.ok(restored.pending)
  lost = false
  await restored.execute()
  assert.ok(keys[0])
  assert.equal(keys[1], keys[0])
  assert.deepEqual(payloads, [request.body, request.body])
  assert.equal(restored.pending, null)
})

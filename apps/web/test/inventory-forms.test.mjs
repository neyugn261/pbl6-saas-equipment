import assert from 'node:assert/strict'
import test from 'node:test'
import { hooks, nodes, settle, webTab } from './helpers/web-tab.mjs'

function transactionPage(tab, h) {
  return tab.load('features/inventory/InventoryPages.tsx', {
    react: h.react, 'react/jsx-runtime': h.jsx, 'react-router-dom': { Link: 'link' },
    'lucide-react': { Search: 'icon', Plus: 'icon' },
    '../workspace/WorkspaceUI': { PageHeading: 'page-heading' },
    '../workspace/TableToolbar': { default: 'table-toolbar' },
    '../../components/Badges': { StatusBadge: 'badge' }, './inventory-parts.css': {},
    '../../api/client': tab.client, '../../auth/session': tab.session, './stock-mutation': tab.stock,
    '../../display-names': tab.load('display-names.ts'),
    '../workspace/ui-values': tab.load('features/workspace/ui-values.ts'),
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

for (const kind of ['part', 'warehouse']) {
  test(`${kind} creation: cancel keeps the draft without saving; submit locks fields and refreshes the list`, async () => {
    const posts = []
    let completePost
    let listReads = 0
    const listPath = kind === 'part' ? '/parts' : '/warehouses'
    const tab = webTab((url, options) => {
      if (options.method === 'POST') {
        posts.push({ url, body: JSON.parse(options.body) })
        return new Promise(resolve => { completePost = () => resolve(Response.json({ id: 'created' })) })
      }
      if (url.includes(`${listPath}?`)) listReads++
      return Response.json({ items: [], total: 0, page: 1, pageSize: 20 })
    })
    const h = hooks()
    const pages = tab.load('features/inventory/InventoryPages.tsx', {
      react: h.react, 'react/jsx-runtime': h.jsx, 'react-router-dom': { Link: 'link' },
      'lucide-react': { Search: 'icon', Plus: 'icon' },
      '../workspace/WorkspaceUI': { PageHeading: 'page-heading' },
      '../workspace/TableToolbar': { default: 'table-toolbar' },
      '../../components/Badges': { StatusBadge: 'badge' }, './inventory-parts.css': {},
      '../../api/client': tab.client, '../../auth/session': tab.session, './stock-mutation': tab.stock,
      '../../display-names': tab.load('display-names.ts'),
      '../workspace/ui-values': tab.load('features/workspace/ui-values.ts'),
      './PartPricing': { PartPricing: 'part-pricing' },
      './prices': tab.load('features/inventory/prices.ts'),
    })
    const Page = kind === 'part' ? pages.InventoryPartsPage : pages.InventoryWarehousesPage
    let tree = h.render(Page)
    await settle(); tree = h.render(Page)
    const open = () => {
      nodes(tree, node => node.type === 'page-heading')[0].props.actions.props.onClick()
      tree = h.render(Page)
    }
    const change = (field, value) => {
      const form = nodes(tree, node => node.type === 'form')[0]
      const controls = nodes(form, node => ['input', 'select', 'textarea'].includes(node.type))
      controls[field].props.onChange({ target: { value, checked: value } })
      tree = h.render(Page)
    }
    open()
    if (kind === 'part') {
      change(0, 'LOC-02'); change(1, 'Lõi lọc'); change(2, 'mét')
      change(6, true); change(3, 'Dòng một\nDòng hai')
    } else {
      change(0, 'branch-1'); change(1, 'KHO-02'); change(2, 'Kho phụ tùng'); change(3, 'Đà Nẵng')
    }
    nodes(tree, node => node.type === 'button' && node.props.children === 'Hủy')[0].props.onClick()
    tree = h.render(Page)
    assert.equal(posts.length, 0)
    assert.equal(nodes(tree, node => node.type === 'fieldset').length, 0)
    open()
    const readsBeforeSave = listReads
    const submit = nodes(tree, node => node.type === 'form')[0].props.onSubmit
    submit({ preventDefault() {} })
    submit({ preventDefault() {} })
    await settle(); tree = h.render(Page)
    assert.equal(nodes(tree, node => node.type === 'fieldset')[0].props.disabled, true)
    assert.equal(nodes(tree, node => node.type === 'button' && node.props.children === 'Hủy')[0].props.disabled, true)
    assert.equal(posts.length, 1)
    assert.ok(posts[0].url.endsWith(listPath))
    assert.deepEqual(posts[0].body, kind === 'part'
      ? { sku: 'LOC-02', name: 'Lõi lọc', unit: 'mét', allowFractional: true, description: 'Dòng một\nDòng hai', costPrice: null, standardPrice: null }
      : { branchId: 'branch-1', code: 'KHO-02', name: 'Kho phụ tùng', address: 'Đà Nẵng' })
    completePost()
    await settle(); tree = h.render(Page)
    await settle(); tree = h.render(Page)
    assert.equal(nodes(tree, node => node.type === 'fieldset').length, 0)
    assert.ok(listReads > readsBeforeSave)
    h.unmount()
  })
}

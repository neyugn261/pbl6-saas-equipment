import assert from 'node:assert/strict'
import test from 'node:test'
import { hooks, nodes, settle, webTab } from './helpers/web-tab.mjs'

const ok = (body) => Response.json(body)
const rejected = (status, code = 'API_ERROR') => Response.json({ code, message: code }, { status })
const request = (mode) => ({
  mode,
  path: { RECEIVE: '/stock-transactions/receive', ADJUST: '/stock-transactions/adjust',
    ISSUE: '/work-orders/wo-1/parts', RETURN: '/work-order-parts/usage-1/return' }[mode],
  body: { quantity: '1.25', note: 'Kiểm kê',
    ...(mode === 'RETURN' ? {} : { warehouseId: 'warehouse-1', partId: 'part-1' }),
    ...(mode === 'ADJUST' ? { direction: 'ADJUST_IN', reasonCode: 'COUNT_VARIANCE' } : {}),
    ...(mode === 'RETURN' ? { condition: 'GOOD' } : {}) },
})
const controller = (tab, scope = 'tenant:staff') => new tab.stock.StockMutation(scope, tab.session.getSessionGeneration())

for (const mode of ['RECEIVE', 'ADJUST', 'ISSUE', 'RETURN']) {
  test(`${mode}: committed POST with lost response replays identical intent after reload; one stock movement`, async () => {
    const calls = [], committed = new Map()
    let loseResponse = true
    const tab = webTab(async (url, options) => {
      if (options.method === 'GET') return rejected(503) // no recovery proof available
      const key = options.headers['Idempotency-Key']
      calls.push({ url, key, body: options.body, method: options.method })
      if (!committed.has(key)) committed.set(key, options.body)
      else assert.equal(options.body, committed.get(key))
      if (loseResponse) { loseResponse = false; throw new TypeError('response lost after commit') }
      return ok({ id: 'movement-1' })
    })
    const operation = controller(tab)
    const input = request(mode)
    await assert.rejects(operation.execute(input), /response lost/)
    assert.equal(committed.size, 1)
    assert.ok(operation.pending)
    input.body.quantity = '99' // editing caller-owned data cannot change the saved request
    await assert.rejects(operation.execute(input), /giao dịch đang chờ/)
    assert.equal(calls.length, 1)
    const reloaded = webTab(tabFetchReplay, {}, tab.storage)
    async function tabFetchReplay(url, options) {
      calls.push({ url, key: options.headers['Idempotency-Key'], body: options.body, method: options.method })
      const key = options.headers['Idempotency-Key']
      if (committed.has(key)) assert.equal(committed.get(key), options.body)
      else committed.set(key, options.body)
      return ok({ id: 'movement-1' })
    }
    const restored = controller(reloaded)
    await restored.execute()
    assert.deepEqual(calls[1], calls[0])
    assert.equal(committed.size, 1)
    assert.equal(restored.pending, null)
    assert.equal(tab.storage.size, 0)
    await restored.execute(request(mode))
    assert.notEqual(calls[2].key, calls[0].key) // a confirmed next intent gets a fresh key
  })
}

test('double submit sends one POST; an in-flight intent is already persisted', async () => {
  let resolve, calls = 0
  const tab = webTab(() => { calls++; return new Promise((yes) => { resolve = yes }) })
  const operation = controller(tab)
  const flight = operation.execute(request('RECEIVE'))
  assert.ok(controller(tab).pending)
  await assert.rejects(operation.execute(request('RECEIVE')), /Đang xử lý/)
  await assert.rejects(operation.execute(), /Đang xử lý/)
  assert.equal(calls, 1)
  resolve(ok({}))
  await flight
  assert.equal(operation.pending, null)
})

test('first business rejection permits editing; later authorization failure cannot erase an unknown outcome', async () => {
  let status = 422
  const tab = webTab(() => rejected(status))
  const operation = controller(tab)
  await assert.rejects(operation.execute(request('RECEIVE')))
  assert.equal(operation.pending, null)
  status = 503
  await assert.rejects(operation.execute(request('RECEIVE')))
  const key = operation.pending.key
  status = 403
  await assert.rejects(operation.execute())
  assert.equal(operation.pending.key, key)
})

test('401 refresh keeps the original intent; explicit retry uses the same key and renewed token', async () => {
  const calls = []
  const tab = webTab((url, options) => {
    calls.push(options)
    return calls.length === 1 ? rejected(401) : ok({})
  })
  const operation = controller(tab)
  await assert.rejects(operation.execute(request('RECEIVE')), (e) => e.code === 'AUTHENTICATION_RENEWED')
  assert.equal(calls.length, 1)
  await operation.execute()
  assert.equal(calls[1].headers['Idempotency-Key'], calls[0].headers['Idempotency-Key'])
  assert.notEqual(calls[1].headers.Authorization, calls[0].headers.Authorization)
  assert.equal(calls[1].body, calls[0].body)
})

test('session change blocks old replay and late completion; another tenant/user cannot load the intent', async () => {
  let resolve, calls = 0
  const tab = webTab(() => { calls++; return new Promise((yes) => { resolve = yes }) })
  const old = controller(tab)
  const flight = old.execute(request('RECEIVE'))
  tab.changeSession()
  await assert.rejects(old.execute(), /Phiên đăng nhập đã thay đổi/)
  assert.equal(controller(tab, 'tenant:other-user').pending, null)
  assert.equal(controller(tab, 'other-tenant:staff').pending, null)
  resolve(ok({}))
  await assert.rejects(flight, /Phiên đăng nhập đã thay đổi/)
  assert.ok(controller(tab).pending) // a new login by the same principal can reconcile it
  assert.equal(calls, 1)
})

test('unavailable storage fails before POST; corrupt saved intent blocks a fresh movement', async () => {
  let calls = 0
  const tab = webTab(() => { calls++; return ok({}) })
  tab.sessionStorage.setItem = () => { throw new Error('storage blocked') }
  await assert.rejects(controller(tab).execute(request('RECEIVE')), /storage blocked/)
  assert.equal(calls, 0)
  tab.storage.set('pbl6.inventory.intent.tenant%3Astaff', '{broken')
  const operation = controller(tab)
  assert.ok(operation.storageError)
  await assert.rejects(operation.execute(request('RECEIVE')), /Không đọc được giao dịch/)
  assert.equal(calls, 0)
})

for (const state of ['PENDING', 'COMMITTED', 'ABORTED']) {
  test(`ISSUE proof ${state} determines whether a failed retry still needs reconciliation`, async () => {
    const tab = webTab((url, options) => options.method === 'POST' ? rejected(503)
      : ok({ key: controller(tab).pending.key, operation: 'ISSUE', state }))
    const operation = controller(tab)
    if (state === 'COMMITTED') await operation.execute(request('ISSUE'))
    else await assert.rejects(operation.execute(request('ISSUE')))
    assert.equal(Boolean(operation.pending), state === 'PENDING')
  })
}

for (const kind of ['retry', 'abort']) {
  test(`ISSUE ${kind} clears only the matching local intent; unrelated recovery leaves it intact`, async () => {
    const paths = []
    const tab = webTab((url) => {
      paths.push(url)
      return /\/(retry|abort)$/.test(url) ? ok({}) : rejected(503)
    })
    const operation = controller(tab)
    await assert.rejects(operation.execute(request('ISSUE')))
    const key = operation.pending.key
    await operation.recover('unrelated-key', kind)
    assert.equal(operation.pending.key, key)
    await operation.recover(key, kind)
    assert.equal(operation.pending, null)
    assert.ok(paths.some((url) => url.endsWith(`/inventory-operations/${key}/${kind}`)))
  })
}

test('Notification inbox, filters, pagination, mark-read and bell use the configured Gateway prefix exactly once', async () => {
  const calls = []
  const tab = webTab((url, options) => {
    calls.push({ url, method: options.method })
    if (url.endsWith('/unread-count')) return ok({ unreadCount: 21 })
    if (options.method === 'PATCH') return ok({})
    return ok({ items: [{ id: 'notice /1', title: 'Thông báo', body: 'Nội dung', createdAt: '2026-11-03T00:00:00Z', readAt: null }], total: 21, pageSize: 20 })
  }, { VITE_GATEWAY_API_URL: 'https://example.test/gateway/' })
  const inbox = hooks(), bell = hooks()
  const imports = (h) => ({ react: h.react, 'react/jsx-runtime': h.jsx, 'lucide-react': { Bell: 'bell' },
    'react-router-dom': { Link: 'link' }, '../../api/client': tab.client, '../../auth/session': tab.session })
  const { NotificationInbox } = tab.load('features/notifications/NotificationInbox.tsx', imports(inbox))
  const { NotificationBell } = tab.load('features/notifications/NotificationInbox.tsx', imports(bell))
  inbox.render(NotificationInbox)
  bell.render(NotificationBell, { href: '/app/notifications' })
  await settle()
  let tree = inbox.render(NotificationInbox)
  const filter = nodes(tree, (node) => node.type === 'select')[0]
  filter.props.onChange({ target: { value: 'UNREAD' } })
  inbox.render(NotificationInbox); await settle()
  tree = inbox.render(NotificationInbox)
  nodes(tree, (node) => node.type === 'button' && node.props.children === 'Sau')[0].props.onClick()
  inbox.render(NotificationInbox); await settle()
  tree = inbox.render(NotificationInbox)
  nodes(tree, (node) => node.type === 'button' && node.props.children === 'Đánh dấu đã đọc')[0].props.onClick()
  await settle()
  const base = 'https://example.test/gateway/api/notifications'
  assert.deepEqual(calls, [
    { url: `${base}?page=1&pageSize=20&readStatus=ALL`, method: 'GET' },
    { url: `${base}/unread-count`, method: 'GET' },
    { url: `${base}?page=1&pageSize=20&readStatus=UNREAD`, method: 'GET' },
    { url: `${base}?page=2&pageSize=20&readStatus=UNREAD`, method: 'GET' },
    { url: `${base}/notice%20%2F1/read`, method: 'PATCH' },
    { url: `${base}/unread-count`, method: 'GET' },
  ])
  assert.ok(nodes(bell.render(NotificationBell, { href: '/app/notifications' }), (node) => node.props?.['aria-label'] === 'Thông báo chưa đọc: 21').length)
  inbox.unmount(); bell.unmount()
})

for (const mode of ['RECEIVE', 'ADJUST', 'ISSUE', 'RETURN']) {
  test(`Inventory form ${mode}: lost response locks edits and retry uses the saved request`, async () => {
    const posts = []
    let lost = false
    const tab = webTab((url, options) => {
      if (options.method === 'POST') {
        posts.push({ url, body: options.body, key: options.headers['Idempotency-Key'] })
        if (!lost) { lost = true; throw new TypeError('response lost') }
        return ok({})
      }
      if (/\/inventory-operations\//.test(url)) return rejected(503)
      if (url.endsWith('/work-orders/wo-1/parts')) return ok([{
        id: 'usage-1', partId: 'part-1', warehouseId: 'warehouse-1', quantityOutstanding: '5.00',
        quantityIssued: '5.00', quantityReturned: '0.00', quantityConfirmedUsed: '0.00',
        partSnapshot: { sku: 'SKU', name: 'Phụ tùng' },
      }])
      return ok({ items: [], total: 0, pageSize: 20 })
    })
    const h = hooks()
    const { InventoryTransactionsPage } = tab.load('features/inventory/InventoryPages.tsx', {
      react: h.react, 'react/jsx-runtime': h.jsx, 'react-router-dom': { Link: 'link' },
      '../../api/client': tab.client, '../../auth/session': tab.session, './stock-mutation': tab.stock,
      '../../display-names': tab.load('display-names.ts'),
    })
    let tree = h.render(InventoryTransactionsPage)
    await settle(); tree = h.render(InventoryTransactionsPage)
    function change(label, value) {
      const parent = nodes(tree, (node) => node.type === 'label' && node.props.children[0] === label)[0]
      const control = nodes(parent, (node) => ['input', 'select'].includes(node.type))[0]
      control.props.onChange({ target: { value } })
      tree = h.render(InventoryTransactionsPage)
    }
    change('Thao tác', mode)
    if (mode === 'ISSUE' || mode === 'RETURN') change('Work Order', 'wo-1')
    if (mode === 'RETURN') {
      nodes(tree, (node) => node.type === 'form')[0].props.onSubmit({ preventDefault() {} })
      await settle(); tree = h.render(InventoryTransactionsPage)
      change('Số lượng trả', '1.25')
      change('Tình trạng', 'DAMAGED')
    } else {
      change('Kho', 'warehouse-1')
      change('Phụ tùng', 'part-1')
      change('Số lượng', '1.25')
    }
    change('Ghi chú', 'Kiểm kê')
    const forms = nodes(tree, (node) => node.type === 'form')
    forms[mode === 'RETURN' ? 1 : 0].props.onSubmit({ preventDefault() {} })
    await settle(); tree = h.render(InventoryTransactionsPage)
    assert.equal(posts.length, 1)
    assert.ok(posts[0].url.endsWith(request(mode).path))
    const body = JSON.parse(posts[0].body)
    assert.equal(body.quantity, '1.25')
    if (mode === 'RETURN') assert.equal(body.condition, 'DAMAGED')
    assert.equal(nodes(tree, (node) => node.type === 'fieldset')[0].props.disabled, true)
    nodes(tree, (node) => node.type === 'button' && node.props.children === 'Thử lại giao dịch đã lưu')[0].props.onClick()
    await settle(); tree = h.render(InventoryTransactionsPage)
    assert.deepEqual(posts[1], posts[0])
    assert.equal(nodes(tree, (node) => node.type === 'fieldset')[0].props.disabled, false)
    assert.equal(nodes(tree, (node) => node.props?.['aria-label'] === 'Giao dịch chưa xác nhận').length, 0)
    assert.equal(tab.storage.size, 0)
    h.unmount()
  })
}

test('a late success from an unmounted page cannot remove a newer saved stock intent', async () => {
  const waiting = []
  const tab = webTab(() => new Promise((resolve) => { waiting.push(resolve) }))
  const old = controller(tab)
  const oldFlight = old.execute(request('RECEIVE'))
  const current = controller(tab)
  const replay = current.execute()
  waiting[1](ok({}))
  await replay
  const next = current.execute(request('RECEIVE'))
  const newKey = current.pending.key
  waiting[0](ok({}))
  await oldFlight
  assert.equal(controller(tab).pending.key, newKey)
  waiting[2](ok({}))
  await next
  assert.equal(controller(tab).pending, null)
})

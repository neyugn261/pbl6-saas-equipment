import test from 'node:test'
import assert from 'node:assert/strict'
import { hooks, nodes, settle, webTab } from './helpers/web-tab.mjs'
import { detailUI, expand } from './helpers/service-detail.mjs'
const fixture = { id: 'handover', handoverNo: 'BG-test', equipmentId: 'equipment', status: 'PENDING_CUSTOMER_CONFIRMATION',
  isCurrent: true, expiresAt: '2099-01-01T00:00:00Z', submittedAt: '2026-11-04T00:00:00Z', acceptedAt: null, activatedAt: null,
  equipmentStatus: 'OUT_OF_SERVICE', audit: [], snapshot: { assetCode: 'Pump', name: 'Pump', model: 'P', serialNumber: 'S',
    customerName: 'Customer', customerSiteId: 'site', deliveryAt: '2026-11-04T00:00:00Z', condition: 'New', notes: '<script>text</script>', contentVersion: 1 } }
function setup(row = fixture, roles = ['CUSTOMER_ADMIN'], userType = 'CUSTOMER', componentName = 'HandoverDetailPage') {
  const calls = [], h = hooks(), tab = webTab(async () => { throw new Error('Unexpected fetch') })
  const session = { ...tab.session, useSession: () => ({ profile: { userType, roles } }) }
  const api = { asset: async (url, options) => { calls.push({ url, options }); return options ? { ...row, status: 'ACTIVATED' } : row } }
  const component = tab.load('routes/EquipmentHandovers.tsx', { react: h.react, 'react/jsx-runtime': h.jsx,
    'react-router-dom': { Link: 'a', useParams: () => ({ id: 'handover' }), useNavigate: () => () => {}, useSearchParams: () => [new URLSearchParams()] },
    '../api/client': { ...tab.client, api }, '../auth/session': session, './registration-shared': { DirectoryPicker: 'picker' },
    './registration-data': { errorText: e => e.message },
    '../display-names': tab.load('display-names.ts'),
    '../features/workspace/ServiceDetailUI': detailUI(tab,h),
    '../features/workspace/HandoverServiceContext': { default: 'handover-service-context' },
    '../features/workspace/service-detail-data':tab.load('features/workspace/service-detail-data.ts'),
  })[componentName]
  return { calls, h, render: () => expand(h.render(component)) }
}
test('handover site prefers historical snapshot and displays current name without mutating snapshot', async () => {
  for (const historical of [undefined, 'Original site']) {
    const row = { ...fixture, customerSiteName: 'Current site', snapshot: { ...fixture.snapshot, customerSiteName: historical } }
    const { render } = setup(row)
    render(); await settle(); const tree = render()
    const text = JSON.stringify(tree)
    assert.ok(text.includes(historical ?? 'Current site'))
    assert.equal(row.snapshot.customerSiteName, historical)
    assert.equal(nodes(tree, n => n.type === 'dd' && n.props.children === 'site').length, 0)
  }
})
test('staff handover list shows creator names and safe fallback when lookup is unavailable', async () => {
  const { render } = setup({ items: [{ ...fixture, id: 'one', createdBy: 'raw-user-id', createdByName: 'Creator name' },
    { ...fixture, id: 'two', createdBy: 'missing-user-id', createdByName: null }], total: 2 }, ['SERVICE_MANAGER'], 'TENANT_STAFF', 'HandoverListPage')
  render(); await settle(); const text = JSON.stringify(render())
  assert.ok(text.includes('Creator name'))
  assert.ok(text.includes('Nhân viên không xác định'))
  assert.equal(text.includes('raw-user-id'), false)
  assert.equal(text.includes('missing-user-id'), false)
})
test('customer detail GET cannot accept; explicit confirmation POST uses scoped endpoint and no forged actor', async () => {
  const { calls, render } = setup()
  render(); await settle(); let tree = render()
  assert.equal(calls.filter(c => c.options).length, 0)
  nodes(tree, n => n.type === 'button' && n.props.children === 'Chấp thuận')[0].props.onClick()
  tree = render()
  assert.equal(calls.filter(c => c.options).length, 0)
  await nodes(tree, n => n.type === 'form')[0].props.onSubmit({ preventDefault() {} })
  const mutation = calls.find(c => c.options)
  assert.equal(mutation.url, '/my/equipment-handovers/handover/accept')
  assert.deepEqual(JSON.parse(JSON.stringify(mutation.options)), { method: 'POST', body: {} })
})
test('reject dialog requires a reason and posts text without rendering HTML', async () => {
  const { calls, render } = setup()
  render(); await settle(); let tree = render()
  nodes(tree, n => n.type === 'button' && n.props.children === 'Từ chối')[0].props.onClick()
  tree = render()
  assert.equal(nodes(tree, n => n.type === 'button' && n.props.children === 'Xác nhận')[0].props.disabled, true)
  nodes(tree, n => n.type === 'textarea')[0].props.onChange({ target: { value: 'Wrong serial' } })
  tree = render()
  await nodes(tree, n => n.type === 'form')[0].props.onSubmit({ preventDefault() {} })
  assert.equal(calls.find(c => c.options).options.body.reason, 'Wrong serial')
  assert.equal(nodes(tree, n => n.props.dangerouslySetInnerHTML).length, 0)
})
test('expired, cancelled, superseded and unauthorized details have no accept action', async () => {
  for (const [row, roles] of [[{ ...fixture, expiresAt: '2000-01-01T00:00:00Z' }, ['CUSTOMER_ADMIN']],
    [{ ...fixture, status: 'CANCELLED' }, ['CUSTOMER_ADMIN']], [{ ...fixture, supersededById: 'new' }, ['CUSTOMER_ADMIN']], [fixture, ['CUSTOMER_USER']]]) {
    const { render } = setup(row, roles); render(); await settle(); const tree = render()
    assert.equal(nodes(tree, n => n.type === 'button' && n.props.children === 'Chấp thuận').length, 0)
  }
})
test('activated detail displays authoritative lifecycle and accepted/activated timestamps', async () => {
  const { render } = setup({ ...fixture, status: 'ACTIVATED', equipmentStatus: 'ACTIVE', acceptedAt: '2026-11-04T01:00:00Z', activatedAt: '2026-11-04T01:00:00Z' })
  render(); await settle(); const tree = render()
  assert.ok(nodes(tree, n => n.type === 'dd' && n.props.children === 'Đã đưa vào dịch vụ').length)
  assert.equal(nodes(tree, n => n.type === 'button' && n.props.children === 'Chấp thuận').length, 0)
})

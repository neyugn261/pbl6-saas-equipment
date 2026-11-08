import assert from 'node:assert/strict'
import test from 'node:test'
import { webTab, hooks, nodes, settle } from './helpers/web-tab.mjs'

const text = node => typeof node === 'string' || typeof node === 'number' ? String(node)
  : Array.isArray(node) ? node.map(text).join(' ') : text(node?.props?.children ?? '')
function editor() {
  const sent = [], host = hooks(), tab = webTab((_url, init) => {
    const input = JSON.parse(init.body)
    sent.push(input.body)
    return Promise.resolve(Response.json({ id: 'revision', version: 1, revision: 1, status: 'DRAFT', body: input.body }))
  })
  tab.session.useSession = () => ({ profile: { id: 'manager', tenantId: 'tenant', roles: ['SERVICE_MANAGER'] } })
  const mod = tab.load('routes/ModelPolicyPage.tsx', {
    '../features/workspace/service-detail-data': { serviceLabels: {} },
    '../features/workspace/ServiceDetailUI': { ServiceSections: 'sections' },
    react: host.react, 'react/jsx-runtime': host.jsx,
    'react-router-dom': { Link: 'a', useLocation: () => ({}), useParams: () => ({ id: 'model' }) },
    '../api/client': tab.client, '../auth/session': tab.session,
    './registration-data': { useDirectory: (_area, path) => path === '/equipment-models/model'
      ? { value: { name: 'Model' } } : { value: { items: [] } }, errorText: String },
    './registration-shared': { LoadState: 'load' }, './live-administration.css': {},
  })
  const page = host.render(mod.ModelPolicyPage)
  const component = nodes(page, node => node.type === 'sections')[0].props.items[1].content
  return { sent, render: () => host.render(component.type, component.props) }
}
const label = (tree, value) => nodes(tree, n => n.type === 'label' && text(n).includes(value))[0]
const button = (tree, value) => nodes(tree, n => n.type === 'button' && text(n) === value)[0]

test('model editor offers all three terms and sends years only for the fixed-year selection', async () => {
  const ui = editor()
  button(ui.render(), 'Thêm lịch bảo trì').props.onClick()
  let tree = ui.render()
  let select = nodes(label(tree, 'Thời hạn bảo trì'), n => n.type === 'select')[0]
  assert.deepEqual(nodes(select, n => n.type === 'option').map(n => n.props.value), ['YEARS', 'UNLIMITED', 'WARRANTY_END'])
  assert.equal(select.props.value, 'UNLIMITED')
  select.props.onChange({ target: { value: 'YEARS' } })
  tree = ui.render()
  nodes(label(tree, 'Số năm bảo trì'), n => n.type === 'input')[0].props.onChange({ target: { value: '5' } })
  tree = ui.render()
  nodes(tree, n => n.type === 'form')[0].props.onSubmit({ preventDefault() {} })
  await settle(); await settle()
  assert.deepEqual(ui.sent[0].rules[0].term, { mode: 'YEARS', years: 5 })
  for (const mode of ['WARRANTY_END', 'UNLIMITED']) {
    tree = ui.render()
    nodes(label(tree, 'Thời hạn bảo trì'), n => n.type === 'select')[0].props.onChange({ target: { value: mode } })
    tree = ui.render()
    assert.equal(nodes(tree, n => n.type === 'label' && text(n).includes('Số năm bảo trì')).length, 0)
    nodes(tree, n => n.type === 'form')[0].props.onSubmit({ preventDefault() {} })
    await settle(); await settle()
    assert.deepEqual(ui.sent.at(-1).rules[0].term, { mode })
  }
})

test('applied maintenance terms distinguish finite years, warranty end and legacy unlimited', () => {
  const tab = webTab(() => { throw Error('No HTTP in a policy summary') }), host = hooks()
  const mod = tab.load('routes/ModelPolicyPanels.tsx', {
    '../features/workspace/service-detail-data': { serviceLabels: {} },
    '../features/workspace/maintenance-term': tab.load('features/workspace/maintenance-term.ts'),
    react: host.react, 'react/jsx-runtime': host.jsx,
    '../api/client': tab.client, '../auth/session': tab.session,
    './registration-data': {}, './registration-shared': {},
  })
  const tree = host.render(mod.MaintenancePolicyDetails, { record: { name: 'Annual', policyVersionId: 'policy',
    termMode: 'WARRANTY_END', endDate: '2027-07-30', hasNextOccurrence: false, checklist: [] } })
  assert.match(text(tree), /Hết cùng với bảo hành/)
  assert.match(text(tree), /2027-07-30/)
  assert.match(text(tree), /không có kỳ bảo trì mới/)
  const term = tab.load('features/workspace/maintenance-term.ts')
  assert.match(term.maintenanceTermLabel({ mode: 'YEARS', years: 3 }), /3 năm/)
  assert.match(term.maintenanceTermLabel(), /Vĩnh viễn/)
})

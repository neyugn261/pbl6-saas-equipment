import assert from 'node:assert/strict'
import test from 'node:test'
import { webTab, hooks, nodes, settle } from './helpers/web-tab.mjs'
import { detailUI, expand } from './helpers/service-detail.mjs'

const text = node => typeof node === 'string' || typeof node === 'number' ? String(node)
  : Array.isArray(node) ? node.map(text).join(' ') : text(node?.props?.children ?? '')
function editor(serviceLabels = {}, revisions = [], maintenance = true, modelStatus = 'ACTIVE', location = {}) {
  const sent = [], requests = [], host = hooks(), tab = webTab((url, init) => {
    const input = JSON.parse(init.body)
    requests.push({ url, method: init.method, input })
    if (url.endsWith('/reactivate') || url.endsWith('/retire')) {
      const [, id, action] = url.split('/').slice(-3)
      const source = revisions.find(row => row.id === id)
      const active = action === 'reactivate'
      return Promise.resolve(Response.json({ ...source, version: input.expectedVersion + 1, status: active ? 'PUBLISHED' : 'RETIRED', isDefault: active }))
    }
    sent.push(input.body)
    const active = input.activate || input.publish
    const saved = { id: 'revision', version: 1, revision: revisions.length + 1, status: active ? 'PUBLISHED' : 'DRAFT', isDefault: !!active, body: input.body }
    return Promise.resolve(Response.json(saved))
  })
  tab.session.useSession = () => ({ profile: { id: 'manager', tenantId: 'tenant', roles: ['SERVICE_MANAGER'] } })
  const mod = tab.load('routes/ModelPolicyPage.tsx', {
    '../features/workspace/service-detail-data': { serviceLabels },
    '../features/workspace/ServiceDetailUI': { ServiceCard: 'card', ServiceFacts: 'facts', ServiceHeader: 'detail-header', ServiceNotice: 'notice', ServiceSections: 'sections' },
    '../components/Badges': { StatusBadge: 'badge' },
    react: host.react, 'react/jsx-runtime': host.jsx,
    'react-router-dom': { useLocation: () => location, useParams: () => ({ id: 'model' }) },
    '../api/client': tab.client, '../auth/session': tab.session,
    './registration-data': { useDirectory: (_area, path) => path === '/equipment-models/model'
      ? { value: { id: 'model', name: 'Model', status: modelStatus, equipmentCount: 0 } } : { value: { items: revisions } }, errorText: String },
    './registration-shared': { LoadState: 'load' }, './live-administration.css': {}, './equipment-registration.css': {}, './model-policy.css': {},
  })
  const page = host.render(mod.ModelPolicyPage)
  const sections = nodes(page, node => node.type === 'sections')[0].props.items
  const component = sections.find(item => item.key === (maintenance ? 'maintenance' : 'warranty')).content
  const info = sections[0].content
  const header = nodes(page, node => node.type === 'detail-header')[0].props
  return { sent, requests, sections, header, render: () => host.render(component.type, component.props), renderInfo: () => host.render(info.type, info.props) }
}
const visibleText = node => text(node).replace(/\s+/g, ' ').trim()
const label = (tree, value) => nodes(tree, n => n.type === 'label' && visibleText(n).includes(value))[0]
const button = (tree, value) => nodes(tree, n => n.type === 'button' && visibleText(n) === value)[0]

test('model detail shows zero equipment in the read-only information tab', () => {
  const ui = editor()
  assert.deepEqual(Array.from(ui.sections, item => item.label), ['Thông tin', 'Bảo hành', 'Bảo trì'])
  const facts = nodes(ui.renderInfo(), node => node.type === 'facts')[0].props.items
  assert.equal(facts.find(item => item.label === 'Số thiết bị').value, 0)
  assert.ok(!facts.some(item => item.label === 'Nhóm thiết bị'))
  assert.equal(ui.renderInfo().props.actions, undefined)
  assert.equal(nodes(ui.renderInfo(), node => node.type === 'button' || node.type === 'form').length, 0)
})

test('detail header places a labeled back arrow immediately before the title', () => {
  const tab = webTab(() => {}), host = hooks()
  const { ServiceHeader } = detailUI(tab, host)
  const tree = expand(host.render(ServiceHeader, { back: '/app/equipment-models', backLabel: 'Về danh sách model', title: 'Model' }))
  const [back, heading] = nodes(tree, node => node.props?.className === 'page-title-with-back')[0].props.children
  assert.equal(back.props.to, '/app/equipment-models')
  assert.equal(back.props['aria-label'], 'Về danh sách model')
  assert.equal(heading.type, 'h1')
})

test('model detail links back to the originating registration or falls back to the catalog', () => {
  assert.equal(editor().header.back, '/app/equipment-models')
  const id = 'a05a034d-c9c0-4a76-9b4a-2e8ae2d6ed9c'
  const { header } = editor({}, [], true, 'ACTIVE', { search: `?registrationId=${id}` })
  assert.equal(header.back, `/app/equipment-registrations/${id}`)
  assert.equal(header.backState.registrationStep, 2)
  assert.equal(editor({}, [], true, 'ACTIVE', { search: '?registrationId=invalid' }).header.back, '/app/equipment-models')
})

test('inactive models keep policy review available and disable editing', () => {
  for (const maintenance of [true, false]) {
    const tree = editor({}, [], maintenance, 'INACTIVE').render()
    const form = nodes(tree, node => node.type === 'form')[0]
    assert.equal(nodes(form, node => node.type === 'fieldset')[0].props.disabled, true)
    assert.equal(button(tree, 'Lưu và sử dụng'), undefined)
    assert.ok(nodes(tree, node => node.props?.title === 'Model đang ngừng dùng').length)
  }
})

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
  const submit = nodes(tree, n => n.type === 'form')[0].props.onSubmit
  submit({ preventDefault() {} })
  submit({ preventDefault() {} })
  await settle(); await settle()
  assert.deepEqual(ui.sent[0].rules[0].term, { mode: 'YEARS', years: 5 })
  assert.equal(ui.requests.length, 1)
  assert.equal(ui.requests[0].input.activate, true)
  assert.equal(ui.requests[0].method, 'POST')
  for (const mode of ['WARRANTY_END', 'UNLIMITED']) {
    button(ui.render(), 'Chỉnh sửa').props.onClick()
    tree = ui.render()
    nodes(label(tree, 'Thời hạn bảo trì'), n => n.type === 'select')[0].props.onChange({ target: { value: mode } })
    tree = ui.render()
    assert.equal(nodes(tree, n => n.type === 'label' && text(n).includes('Số năm bảo trì')).length, 0)
    nodes(tree, n => n.type === 'form')[0].props.onSubmit({ preventDefault() {} })
    await settle(); await settle()
    assert.deepEqual(ui.sent.at(-1).rules[0].term, { mode })
  }
})

test('checklist action displays the localized option for the saved action code', () => {
  const ui = editor({ INSPECT: 'Kiểm tra', REPLACE: 'Thay thế' })
  button(ui.render(), 'Thêm lịch bảo trì').props.onClick()
  const action = () => nodes(label(ui.render(), 'Hành động'), n => n.type === 'select')[0]
  assert.equal(action().props.value, 'INSPECT')
  action().props.onChange({ target: { value: 'REPLACE' } })
  const selected = action()
  assert.equal(text(nodes(selected, n => n.type === 'option' && n.props.value === selected.props.value)[0]), 'Thay thế')
})

test('maintenance schedules start collapsed and saving keeps edits from closed sections', async () => {
  const item = { id: 'item', title: 'Kiểm tra bộ lọc', action: 'INSPECT', instructions: '', required: true }
  const rule = { id: 'rule', name: 'Bộ lọc', frequencyValue: 3, frequencyUnit: 'MONTH', firstOccurrence: 1, checklist: [item] }
  const revision = { id: 'draft', status: 'DRAFT', revision: 2, version: 1, body: { name: 'Bảo trì', mode: 'APPLY', rules: [rule] } }
  const ui = editor({ MONTH: 'tháng' }, [revision])
  const details = tree => nodes(tree, node => node.type === 'details')
  const toggle = (node, open) => {
    const section = { open }
    node.props.onToggle({ target: section, currentTarget: section })
  }
  const selector = nodes(label(ui.render(), 'Phiên bản'), node => node.type === 'select')[0]
  selector.props.onChange({ target: { value: revision.id } })
  const [schedule, checklist] = details(ui.render())
  assert.equal(schedule.props.open, false)
  assert.equal(checklist.props.open, false)
  assert.match(text(nodes(schedule, node => node.type === 'summary')[0]), /3\s+tháng.*1\s+hạng mục/)
  toggle(schedule, true)
  toggle(checklist, true)
  let tree = ui.render()
  assert.deepEqual(details(tree).map(node => node.props.open), [true, true])
  nodes(label(tree, 'Bộ phận / công việc'), node => node.type === 'input')[0].props.onChange({ target: { value: 'Vệ sinh bộ lọc' } })
  toggle(details(ui.render())[0], false)
  tree = ui.render()
  assert.equal(details(tree)[0].props.open, false)
  const form = nodes(tree, node => node.type === 'form')[0]
  assert.equal(button(tree, 'Lưu và sử dụng').props.form, form.props.id)
  form.props.onSubmit({ preventDefault() {} })
  await settle(); await settle()
  assert.equal(ui.sent[0].rules[0].checklist[0].title, 'Vệ sinh bộ lọc')
  assert.equal(ui.requests[0].method, 'PUT')
  assert.equal(ui.requests[0].input.activate, true)
})

test('model policy selectors keep all versions and label active and retired policies', () => {
  const revisions = [
    { id: 'replaced', revision: 4, status: 'PUBLISHED', isDefault: false },
    { id: 'draft', revision: 3, status: 'DRAFT' },
    { id: 'retired', revision: 2, status: 'RETIRED' },
    { id: 'active', revision: 1, status: 'PUBLISHED', isDefault: true },
  ]
  for (const maintenance of [false, true]) {
    const tree = editor({ DRAFT: 'Bản nháp' }, revisions, maintenance).render()
    const select = nodes(label(tree, 'Phiên bản'), n => n.type === 'select')[0]
    const options = nodes(select, n => n.type === 'option')
    assert.deepEqual(options.map(n => [n.props.value, visibleText(n)]), [
      ['', 'Tạo chính sách mới'],
      ['replaced', 'Phiên bản 4'],
      ['draft', 'Phiên bản 3'],
      ['retired', 'Phiên bản 2 · Đã ngừng dùng'],
      ['active', 'Phiên bản 1 · Đang sử dụng'],
    ])
  }
})

test('warranty lifecycle changes update the selected revision without a success banner', async () => {
  const body = { name: 'Bảo hành PUMP-200', mode: 'APPLY', durationMonths: 12, terms: 'Bảo hành lỗi sản xuất.' }
  const ui = editor({}, [{ id: 'old-policy', revision: 1, version: 3, status: 'RETIRED', body }], false)
  const selector = nodes(label(ui.render(), 'Phiên bản'), n => n.type === 'select')[0]
  selector.props.onChange({ target: { value: 'old-policy' } })
  const tree = ui.render()
  assert.equal(button(tree, 'Lưu và sử dụng'), undefined)
  button(tree, 'Sử dụng lại').props.onClick()
  await settle(); await settle()
  assert.equal(ui.requests.length, 1)
  assert.match(ui.requests[0].url, /\/warranty-policies\/old-policy\/reactivate$/)
  assert.deepEqual(ui.requests[0].input, { expectedVersion: 3 })
  let updated = ui.render()
  assert.equal(nodes(updated, node => node.props?.role === 'status').length, 0)
  button(updated, 'Ngừng áp dụng cho bàn giao mới').props.onClick()
  await settle(); await settle()
  assert.match(ui.requests[1].url, /\/warranty-policies\/old-policy\/retire$/)
  assert.deepEqual(ui.requests[1].input, { expectedVersion: 4 })
  updated = ui.render()
  assert.ok(button(updated, 'Sử dụng lại'))
  assert.equal(nodes(updated, node => node.props?.role === 'status').length, 0)
})

test('editing maintenance opens the selected revision and saves for the intended lifecycle', async () => {
  for (const isDefault of [true, false]) {
    const body = { name: 'Bảo trì định kỳ', mode: 'APPLY', rules: [] }
    const revision = { id: 'source', revision: 1, version: 3, status: isDefault ? 'PUBLISHED' : 'RETIRED', isDefault, body }
    const ui = editor({}, [revision])
    const input = tree => nodes(label(tree, 'Tên chính sách'), n => n.type === 'input')[0]
    const selector = nodes(label(ui.render(), 'Phiên bản'), n => n.type === 'select')[0]
    selector.props.onChange({ target: { value: revision.id } })
    button(ui.render(), 'Chỉnh sửa').props.onClick()
    assert.equal(input(ui.render()).props.value, body.name)
    input(ui.render()).props.onChange({ target: { value: 'Đã sửa tạm' } })
    button(ui.render(), 'Hủy chỉnh sửa').props.onClick()
    assert.equal(input(ui.render()).props.value, body.name)
    button(ui.render(), 'Chỉnh sửa').props.onClick()
    input(ui.render()).props.onChange({ target: { value: 'Bảo trì cập nhật' } })
    const tree = ui.render()
    assert.ok(button(tree, 'Lưu và sử dụng'))
    nodes(tree, n => n.type === 'form')[0].props.onSubmit({ preventDefault() {} })
    await settle(); await settle()
    assert.equal(ui.requests.length, 1)
    assert.match(ui.requests[0].url, /\/maintenance-profiles\/source\/revise$/)
    assert.equal(ui.requests[0].method, 'POST')
    assert.deepEqual(ui.requests[0].input, { body: { ...body, name: 'Bảo trì cập nhật' }, expectedVersion: 3, publish: true })
  }
})

test('handover coverage is explicit and opting out requires a reason', () => {
  for (const [maintenance, service] of [[false, 'bảo hành'], [true, 'bảo trì']]) {
    const ui = editor({}, [], maintenance)
    const control = nodes(label(ui.render(), `${service[0].toUpperCase()}${service.slice(1)} khi bàn giao`), n => n.type === 'select')[0]
    assert.equal(visibleText(nodes(control, n => n.type === 'option' && n.props.value === 'NONE')[0]), `Không kèm ${service}`)
    control.props.onChange({ target: { value: 'NONE' } })
    const reason = label(ui.render(), `Lý do không kèm ${service}`)
    assert.ok(nodes(reason, n => n.type === 'textarea')[0].props.required)
  }
})

test('applied maintenance terms distinguish finite years, warranty end and legacy unlimited', () => {
  const tab = webTab(() => { throw Error('No HTTP in a policy summary') }), host = hooks()
  const mod = tab.load('routes/ModelPolicyPanels.tsx', {
    '../features/workspace/service-detail-data': { serviceLabels: {} },
    '../features/workspace/maintenance-term': tab.load('features/workspace/maintenance-term.ts'),
    react: host.react, 'react/jsx-runtime': host.jsx,
    '../api/client': tab.client, '../auth/session': tab.session,
    '../features/workspace/ServiceDetailUI': { ServiceCard: ({ children }) => children, ServiceFacts: ({ facts }) => null, ServiceNotice: ({ children }) => children },
    '../features/workspace/workspace-data': { formatDate: (d) => d || '—' },
    './registration-data': {}, './registration-shared': {}, './policy-summary.css': {},
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

import assert from 'node:assert/strict'
import test from 'node:test'
import { hooks, nodes, settle, webTab } from './helpers/web-tab.mjs'
import { expand } from './helpers/service-detail.mjs'
const ruleId = '11111111-1111-4111-8111-111111111111'
const snapshot = {
  handoverDate: '2026-01-31',
  warranty: {
    revisionId: '22222222-2222-4222-8222-222222222222',
    revision: 1,
    body: {
      mode: 'APPLY',
      name: 'Warranty',
      terms: 'Terms',
      reason: '',
      durationMonths: 18,
      coveredCauses: ['MANUFACTURING_DEFECT'],
      exclusions: [],
    },
    startDate: '2026-01-31',
    endDate: '2027-07-30',
  },
  maintenance: {
    revisionId: '33333333-3333-4333-8333-333333333333',
    revision: 1,
    body: {
      mode: 'APPLY',
      name: 'Routine',
      terms: 'Agreed',
      reason: '',
      rules: [
        {
          id: ruleId,
          name: 'Filter',
          frequencyValue: 6,
          frequencyUnit: 'MONTH',
          firstOccurrence: 2,
          checklist: [],
        },
      ],
    },
    firstDueDates: [{ itemId: ruleId, date: '2027-01-31' }],
  },
}
function setup(fetch, changed = () => {}, availability = {}) {
  const earlierWarranty = { id: 'earlier-warranty', revision: 2, status: 'PUBLISHED', body: { ...snapshot.warranty.body, name: 'Earlier warranty' } }
  const warranty = { ...snapshot.warranty, id: snapshot.warranty.revisionId, status: 'PUBLISHED', isDefault: true }
  const maintenance = { ...snapshot.maintenance, id: snapshot.maintenance.revisionId, status: 'PUBLISHED', isDefault: true }
  const tab = webTab((url, options) => {
      if (url.endsWith('/warranty-policies'))
        return Response.json({ items: availability.warranty === false ? [] : [earlierWarranty, warranty, { ...warranty, id: 'draft', status: 'DRAFT' }] })
      if (url.endsWith('/maintenance-profiles'))
        return Response.json({ items: availability.maintenance === false ? [] : [maintenance, { ...maintenance, id: 'retired', status: 'RETIRED' }] })
      return fetch(url, options)
    }),
    host = hooks()
  tab.session.useSession = () => ({
    profile: { id: 'manager', tenantId: 'tenant', roles: ['SERVICE_MANAGER'] },
  })
  const data = tab.load('routes/registration-data.ts', {
    react: host.react,
    '../api/client': tab.client,
    '../auth/session': tab.session,
  })
  const panel = tab.load('routes/ModelPolicyPanels.tsx', {
    '../features/workspace/service-detail-data':tab.load('features/workspace/service-detail-data.ts'),
    '../features/workspace/maintenance-term':tab.load('features/workspace/maintenance-term.ts'),
    '../features/workspace/workspace-data': tab.load('features/workspace/workspace-data.ts', { react: host.react, '../../auth/session': tab.session, '../../api/client': tab.client }),
    '../features/workspace/ServiceDetailUI': {
      ServiceCard: 'card',
      ServiceFacts: 'facts',
      ServiceNotice: 'notice',
    },
    react: host.react,
    'react/jsx-runtime': host.jsx,
    '../api/client': tab.client,
    '../auth/session': tab.session,
    './registration-data': data,
    './registration-shared': { LoadState: 'load' },
    './policy-summary.css': {},
  }).HandoverPolicyPanel
  const props = {
    id: 'registration',
    modelId: 'model',
    version: 7,
    status: 'DRAFT',
    snapshot,
    changed,
  }
  return { host, props, render: () => host.render(panel, props) }
}
const text = (node) =>
  typeof node === 'string'
    ? node
    : Array.isArray(node)
      ? node.map(text).join(' ')
      : node?.props
        ? text(node.props.children)
        : ''
const button = (tree, label) =>
  nodes(tree, (n) => n.type === 'button' && text(n) === label)[0]

async function chooseVersions(s) {
  button(s.render(), 'Chọn phiên bản chính sách Model').props.onClick()
  s.render()
  await settle()
  const tree = expand(s.render())
  const selects = nodes(tree, n => n.type === 'select')
  assert.equal(selects.length, 2)
  return selects
}

function submit(s) {
  nodes(s.render(), n => n.type === 'form')[0].props.onSubmit({ preventDefault() {} })
}

test('version popup previews published options and applies both selected revisions once', async () => {
  let release, sent, posts = 0, reads = 0
  const s = setup(
    (url, init) => {
      assert.match(url, /equipment-registrations\/registration\/model-policies$/)
      posts++
      sent = JSON.parse(init.body)
      return new Promise(resolve => { release = resolve })
    },
    async () => { reads++ },
  )
  assert.equal(nodes(s.render(), n => n.type === 'form').length, 0)
  const [warranty, maintenance] = await chooseVersions(s)
  assert.deepEqual(nodes(warranty, n => n.type === 'option').map(n => n.props.value),
    ['', 'earlier-warranty', snapshot.warranty.revisionId])
  assert.deepEqual(nodes(maintenance, n => n.type === 'option').map(n => n.props.value),
    ['', snapshot.maintenance.revisionId])
  warranty.props.onChange({ target: { value: 'earlier-warranty' } })
  const dialog = nodes(expand(s.render()), n => n.type === 'dialog')[0]
  assert.match(text(dialog), /Earlier warranty.*Routine/)
  submit(s)
  submit(s)
  assert.equal(posts, 1)
  assert.equal(reads, 0)
  assert.deepEqual(sent, {
    expectedVersion: 7,
    warrantyRevisionId: 'earlier-warranty',
    maintenanceRevisionId: snapshot.maintenance.revisionId,
  })
  release(Response.json({ id: 'registration', version: 8 }))
  await settle()
  assert.equal(reads, 1)
  assert.equal(nodes(s.render(), n => n.type === 'form').length, 0)
})

test('unconfigured services can be skipped independently when applying to a new draft', async () => {
  for (const availability of [
    { warranty: true, maintenance: false },
    { warranty: false, maintenance: true },
    { warranty: false, maintenance: false },
  ]) {
    let sent
    const s = setup((_url, init) => {
      sent = JSON.parse(init.body)
      return Response.json({ version: 8 })
    }, () => {}, availability)
    s.props.snapshot = undefined
    const selectors = await chooseVersions(s)
    for (const [index, [service, available]] of Object.entries(availability).entries()) {
      const select = selectors[index]
      assert.equal(select.props.required, false)
      assert.equal(select.props.value === '', !available)
      assert.match(text(select), service === 'warranty' ? /Không áp dụng bảo hành/ : /Không áp dụng bảo trì/)
    }
    assert.equal(button(s.render(), 'Áp dụng').props.disabled, false)
    submit(s)
    await settle()
    assert.deepEqual(sent, {
      expectedVersion: 7,
      warrantyRevisionId: availability.warranty ? snapshot.warranty.revisionId : null,
      maintenanceRevisionId: availability.maintenance ? snapshot.maintenance.revisionId : null,
    })
  }
})

test('exception popup saves both services and preserves their source revisions', async () => {
  let sent
  const s = setup((_url, options) => {
    sent = JSON.parse(options.body)
    return Response.json({ version: 8 })
  })
  button(s.render(), 'Điều chỉnh ngoại lệ').props.onClick()
  const tree = s.render()
  const [warrantyMonths, frequency] = nodes(tree, n => n.type === 'input')
  warrantyMonths.props.onChange({ target: { value: '24' } })
  frequency.props.onChange({ target: { value: '9' } })
  nodes(tree, n => n.type === 'textarea')[0].props.onChange({
    target: { value: 'Customer agreement' },
  })
  submit(s)
  await settle()
  assert.deepEqual(sent, {
    expectedVersion: 7,
    warrantyRevisionId: snapshot.warranty.revisionId,
    maintenanceRevisionId: snapshot.maintenance.revisionId,
    durationMonths: 24,
    maintenanceOverrides: [{ itemId: ruleId, frequencyValue: 9, firstOccurrence: 2 }],
    reason: 'Customer agreement',
  })
})

test('lost preview response offers a read reconciliation without replaying a mutation', async () => {
  let posts = 0, reads = 0
  const s = setup(
    () => {
      posts++
      throw new TypeError('Failed to fetch')
    },
    async () => { reads++ },
  )
  const [warranty] = await chooseVersions(s)
  warranty.props.onChange({ target: { value: 'earlier-warranty' } })
  submit(s)
  await settle()
  let tree = s.render()
  assert.equal(nodes(tree, n => n.props?.role === 'alert').length, 1)
  await button(tree, 'Tải lại kết quả đã lưu').props.onClick()
  tree = s.render()
  assert.equal(posts, 1)
  assert.equal(reads, 1)
  assert.equal(nodes(tree, n => n.props?.role === 'alert').length, 0)
})

test('completed and pending historical views cannot edit policies or submit a preview', () => {
  let calls = 0
  const s = setup(() => {
    calls++
    return Response.json({})
  })
  s.props.status = 'COMPLETED'
  const tree = s.render()
  assert.equal(
    nodes(
      tree,
      (n) => n.type === 'form' || n.type === 'input' || n.type === 'button',
    ).length,
    0,
  )
  s.props.status = 'PENDING_MAINTENANCE'
  assert.equal(nodes(s.render(),n=>n.type==='button'||n.type==='form'||n.type==='input').length,0)
  assert.equal(calls, 0)
})

test('an unsubmitted draft saves customer, equipment and delivery changes before reviewing updated policies', async () => {
  const requests = []
  let equipment = {
    id: 'unit', customerId: 'customer', customerSiteId: 'site', modelId: 'old-model',
    assetCode: 'E-01', serialNumber: 'SN-01', handoverDate: snapshot.handoverDate, purchaseDate: '2025-12-15',
  }
  let draft = {
    id: 'registration', equipmentId: 'unit', status: 'DRAFT', deliveryMethod: 'STORE',
    version: 7, policyPreview: { ...snapshot, modelId: 'old-model' },
    allowedActions: ['edit', 'editEquipmentIdentity', 'submit'],
    warranty: { mode: 'UNCONFIRMED' }, maintenance: { mode: 'UNCONFIRMED' },
  }
  const tab = webTab((url, init) => {
    if (init.method === 'PATCH') {
      const body = JSON.parse(init.body)
      requests.push(body)
      const { expectedVersion, deliveryMethod, handoverDetails, ...equipmentChanges } = body
      equipment = { ...equipment, ...equipmentChanges }
      draft = { ...draft, deliveryMethod, handoverDetails, policyPreview: null, version: expectedVersion + 1 }
      return Response.json(draft)
    }
    if (url.endsWith('/submit')) {
      requests.push(JSON.parse(init.body))
      draft = { ...draft, status: 'COMPLETED', version: 10 }
      return Response.json(draft)
    }
    return Response.json(url.endsWith('/equipment/unit') ? equipment : draft)
  })
  const host = hooks()
  const location = { search: '', state: { registrationStep: 1 } }
  const navigate = () => {}
  tab.session.useSession = () => ({ profile: { id: 'manager', tenantId: 'tenant', roles: ['SERVICE_MANAGER'] } })
  tab.window.location = { origin: 'http://localhost' }
  const { EquipmentRegistrationPage } = tab.load('routes/EquipmentRegistration.tsx', {
    './ModelPolicyPanels': { HandoverPolicyPanel: 'policy-panel', ModelPolicySummary: 'policy-summary' },
    react: host.react, 'react/jsx-runtime': host.jsx,
    'react-router-dom': { useParams: () => ({ id: 'registration' }), useLocation: () => location, useNavigate: () => navigate, Link: 'link', useSearchParams: () => [new URLSearchParams()] },
    '../api/client': tab.client, '../auth/session': tab.session, '../display-names': tab.load('display-names.ts'),
    '../components/Badges': { StatusBadge: 'badge' },
    '../features/workspace/WorkspaceUI': { EquipmentIdentity: 'equipment-identity' },
    '../features/workspace/ServiceDetailUI': { ServiceCard: 'card', ServiceFacts: 'facts', ServiceNotice: 'notice' },
    '../features/workspace/workspace-data': { formatDate: (date) => date },
    './registration-shared': { ModelYouTubePicker: 'model-picker', CustomerYouTubePicker: 'customer-picker', LoadState: 'load', SetupPage: 'setup' },
    './registration-data': {
      useDirectory: (_area, path) => ({ value: path?.endsWith('/sites') ? [] : null }),
      errorText: String, modelSetupError: String,
    },
    qrcode: {}, './equipment-registration.css': {},
  }, { document: new EventTarget() })
  const render = () => host.render(EquipmentRegistrationPage)
  const byType = (tree, type) => nodes(tree, n => n.type === type)[0]
  const edit = (predicate, value) => {
    const input = nodes(render(), predicate)[0]
    assert.equal(input.props.disabled, false)
    input.props.onChange({ target: { value } })
  }
  const activeStep = tree => text(nodes(tree, n => n.props?.['aria-current'] === 'step')[0]).replace(/\s+/g, ' ').trim()
  render()
  await settle()
  button(render(), 'Quay lại').props.onClick()
  byType(render(), 'customer-picker').props.onChange('other-customer')
  edit(n => n.type === 'select' && n.props.value === '', 'other-site')
  button(render(), 'Tiếp tục').props.onClick()
  byType(render(), 'model-picker').props.onChange('new-model')
  edit(n => n.type === 'input' && n.props.value === 'SN-01', 'SN-CORRECTED')
  edit(n => n.type === 'input' && n.props.value === '2025-12-15', '')
  edit(n => n.type === 'select' && n.props['aria-label'] === 'Hình thức bàn giao', 'CUSTOMER_SITE')
  edit(n => n.type === 'textarea' && n.props.maxLength === 2000, 'Thiết bị đã kiểm tra')
  button(render(), 'Tiếp tục').props.onClick()
  await settle()
  let tree = render()
  assert.equal(requests.length, 1)
  const { handoverDetails, ...changes } = requests[0]
  assert.deepEqual(changes, {
    expectedVersion: 7, modelId: 'new-model', customerId: 'other-customer',
    customerSiteId: 'other-site', serialNumber: 'SN-CORRECTED', purchaseDate: null,
    deliveryMethod: 'CUSTOMER_SITE',
  })
  assert.equal(handoverDetails.condition, 'Thiết bị đã kiểm tra')
  assert.equal(byType(tree, 'policy-panel').props.modelId, 'new-model')
  assert.equal(byType(tree, 'policy-panel').props.snapshot, null)
  button(tree, 'Tiếp tục').props.onClick()
  assert.match(activeStep(render()), /Chính sách Model/)
  draft = { ...draft, policyPreview: { ...snapshot, modelId: 'new-model' }, version: 9 }
  await byType(render(), 'policy-panel').props.changed()
  button(render(), 'Tiếp tục').props.onClick()
  tree = render()
  assert.match(activeStep(tree), /Kiểm tra và gửi/)
  assert.equal(byType(tree, 'policy-panel'), undefined)
  assert.equal(byType(tree, 'policy-summary').props.snapshot.modelId, 'new-model')
  assert.equal(button(tree, 'Lưu bản nháp'), undefined)
  assert.equal(nodes(tree, n => n.type === 'input' || n.type === 'select').length, 0)
  button(tree, 'Gửi khách xác nhận').props.onClick()
  await settle()
  assert.deepEqual(requests.at(-1), { expectedVersion: 9 })
})

test('registration directory shows server totals and combines status filters without a handover tab', () => {
  const tab = webTab(() => {}), host = hooks()
  let params = new URLSearchParams('tab=handovers&status=PENDING_CUSTOMER_CONFIRMATION&page=3')
  let requested
  const equipment = { status: 'OUT_OF_SERVICE', assetCode: 'E-01', serialNumber: 'SN-01' }
  const { RegistrationListPage } = tab.load('routes/EquipmentRegistration.tsx', {
    './ModelPolicyPanels': {},
    react: host.react, 'react/jsx-runtime': host.jsx,
    'react-router-dom': { Link: 'link', useSearchParams: () => [params, next => { params = next }] },
    '../api/client': tab.client, '../auth/session': tab.session, '../display-names': tab.load('display-names.ts'),
    '../components/Badges': { StatusBadge: 'badge' },
    '../features/workspace/WorkspaceUI': { EquipmentIdentity: 'equipment-identity' },
    '../features/workspace/ServiceDetailUI': {}, '../features/workspace/workspace-data': {},
    './registration-shared': { DirectoryPagination: 'pagination', LoadState: 'load' },
    './registration-data': {
      useDirectory: (_area, path) => {
        requested = new URL(path, 'http://local')
        return { value: {
          total: 41,
          summary: { total: 47, byEquipmentStatus: { ACTIVE: 6, IN_SERVICE: 0, OUT_OF_SERVICE: 41, RETIRED: 0 } },
          items: [{
            id: 'registration', equipmentId: 'equipment', status: 'PENDING_CUSTOMER_CONFIRMATION', equipment,
            handover: { id: 'handover', status: 'PENDING_CUSTOMER_CONFIRMATION' },
          }],
        } }
      },
    },
    qrcode: {}, './equipment-registration.css': {},
  })
  const render = () => host.render(RegistrationListPage)
  const first = render()
  assert.equal(requested.searchParams.get('handoverStatus'), 'PENDING_CUSTOMER_CONFIRMATION')
  assert.equal(requested.searchParams.get('status'), null)
  assert.equal(requested.searchParams.get('page'), '3')
  assert.equal(nodes(first, node => node.props?.role === 'tablist').length, 0)
  assert.equal(nodes(first, node => node.type === 'equipment-identity')[0].props.equipment, equipment)
  assert.equal(nodes(first, node => node.type === 'badge')[0].props.status, 'OUT_OF_SERVICE')
  assert.equal(nodes(first, node => node.props?.to === '/app/equipment-handovers/handover').length, 1)
  const cards = nodes(first, node => node.props?.className === 'equipment-summary__card')
  assert.equal(cards[0].props.children[1].props.children, '47')
  assert.equal(cards[3].props.children[1].props.children, '41')
  const equipmentFilter = nodes(first, node => node.type === 'select')[1]
  equipmentFilter.props.onChange({ target: { value: 'OUT_OF_SERVICE' } })
  render()
  assert.equal(requested.searchParams.get('equipmentStatus'), 'OUT_OF_SERVICE')
  assert.equal(requested.searchParams.get('handoverStatus'), 'PENDING_CUSTOMER_CONFIRMATION')
  assert.equal(requested.searchParams.get('page'), '1')
})

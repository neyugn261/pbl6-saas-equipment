import assert from 'node:assert/strict'
import test from 'node:test'
import { hooks, nodes, settle, webTab } from './helpers/web-tab.mjs'
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
function setup(fetch, changed = () => {}) {
  const tab = webTab(fetch),
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
    react: host.react,
    'react/jsx-runtime': host.jsx,
    '../api/client': tab.client,
    '../auth/session': tab.session,
    './registration-data': data,
    './registration-shared': { LoadState: 'load' },
  }).HandoverPolicyPanel
  const props = {
    id: 'registration',
    version: 7,
    status: 'DRAFT',
    snapshot,
    changed,
    showCompleteButton: false,
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

test('double click on apply before rerender sends one preview command and waits for stored result', async () => {
  let release,
    posts = 0,
    reads = 0
  const s = setup(
    () => {
      posts++
      return new Promise((resolve) => {
        release = resolve
      })
    },
    async () => {
      reads++
    },
  )
  const tree = s.render(),
    action = button(tree, 'Lấy lại chính sách hiện hành từ Model')
  const first = action.props.onClick(),
    second = action.props.onClick()
  assert.equal(posts, 1)
  assert.equal(reads, 0)
  release(Response.json({ id: 'registration', version: 8 }))
  await Promise.all([first, second])
  assert.equal(reads, 1)
})

test('adjusting a schedule preserves pinned source versions and existing warranty override', async () => {
  let sent
  const s = setup((url, options) => {
    sent = JSON.parse(options.body)
    return Response.json({ version: 8 })
  })
  let tree = s.render()
  const label = nodes(
    tree,
    (n) =>
      n.type === 'label' &&
      text(n).includes('Chu kỳ riêng') &&
      text(n).includes('Filter'),
  )[0]
  nodes(label, (n) => n.type === 'input')[0].props.onChange({
    target: { value: '9' },
  })
  nodes(tree, (n) => n.type === 'textarea')[0].props.onChange({
    target: { value: 'Customer agreement' },
  })
  tree = s.render()
  nodes(tree, (n) => n.type === 'form')[0].props.onSubmit({
    preventDefault() {},
  })
  await settle()
  await settle()
  assert.equal(sent.expectedVersion, 7)
  assert.equal(sent.warrantyRevisionId, snapshot.warranty.revisionId)
  assert.equal(sent.maintenanceRevisionId, snapshot.maintenance.revisionId)
  assert.equal(sent.durationMonths, 18)
  assert.deepEqual(sent.maintenanceOverrides, [
    { itemId: ruleId, frequencyValue: 9, firstOccurrence: 2 },
  ])
})

test('lost preview response offers a read reconciliation without replaying a mutation', async () => {
  let posts = 0,
    reads = 0
  const s = setup(
    () => {
      posts++
      throw new TypeError('Failed to fetch')
    },
    async () => {
      reads++
    },
  )
  await button(
    s.render(),
    'Lấy lại chính sách hiện hành từ Model',
  ).props.onClick()
  let tree = s.render()
  assert.equal(nodes(tree, (n) => n.props?.role === 'alert').length, 1)
  await button(tree, 'Tải lại kết quả đã lưu').props.onClick()
  tree = s.render()
  assert.equal(posts, 1)
  assert.equal(reads, 1)
  assert.equal(nodes(tree, (n) => n.props?.role === 'alert').length, 0)
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
  s.props.status='PENDING_MAINTENANCE';s.props.readOnly=true
  assert.equal(nodes(s.render(),n=>n.type==='button'||n.type==='form'||n.type==='input').length,0)
  assert.equal(calls, 0)
})

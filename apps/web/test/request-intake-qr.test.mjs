import test from 'node:test'
import assert from 'node:assert/strict'
import { hooks, nodes, settle, webTab } from './helpers/web-tab.mjs'
import { draftHook } from './helpers/draft.mjs'

const tab = webTab(() => { throw new Error('Unexpected network call') })
const { requestIntake } = tab.load('features/workspace/request-intake.ts')
const { locationOptions, recordLabel, hideTechnicalIds } = tab.load('display-names.ts')

test('intake points to the next server-authorized action for covered and chargeable requests', () => {
  const base = { status: 'REVIEWING', warrantyCheck: { result: 'IN_WARRANTY' }, assessmentRequired: true }
  assert.equal(requestIntake({ ...base, status: 'NEW', allowedActions: ['review'] }).target, 'request-review')
  assert.equal(requestIntake({ ...base, warrantyCheck: null, allowedActions: ['warranty-check'] }).target, 'request-warranty-check')
  assert.equal(requestIntake({ ...base, allowedActions: ['assess-warranty'] }).target, 'request-assessment')
  assert.equal(requestIntake({ ...base, coverageAssessment: { decision: 'COVERED' }, allowedActions: ['accept'] }).target, 'request-accept')
  const excluded = { ...base, coverageAssessment: { decision: 'NOT_COVERED' } }
  assert.equal(requestIntake({ ...excluded, allowedActions: ['create-estimate'] }).target, 'request-estimate')
  assert.equal(requestIntake({ ...excluded, allowedActions: [] }).target, undefined)
  assert.equal(requestIntake({ ...base, status: 'ACCEPTED', allowedActions: [], resolutionResult: 'UNRESOLVED' }).target, 'request-create-order')
})

test('the estimate step opens an editable draft only with server permission and does not submit it', async () => {
  const h = hooks()
  const calls = []
  const session = { ...tab.session, useSession: () => ({ profile: { id: 'manager', tenantId: 'tenant', roles: ['SERVICE_MANAGER'], userType: 'TENANT_STAFF' } }) }
  const { default: EstimatePanel } = tab.load('routes/EstimatePanel.tsx', {
    react: h.react, 'react/jsx-runtime': h.jsx,
    '../api/client': { ...tab.client, api: { requestsLive: async (...args) => { calls.push(args); return [] } } },
    '../auth/session': session,
    '../features/workspace/service-detail-data': tab.load('features/workspace/service-detail-data.ts'),
    '../features/workspace/use-form-draft': draftHook(tab, h, session),
    '../features/workspace/EstimateReview': { __esModule: true, default: 'estimate-review' },
  })
  const render = (allowedActions, openDraft) => h.render(EstimatePanel, { requestId: 'sr-1', allowedActions, openDraft, onChange() {} })
  const form = tree => nodes(tree, node => node.type === 'form' && node.props.className === 'm2-editor')
  assert.equal(form(render([], 1)).length, 0)
  await settle()
  const active = render(['create-estimate'], 1)
  assert.equal(form(active).length, 1)
  nodes(active, node => node.type === 'button' && node.props.children === 'Đóng biểu mẫu')[0].props.onClick()
  assert.equal(form(render(['create-estimate'], 1)).length, 0)
  assert.deepEqual(calls, [['/service-requests/sr-1/estimates']])
})

test('location paths distinguish duplicate room names and stay within the current site', () => {
  const paths = locationOptions([
    { id: 'a', name: 'Xưởng A', customerSiteId: 'main' },
    { id: 'b', name: 'Xưởng B', customerSiteId: 'main' },
    { id: 'room-a', name: 'Phòng kỹ thuật', parentId: 'a', customerSiteId: 'main' },
    { id: 'room-b', name: 'Phòng kỹ thuật', parentId: 'b', customerSiteId: 'main' },
    { id: 'other', name: 'Chi nhánh khác', customerSiteId: 'remote' },
    { id: 'legacy', name: 'Phòng cũ', parentId: 'other', customerSiteId: 'main' },
  ], 'main')
  const labels = Object.fromEntries(paths.map(({ id, label }) => [id, label]))
  assert.equal(labels['room-a'], 'Xưởng A › Phòng kỹ thuật')
  assert.equal(labels['room-b'], 'Xưởng B › Phòng kỹ thuật')
  assert.equal(labels.legacy, 'Phòng cũ')
  assert.equal(labels.other, undefined)
})

test('record captions keep business codes, suppress UUIDs and provide a readable fallback', () => {
  const id = 'fc69918c-5352-4fa3-9f12-a0da30756943'
  assert.equal(recordLabel('WO-007', 'Bơm thủy lực', 'Lệnh công việc'), 'WO-007 · Bơm thủy lực')
  assert.equal(recordLabel(id, id, 'Lệnh công việc'), 'Lệnh công việc')
  assert.equal(hideTechnicalIds(`WO-007 (${id})`, 'hồ sơ liên quan'), 'WO-007 (hồ sơ liên quan)')
})

test('dossier preview reads QR without issuing a new token and hides print for revoked codes', async () => {
  for (const state of ['ACTIVE', 'NOT_ISSUED', 'REVOKED', 'INELIGIBLE']) {
    const h = hooks()
    const reads = []
    const { default: DossierQr } = tab.load('routes/DossierQr.tsx', {
      react: h.react, 'react/jsx-runtime': h.jsx,
      qrcode: { __esModule: true, default: { toDataURL: async () => 'data:image/png;base64,stub' } },
      '../api/client': { ...tab.client, api: { assetM2: async (...args) => {
        reads.push(args)
        return { state, canPrint: state === 'ACTIVE', code: { url: 'http://localhost:5173/portal/qr/existing' } }
      } } },
      '../auth/session': tab.session, './dossier-qr.css': {},
    })
    const props = { equipmentId: 'asset', assetCode: 'SA-001' }
    h.render(DossierQr, props); await settle()
    const tree = h.render(DossierQr, props)
    assert.deepEqual(reads, [['/equipment/asset/qr-codes']])
    assert.equal(nodes(tree, node => node.type === 'button' && node.props.children === 'In tem QR').length, state === 'ACTIVE' ? 1 : 0)
  }
})

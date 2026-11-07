import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { hooks, nodes, settle, webTab } from './helpers/web-tab.mjs'

function setup(fetch, profile = { id: 'admin', tenantId: 'tenant-a', customerId: null, roles: ['TENANT_ADMIN'], userType: 'TENANT_STAFF' }, params = {}) {
  const tab = webTab(fetch), host = hooks(), navigations = []
  tab.session.useSession = () => ({ profile })
  const directory = tab.load('routes/registration-data.ts', {
    react: host.react, '../api/client': tab.client, '../auth/session': tab.session,
  })
  const pages = tab.load('routes/LiveAdministration.tsx', {
    react: host.react, 'react/jsx-runtime': host.jsx,
    'react-router-dom': { Link: 'link', useNavigate: () => path => navigations.push(path), useParams: () => params },
    '../api/client': tab.client, '../auth/session': tab.session,
    '../components/Badges': { StatusBadge: 'badge' }, './registration-data': directory,
    './live-administration.css': {},
    '../features/workspace/role-workspace': tab.load('features/workspace/role-workspace.ts'),
  }, { FormData: class { constructor(form) { this.form = form } entries() { return Object.entries(this.form.fields) } } })
  return { tab, host, pages, navigations }
}
const strings = tree => JSON.stringify(tree)
const submit = fields => ({ preventDefault() {}, currentTarget: { fields } })

test('Customer Admin manages Customer Users without offering staff roles or managing other Customer Admins', async () => {
  const profile = { id: 'ca', tenantId: 'tenant-a', customerId: 'customer-a', roles: ['CUSTOMER_ADMIN'], userType: 'CUSTOMER' }
  const { host, pages } = setup(async () => Response.json({ items: [
    { id: 'ca', fullName: 'Me', email: 'me@local', roles: ['CUSTOMER_ADMIN'], userType: 'CUSTOMER', status: 'ACTIVE' },
    { id: 'peer', fullName: 'Peer admin', email: 'peer@local', roles: ['CUSTOMER_ADMIN'], userType: 'CUSTOMER', status: 'ACTIVE' },
    { id: 'user', fullName: 'Member', email: 'member@local', roles: ['CUSTOMER_USER'], userType: 'CUSTOMER', status: 'ACTIVE' },
  ], total: 3 }), profile)
  host.render(pages.UsersPage); await settle()
  const tree = host.render(pages.UsersPage)
  assert.equal(nodes(tree, n => n.type === 'button' && n.props.children === 'Gán vai trò').length, 0)
  assert.equal(nodes(tree, n => n.type === 'button' && n.props.children === 'Tạm khóa').length, 1)
  assert.ok(strings(tree).includes('/portal/users/invite'))
  assert.ok(strings(tree).includes('Người dùng khách hàng'))
})

test('legacy mock flags cannot redirect application data to Prism', () => {
  const tab = webTab(() => {}, { VITE_M1_API_MODE: 'mock', VITE_GATEWAY_API_URL: '/edge', VITE_ORGANIZATION_API_URL: '/mock/organization' })
  assert.equal(tab.config.isMockMode, false)
  assert.equal(tab.config.bases.organization, '/edge/api/organization')
  assert.equal(tab.config.bases.asset, '/edge/api/assets')
  assert.equal(tab.config.bases.requests, '/edge/api')
})

test('tenant list queries server pagination and search, never substitutes sample rows', async () => {
  const calls = []
  const { host, pages } = setup((url) => { calls.push(url); return Response.json({ items: [{ id: 'real', code: 'REAL', name: 'Tenant thật', plan: 'BASIC', status: 'ACTIVE' }], total: 22 }) })
  host.render(pages.TenantListPage); await settle()
  let tree = host.render(pages.TenantListPage)
  assert.match(strings(tree), /Tenant thật/)
  nodes(tree, n => n.type === 'form')[0].props.onSubmit(submit({ q: 'Tên & mã' }))
  host.render(pages.TenantListPage); await settle()
  tree = host.render(pages.TenantListPage)
  assert.ok(calls.at(-1).includes('q=T%C3%AAn%20%26%20m%C3%A3'))
  const pager = nodes(tree, n => n.props?.total === 22)[0]
  pager.props.change(2); host.render(pages.TenantListPage); await settle()
  assert.ok(calls.at(-1).includes('page=2'))
})

test('tenant creation sends only Organization fields and opens the committed tenant before admin invitation', async () => {
  const calls = []
  const { host, pages, navigations } = setup((url, options) => { calls.push({ url, options }); return Response.json({ id: 'created-tenant' }) })
  const tree = host.render(pages.TenantCreatePage)
  nodes(tree, n => n.type === 'form')[0].props.onSubmit(submit({ code: ' REAL ', name: ' Công ty ', plan: '' }))
  await settle()
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, '/gateway/api/organization/tenants')
  assert.equal(calls[0].options.method, 'POST')
  assert.deepEqual(JSON.parse(calls[0].options.body), { code: 'REAL', name: 'Công ty' })
  assert.deepEqual(navigations, ['/admin/tenants/created-tenant'])
})

test('missing tenant renders error and no detail/form for a fallback tenant', async () => {
  const { host, pages } = setup(() => Response.json({ message: 'Tenant not found' }, { status: 404 }), undefined, { id: 'missing' })
  host.render(pages.TenantDetailPage); await settle()
  const tree = host.render(pages.TenantDetailPage)
  assert.match(strings(tree), /404.*Tenant not found/)
  assert.equal(nodes(tree, n => n.type === 'form').length, 0)
})

test('portal site reads use current customer; switching session hides old data immediately', async () => {
  const calls = [], profile = { id: 'customer', tenantId: 'tenant', customerId: 'customer-a', roles: ['CUSTOMER_USER'], userType: 'CUSTOMER' }
  const { tab, host, pages } = setup(url => { calls.push(url); return Response.json([{ id: 'site-a', name: 'Site riêng A' }]) }, profile)
  host.render(pages.PortalLocationsPage); await settle()
  assert.match(strings(host.render(pages.PortalLocationsPage)), /Site riêng A/)
  tab.changeSession(); profile.customerId = 'customer-b'
  assert.doesNotMatch(strings(host.render(pages.PortalLocationsPage)), /Site riêng A/)
  assert.ok(calls[0].endsWith('/customers/customer-a/sites'))
  assert.ok(calls[1].endsWith('/customers/customer-b/sites'))
})

test('customer without membership makes no customer-directory request', async () => {
  let calls = 0
  const { host, pages } = setup(() => { calls++; return Response.json([]) }, { id: 'customer', customerId: null, userType: 'CUSTOMER', roles: ['CUSTOMER_USER'] })
  const tree = host.render(pages.PortalLocationsPage); await settle()
  assert.equal(calls, 0)
  assert.match(strings(tree), /chưa được liên kết/)
})

test('users page hides mutations for self and Tenant Admin, posts status for another account', async () => {
  const calls = []
  const { host, pages } = setup((url, options) => {
    calls.push({ url, options })
    return Response.json({ items: [
      { id: 'admin', fullName: 'Self', email: 'a@example.test', roles: ['TENANT_ADMIN'], status: 'ACTIVE' },
      { id: 'protected', fullName: 'Protected', email: 'b@example.test', roles: ['TENANT_ADMIN'], status: 'ACTIVE' },
      { id: 'tech', fullName: 'Technician', email: 'c@example.test', roles: ['TECHNICIAN'], userType: 'TENANT_STAFF', status: 'ACTIVE' },
    ], total: 3 })
  })
  host.render(pages.UsersPage); await settle()
  const tree = host.render(pages.UsersPage)
  const buttons = nodes(tree, n => n.type === 'button' && n.props.children === 'Tạm khóa')
  assert.equal(buttons.length, 1)
  buttons[0].props.onClick(); await settle()
  const post = calls.find(c => c.options.method === 'POST')
  assert.equal(post.url, '/gateway/api/identity/users/tech/status')
  assert.deepEqual(JSON.parse(post.options.body), { status: 'SUSPENDED' })
})

test('runtime route tree has no sample data provider or sample page imports', () => {
  const source = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /from ['"].*sample\/(pages|state|data|services)/)
  assert.doesNotMatch(source, /AppStoreProvider|SampleDashboard|SampleTenant/)
})

test('double submit before React rerenders sends only one tenant creation', async () => {
  let resolve, calls = 0
  const { host, pages } = setup(() => { calls++; return new Promise(yes => { resolve = yes }) })
  const tree = host.render(pages.TenantCreatePage)
  const form = nodes(tree, n => n.type === 'form')[0]
  form.props.onSubmit(submit({ code: 'TEST', name: 'Test', plan: '' }))
  form.props.onSubmit(submit({ code: 'TEST', name: 'Test', plan: '' }))
  assert.equal(calls, 1)
  resolve(Response.json({ id: 'created' })); await settle()
})

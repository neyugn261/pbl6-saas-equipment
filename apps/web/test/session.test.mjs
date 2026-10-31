import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

// Execute the real modules in a fresh tab, with deterministic network ordering.
function tab(fetch) {
  const data = new Map()
  const sessionStorage = {
    get length() {
      return data.size
    },
    key: (index) => [...data.keys()][index] ?? null,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
  }
  const globals = {
    fetch,
    sessionStorage,
    window: new EventTarget(),
    Event,
    AbortSignal,
    console,
  }
  function load(path, imports) {
    const code = ts.transpileModule(
      readFileSync(new URL(path, import.meta.url), 'utf8'),
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          jsx: ts.JsxEmit.ReactJSX,
          target: ts.ScriptTarget.ES2023,
        },
        fileName: path,
      },
    ).outputText
    const exports = {}
    vm.runInNewContext(
      code,
      {
        ...globals,
        exports,
        require: (name) => {
          if (!(name in imports)) throw new Error(`Unexpected import ${name}`)
          return imports[name]
        },
      },
      { filename: path },
    )
    return exports
  }
  const session = load('../src/auth/session.tsx', {
    react: { createContext: () => ({}) },
    'react/jsx-runtime': {},
    '../api/config': { identityBase: 'http://identity.test' },
  })
  const client = load('../src/api/client.ts', {
    '../auth/session': session,
    './config': { bases: { assetM2: 'http://asset.test' } },
  })
  return { session, api: client.api, sessionStorage }
}
function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}
const ok = (value) => Response.json(value)
const tokens = (label) => ({
  accessToken: `access-${label}`,
  refreshToken: `refresh-${label}`,
})
const profile = (label) => ({
  id: label,
  roles: ['SERVICE_MANAGER'],
  tenantId: label,
})

test('parallel refresh requests share one rotation', async () => {
  const response = deferred()
  let calls = 0
  const { session, sessionStorage } = tab(() => {
    calls++
    return response.promise
  })
  sessionStorage.setItem('pbl6.session.refresh', 'old')
  const a = session.refresh(),
    b = session.refresh()
  assert.equal(a, b)
  response.resolve(ok(tokens('new')))
  assert.deepEqual(await Promise.all([a, b]), ['access-new', 'access-new'])
  assert.equal(calls, 1)
})

test('logout cannot be undone by a late successful refresh; rotated token is revoked', async () => {
  const response = deferred(),
    revoked = []
  const { session, sessionStorage } = tab(async (url, options) => {
    if (url.endsWith('/auth/refresh')) return response.promise
    revoked.push(JSON.parse(options.body).refreshToken)
    return ok({})
  })
  sessionStorage.setItem('pbl6.session.refresh', 'old')
  sessionStorage.setItem('pbl6.registration.test', 'pending-request')
  const flight = session.refresh()
  const rejected = assert.rejects(flight, /Phiên đăng nhập đã thay đổi/)
  await session.logout()
  response.resolve(ok(tokens('late')))
  await rejected
  assert.equal(session.getAccessToken(), '')
  assert.equal(sessionStorage.getItem('pbl6.session.refresh'), null)
  assert.equal(sessionStorage.getItem('pbl6.registration.test'), null)
  assert.deepEqual(revoked, ['old', 'refresh-late'])
})

test('an old failed refresh cannot erase a newer login', async () => {
  const response = deferred()
  const { session, sessionStorage } = tab(async (url) => {
    if (url.endsWith('/auth/refresh')) return response.promise
    if (url.endsWith('/auth/login')) return ok(tokens('new'))
    return ok(profile('new'))
  })
  sessionStorage.setItem('pbl6.session.refresh', 'old')
  const rejected = assert.rejects(session.refresh())
  await session.login({ email: 'new@example.test', password: 'test' })
  response.resolve(Response.json({ message: 'expired' }, { status: 401 }))
  await rejected
  assert.equal(session.getAccessToken(), 'access-new')
  assert.equal(sessionStorage.getItem('pbl6.session.refresh'), 'refresh-new')
})

test('mutations receiving 401 refresh authentication without replaying their POST', async () => {
  let writes = 0
  const { session, api } = tab(async (url) => {
    if (url.endsWith('/auth/login')) return ok(tokens('old'))
    if (url.endsWith('/auth/refresh')) return ok(tokens('new'))
    if (url.endsWith('/auth/me')) return ok(profile('one'))
    writes++
    return Response.json({}, { status: 401 })
  })
  await session.login({ email: 'one@example.test', password: 'test' })
  await assert.rejects(
    api.assetM2('/equipment-registrations', { method: 'POST', body: {} }),
    { code: 'AUTHENTICATION_RENEWED' },
  )
  assert.equal(writes, 1)
  assert.equal(session.getAccessToken(), 'access-new')
})

test('a GET may retry once after refresh and retains its response', async () => {
  let reads = 0
  const { session, api } = tab(async (url) => {
    if (url.endsWith('/auth/login')) return ok(tokens('old'))
    if (url.endsWith('/auth/refresh')) return ok(tokens('new'))
    if (url.endsWith('/auth/me')) return ok(profile('one'))
    return ++reads === 1
      ? Response.json({}, { status: 401 })
      : ok({ id: 'equipment' })
  })
  await session.login({ email: 'one@example.test', password: 'test' })
  assert.deepEqual(await api.assetM2('/equipment'), { id: 'equipment' })
  assert.equal(reads, 2)
})

test('a late response body cannot cross the session boundary', async () => {
  const body = deferred(),
    received = deferred()
  const { session, api } = tab(async (url) => {
    if (url.endsWith('/auth/login')) return ok(tokens('old'))
    if (url.endsWith('/auth/me')) return ok(profile('one'))
    received.resolve()
    return { ok: true, status: 200, json: () => body.promise }
  })
  await session.login({ email: 'one@example.test', password: 'test' })
  const rejected = assert.rejects(api.assetM2('/equipment'), {
    code: 'SESSION_CHANGED',
  })
  await received.promise
  session.clearTokens()
  body.resolve({ id: 'old-equipment' })
  await rejected
})

test('a failed request after logout reports SESSION_CHANGED for draft recovery handlers', async () => {
  const response = deferred(),
    received = deferred()
  const { session, api } = tab(async (url) => {
    if (url.endsWith('/auth/login')) return ok(tokens('old'))
    if (url.endsWith('/auth/me')) return ok(profile('one'))
    received.resolve()
    return response.promise
  })
  await session.login({ email: 'one@example.test', password: 'test' })
  const rejected = assert.rejects(
    api.assetM2('/equipment-registrations', { method: 'POST', body: {} }),
    { code: 'SESSION_CHANGED' },
  )
  await received.promise
  session.clearTokens()
  response.reject(new TypeError('Late network failure'))
  await rejected
})

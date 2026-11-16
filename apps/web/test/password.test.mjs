import assert from 'node:assert/strict'
import test from 'node:test'
import { webTab } from './helpers/web-tab.mjs'

test('password recovery uses public Gateway routes and clears the session only after success', async () => {
  const calls = []
  let cleared = 0
  const tab = webTab(async (url, options) => {
    calls.push({ url, options })
    if (url.endsWith('forgot-password')) return Response.json({ message: 'Accepted', challengeId: 'challenge' }, { status: 202 })
    if (JSON.parse(options.body).otp === '000000') return Response.json({ code: 'INVALID_PASSWORD_RESET', message: 'Invalid' }, { status: 400 })
    return new Response(null, { status: 204 })
  })
  const password = tab.load('auth/password.ts', {
    '../api/client': tab.client,
    '../api/config': tab.config,
    './session': { clearTokens: () => { cleared++ } },
  }, { TextEncoder })

  assert.equal((await password.forgotPassword({ email: 'a@example.com', tenantCode: 'MP' })).challengeId, 'challenge')
  assert.equal(calls[0].url, '/gateway/api/identity/auth/forgot-password')
  assert.equal(calls[0].options.headers.Authorization, undefined)
  await assert.rejects(password.resetPassword({ challengeId: 'challenge', otp: '000000', newPassword: 'GoodPassword123!' }), { code: 'INVALID_PASSWORD_RESET' })
  assert.equal(cleared, 0)
  await password.resetPassword({ challengeId: 'challenge', otp: '123456', newPassword: 'GoodPassword123!' })
  assert.equal(cleared, 1)
  assert.equal(calls.at(-1).url, '/gateway/api/identity/auth/reset-password')
})

test('change password sends the active token and does not clear it on failure', async () => {
  let cleared = 0
  let fail = true
  const calls = []
  const tab = webTab(async (url, options) => {
    calls.push({ url, options })
    return fail ? Response.json({ code: 'CURRENT_PASSWORD_INVALID', message: 'Wrong' }, { status: 400 }) : new Response(null, { status: 204 })
  })
  const password = tab.load('auth/password.ts', {
    '../api/client': tab.client,
    '../api/config': tab.config,
    './session': { clearTokens: () => { cleared++ } },
  }, { TextEncoder })
  const input = { currentPassword: 'old', newPassword: 'GoodPassword123!' }
  await assert.rejects(password.changePassword(input), { code: 'CURRENT_PASSWORD_INVALID' })
  assert.equal(cleared, 0)
  fail = false
  await password.changePassword(input)
  assert.equal(cleared, 1)
  assert.equal(calls.at(-1).url, '/gateway/api/identity/auth/change-password')
  assert.equal(calls.at(-1).options.headers.Authorization, 'Bearer access-token')
})

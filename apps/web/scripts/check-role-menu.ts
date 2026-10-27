import assert from 'node:assert/strict'
import { ROLE_CODES, permissionsOf } from '../../../packages/auth/src/catalog'
import { creators, has, home, menu } from '../src/auth/access'

const permissionByPath = {
  '/customers': 'customer:read',
  '/equipment': 'equipment:read',
  '/requests': 'service_request:read',
  '/tenants': 'tenant:read',
  '/users/invite': 'user:manage',
} as const

assert.deepEqual(
  menu.map((item) => item.path),
  Object.keys(permissionByPath),
)

for (const role of ROLE_CODES) {
  const permissions = permissionsOf([role])
  const visible = menu
    .filter((item) => has([role], item.roles))
    .map((item) => item.path)
  const expected = menu
    .filter((item) =>
      permissions.has(
        permissionByPath[item.path as keyof typeof permissionByPath],
      ),
    )
    .map((item) => item.path)

  assert.deepEqual(visible, expected, `${role}: menu differs from RBAC catalog`)
  assert.equal(home([role]), expected.length ? '/dashboard' : '/403', `${role}: home route`)
  assert.equal(
    has([role], creators),
    permissions.has('service_request:create'),
    `${role}: create request route`,
  )
}

assert.equal(has(['UNKNOWN_ROLE'], menu[0].roles), false)
assert.equal(home(['UNKNOWN_ROLE']), '/403')
console.log(`${ROLE_CODES.length} role menus PASS`)

import type { Role } from '../types/domain'

export const menu: { path: string; label: string; roles: Role[] }[] = [
  {
    path: '/customers',
    label: 'Khách hàng',
    roles: [
      'TENANT_ADMIN',
      'SERVICE_MANAGER',
      'DISPATCHER',
      'TECHNICIAN',
      'CUSTOMER_ADMIN',
      'CUSTOMER_USER',
    ],
  },
  {
    path: '/equipment',
    label: 'Thiết bị',
    roles: [
      'TENANT_ADMIN',
      'SERVICE_MANAGER',
      'DISPATCHER',
      'INVENTORY_STAFF',
      'TECHNICIAN',
      'CUSTOMER_ADMIN',
      'CUSTOMER_USER',
    ],
  },
  {
    path: '/requests',
    label: 'Yêu cầu dịch vụ',
    roles: [
      'TENANT_ADMIN',
      'SERVICE_MANAGER',
      'DISPATCHER',
      'TECHNICIAN',
      'CUSTOMER_ADMIN',
      'CUSTOMER_USER',
    ],
  },
  { path: '/tenants', label: 'Doanh nghiệp', roles: ['PLATFORM_ADMIN'] },
  {
    path: '/users/invite',
    label: 'Mời người dùng',
    roles: ['TENANT_ADMIN', 'CUSTOMER_ADMIN'],
  },
]

export const creators: Role[] = [
  'SERVICE_MANAGER',
  'CUSTOMER_ADMIN',
  'CUSTOMER_USER',
]
export const has = (roles: readonly string[], allowed: readonly string[]) =>
  roles.some((role) => allowed.includes(role))
export const home = (roles: string[]) =>
  menu.some((item) => has(roles, item.roles)) ? '/dashboard' : '/403'

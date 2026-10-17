/**
 * Fixed RBAC catalog shared by every service (ADR 0001, ADR 0004).
 *
 * - Roles are created by identity_db migration 0001_init; tenants cannot add,
 *   rename or delete them.
 * - Permissions and role_permissions are written to identity_db by
 *   `pnpm --filter identity-service db:seed` from THIS file, and every service
 *   authorizes with the same map through `@RequirePermissions()`. A change is
 *   one PR to this file: seed and enforcement can never disagree.
 * - The permission list is still PROVISIONAL (ADR 0001 open point #1): the
 *   team reviews it before it is moved into an identity_db migration.
 *
 * Code format: <resource>:<action>.
 */
export const CATALOG_STATUS = 'PROVISIONAL' as const;

export const USER_TYPES = ['PLATFORM_STAFF', 'TENANT_STAFF', 'CUSTOMER'] as const;
export type UserType = (typeof USER_TYPES)[number];

/** Role code -> the only account type that may hold it (trigger in identity_db). */
export const ROLE_USER_TYPES = {
  PLATFORM_ADMIN: 'PLATFORM_STAFF',
  TENANT_ADMIN: 'TENANT_STAFF',
  SERVICE_MANAGER: 'TENANT_STAFF',
  DISPATCHER: 'TENANT_STAFF',
  INVENTORY_STAFF: 'TENANT_STAFF',
  TECHNICIAN: 'TENANT_STAFF',
  CUSTOMER_ADMIN: 'CUSTOMER',
  CUSTOMER_USER: 'CUSTOMER',
} as const satisfies Record<string, UserType>;

export type RoleCode = keyof typeof ROLE_USER_TYPES;
export const ROLE_CODES = Object.keys(ROLE_USER_TYPES) as RoleCode[];

export function isRoleCode(value: unknown): value is RoleCode {
  return typeof value === 'string' && value in ROLE_USER_TYPES;
}

export function isPermissionCode(value: unknown): value is PermissionCode {
  return typeof value === 'string' && value in PERMISSIONS;
}

/** Union of the permissions of `roles`; unknown role codes grant nothing. */
export function permissionsOf(roles: readonly string[]): Set<PermissionCode> {
  const result = new Set<PermissionCode>();
  for (const role of roles) {
    if (isRoleCode(role)) {
      for (const permission of ROLE_PERMISSIONS[role]) {
        result.add(permission);
      }
    }
  }
  return result;
}

export const PERMISSIONS = {
  'tenant:read': 'View tenants',
  'tenant:manage': 'Create, suspend and update tenants',
  'user:read': 'View users of the tenant',
  'user:manage': 'Invite, update and disable users of the tenant',
  'role:read': 'View the fixed role catalog',
  'role:assign': 'Assign roles to users of the tenant',
  'branch:manage': 'Manage internal branches',
  'customer:read': 'View customers, sites, locations and contacts',
  'customer:manage': 'Manage customers, sites, locations and contacts',
  'equipment:read': 'View equipment, warranties and history',
  'equipment:manage': 'Register and update equipment and models',
  'warranty:manage': 'Manage warranties',
  'qr:manage': 'Create, revoke and reprint equipment QR codes',
  'service_request:create': 'Create service requests',
  'service_request:read': 'View service requests',
  'service_request:review':
    'Review, accept or reject service requests and record warranty checks',
  'service_request:comment_internal':
    'Read and write internal request comments',
  'cost_estimate:manage': 'Create and send cost estimates',
  'cost_estimate:respond':
    'Approve or reject cost estimates on behalf of the customer',
  'work_order:read': 'View work orders',
  'work_order:manage': 'Create, schedule and cancel work orders',
  'work_order:assign': 'Assign and reassign technicians',
  'work_order:execute': 'Accept, start and complete assigned work orders',
  'service_report:submit': 'Submit service reports for assigned work orders',
  'technician:manage': 'Manage technician profiles and skills',
  'maintenance:read': 'View maintenance plans and tasks',
  'maintenance:manage': 'Manage maintenance plans and tasks',
  'inventory:read': 'View parts, warehouses and stock',
  'inventory:manage':
    'Receive, adjust and transfer stock; manage parts and warehouses',
  'inventory:issue': 'Issue parts to work orders',
  'notification:read': 'Read own notifications',
  'report:read': 'View operational reports',
} as const satisfies Record<string, string>;

export type PermissionCode = keyof typeof PERMISSIONS;

export const ROLE_PERMISSIONS: Record<RoleCode, readonly PermissionCode[]> = {
  PLATFORM_ADMIN: [
    'tenant:read',
    'tenant:manage',
    'role:read',
    'notification:read',
  ],
  TENANT_ADMIN: [
    'user:read',
    'user:manage',
    'role:read',
    'role:assign',
    'branch:manage',
    'customer:read',
    'customer:manage',
    'equipment:read',
    'equipment:manage',
    'warranty:manage',
    'qr:manage',
    'service_request:read',
    'work_order:read',
    'technician:manage',
    'maintenance:read',
    'inventory:read',
    'notification:read',
    'report:read',
  ],
  SERVICE_MANAGER: [
    'customer:read',
    'customer:manage',
    'equipment:read',
    'equipment:manage',
    'warranty:manage',
    'qr:manage',
    'service_request:create',
    'service_request:read',
    'service_request:review',
    'service_request:comment_internal',
    'cost_estimate:manage',
    'work_order:read',
    'work_order:manage',
    'work_order:assign',
    'technician:manage',
    'maintenance:read',
    'maintenance:manage',
    'inventory:read',
    'notification:read',
    'report:read',
  ],
  DISPATCHER: [
    'customer:read',
    'equipment:read',
    'service_request:read',
    'service_request:comment_internal',
    'work_order:read',
    'work_order:assign',
    'maintenance:read',
    'notification:read',
  ],
  INVENTORY_STAFF: [
    'equipment:read',
    'work_order:read',
    'inventory:read',
    'inventory:manage',
    'inventory:issue',
    'notification:read',
  ],
  TECHNICIAN: [
    'customer:read',
    'equipment:read',
    'service_request:read',
    'service_request:comment_internal',
    'work_order:read',
    'work_order:execute',
    'service_report:submit',
    'inventory:read',
    'notification:read',
  ],
  // Customer roles are additionally limited to their own Customer
  // (customer_user_memberships) by the owning services.
  CUSTOMER_ADMIN: [
    'customer:read',
    'equipment:read',
    'service_request:create',
    'service_request:read',
    'cost_estimate:respond',
    'maintenance:read',
    'notification:read',
  ],
  CUSTOMER_USER: [
    'equipment:read',
    'service_request:create',
    'service_request:read',
    'notification:read',
  ],
};

/**
 * PROVISIONAL permission catalog — NOT APPROVED.
 *
 * ADR 0001 "Open points" #1: the permission catalog and role_permissions must
 * be agreed before they become part of a migration. Until then they live in
 * this seed, which is idempotent and re-syncs role_permissions to exactly
 * what is listed here, so the catalog can be edited and re-seeded freely.
 *
 * The role catalog itself is fixed and seeded by migration 0001_init.
 * Code format: <resource>:<action>.
 */
export const CATALOG_STATUS = 'PROVISIONAL' as const;

export const PERMISSIONS: Record<string, string> = {
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
};

export const ROLE_PERMISSIONS: Record<string, string[]> = {
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

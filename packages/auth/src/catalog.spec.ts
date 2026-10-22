import {
  ASSIGNABLE_ROLES,
  canAssignRole,
  PERMISSIONS,
  permissionsOf,
  ROLE_CODES,
  ROLE_PERMISSIONS,
  ROLE_USER_TYPES,
} from './catalog';

describe('RBAC catalog', () => {
  it('has the eight fixed roles of migration 0001_init', () => {
    expect(ROLE_CODES.sort()).toEqual(
      [
        'CUSTOMER_ADMIN',
        'CUSTOMER_USER',
        'DISPATCHER',
        'INVENTORY_STAFF',
        'PLATFORM_ADMIN',
        'SERVICE_MANAGER',
        'TECHNICIAN',
        'TENANT_ADMIN',
      ].sort(),
    );
    expect(Object.keys(ROLE_PERMISSIONS).sort()).toEqual([...ROLE_CODES].sort());
  });

  it('only grants permissions that exist', () => {
    for (const permissions of Object.values(ROLE_PERMISSIONS)) {
      for (const permission of permissions) {
        expect(PERMISSIONS).toHaveProperty([permission]);
      }
    }
  });

  it('never gives staff-only permissions to customer roles', () => {
    const staffOnly = ['work_order:manage', 'work_order:assign', 'work_order:execute', 'service_request:review', 'service_request:comment_internal', 'inventory:manage'];
    for (const role of ROLE_CODES.filter((code) => ROLE_USER_TYPES[code] === 'CUSTOMER')) {
      for (const permission of staffOnly) {
        expect(ROLE_PERMISSIONS[role]).not.toContain(permission);
      }
    }
  });

  it('unions permissions of several roles and ignores unknown codes', () => {
    const permissions = permissionsOf(['DISPATCHER', 'TECHNICIAN', 'NOPE']);
    expect(permissions.has('work_order:assign')).toBe(true);
    expect(permissions.has('work_order:execute')).toBe(true);
    expect(permissionsOf(['NOPE']).size).toBe(0);
  });

  it('lets both customer roles read their own customer (ADR 0006)', () => {
    expect(ROLE_PERMISSIONS.CUSTOMER_ADMIN).toContain('customer:read');
    expect(ROLE_PERMISSIONS.CUSTOMER_USER).toContain('customer:read');
  });

  it('only lets the Platform Admin grant TENANT_ADMIN', () => {
    for (const role of ROLE_CODES) {
      expect(canAssignRole([role], 'TENANT_ADMIN')).toBe(role === 'PLATFORM_ADMIN');
    }
  });

  it('keeps customer admins inside customer roles', () => {
    expect(ASSIGNABLE_ROLES.CUSTOMER_ADMIN).toEqual(['CUSTOMER_USER']);
    expect(canAssignRole(['CUSTOMER_ADMIN'], 'TECHNICIAN')).toBe(false);
    expect(canAssignRole(['CUSTOMER_ADMIN'], 'CUSTOMER_ADMIN')).toBe(false);
  });

  it('gives role:assign to every tenant-side role that may assign', () => {
    for (const role of ROLE_CODES) {
      if (role !== 'PLATFORM_ADMIN' && ASSIGNABLE_ROLES[role].length > 0) {
        expect(ROLE_PERMISSIONS[role]).toContain('role:assign');
      }
    }
  });

  it('ignores unknown roles on either side', () => {
    expect(canAssignRole(['NOPE'], 'TECHNICIAN')).toBe(false);
    expect(canAssignRole(['TENANT_ADMIN'], 'NOPE')).toBe(false);
  });
});

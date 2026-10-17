import {
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
});

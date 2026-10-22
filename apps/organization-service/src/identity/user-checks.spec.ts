import type { Principal, RoleCode } from '@pbl6/auth';
import type { IdentityClient, IdentityUser } from './identity.client';
import { assertCanManageUser, requireUser } from './user-checks';

const TENANT = '11111111-1111-4111-8111-111111111111';

function caller(...roles: RoleCode[]): Principal {
  return {
    userId: 'caller',
    sessionId: 's',
    tenantId: TENANT,
    userType: roles[0].startsWith('CUSTOMER') ? 'CUSTOMER' : 'TENANT_STAFF',
    roles,
    permissions: new Set(),
    customerId: null,
    accessToken: 'token',
    expiresAt: new Date(),
  };
}

function account(roles: string[], userType: IdentityUser['userType'] = 'CUSTOMER'): IdentityUser {
  return { id: 'u', tenantId: TENANT, userType, status: 'ACTIVE', roles, email: 'u@x', fullName: 'U' };
}

describe('assertCanManageUser', () => {
  it('lets a Customer Admin manage CUSTOMER_USER accounts only', () => {
    expect(() => assertCanManageUser(caller('CUSTOMER_ADMIN'), account(['CUSTOMER_USER']))).not.toThrow();
    expect(() => assertCanManageUser(caller('CUSTOMER_ADMIN'), account(['CUSTOMER_ADMIN']))).toThrow(
      expect.objectContaining({ response: expect.objectContaining({ code: 'ROLE_NOT_ASSIGNABLE' }) }),
    );
  });

  it('lets a Tenant Admin manage both customer roles', () => {
    expect(() =>
      assertCanManageUser(caller('TENANT_ADMIN'), account(['CUSTOMER_ADMIN', 'CUSTOMER_USER'])),
    ).not.toThrow();
  });
});

describe('requireUser', () => {
  const client = (user: IdentityUser | null): IdentityClient => ({ findUser: async () => user });

  it('returns an account of the expected type in the caller tenant', async () => {
    const user = account(['CUSTOMER_USER']);
    await expect(requireUser(client(user), caller('TENANT_ADMIN'), 'u', 'CUSTOMER', 'X')).resolves.toBe(user);
  });

  it('answers 422 for a missing account, another tenant or the wrong type', async () => {
    const code = (promise: Promise<unknown>) =>
      promise.catch((error: { response: { code: string } }) => error.response.code);
    expect(await code(requireUser(client(null), caller('TENANT_ADMIN'), 'u', 'CUSTOMER', 'X'))).toBe('USER_NOT_FOUND');
    const foreign = { ...account(['CUSTOMER_USER']), tenantId: 'other' };
    expect(await code(requireUser(client(foreign), caller('TENANT_ADMIN'), 'u', 'CUSTOMER', 'X'))).toBe('USER_NOT_FOUND');
    const staff = account(['TECHNICIAN'], 'TENANT_STAFF');
    expect(await code(requireUser(client(staff), caller('TENANT_ADMIN'), 'u', 'CUSTOMER', 'WRONG'))).toBe('WRONG');
  });
});

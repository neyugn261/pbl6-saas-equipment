import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { Principal } from './principal';
import { assertInScope, dataScope, isInScope, scopeWhere } from './scope';

const TENANT = 't-1';
function principal(overrides: Partial<Principal>): Principal {
  return {
    userId: 'u',
    sessionId: 's',
    tenantId: TENANT,
    userType: 'TENANT_STAFF',
    roles: [],
    permissions: new Set(),
    customerId: null,
    accessToken: 'x',
    expiresAt: new Date(),
    ...overrides,
  };
}

describe('dataScope', () => {
  it('gives staff the whole tenant', () => {
    expect(dataScope(principal({}))).toEqual({ tenantId: TENANT, customerId: null });
  });

  it('limits customer accounts to their customer', () => {
    expect(dataScope(principal({ userType: 'CUSTOMER', customerId: 'c-1' }))).toEqual({
      tenantId: TENANT,
      customerId: 'c-1',
    });
  });

  it('refuses customer accounts without a linked customer', () => {
    expect(() => dataScope(principal({ userType: 'CUSTOMER', customerId: null }))).toThrow(
      ForbiddenException,
    );
  });

  it('refuses platform staff on tenant data', () => {
    expect(() =>
      dataScope(principal({ userType: 'PLATFORM_STAFF', tenantId: null })),
    ).toThrow(ForbiddenException);
  });
});

describe('scope filters', () => {
  const staff = { tenantId: TENANT, customerId: null };
  const customer = { tenantId: TENANT, customerId: 'c-1' };

  it('builds Prisma where fragments', () => {
    expect(scopeWhere(staff)).toEqual({ tenantId: TENANT });
    expect(scopeWhere(customer)).toEqual({ tenantId: TENANT, customerId: 'c-1' });
  });

  it('hides rows of other tenants and customers as 404', () => {
    expect(isInScope(staff, { tenantId: TENANT, customerId: 'c-2' })).toBe(true);
    expect(isInScope(customer, { tenantId: TENANT, customerId: 'c-2' })).toBe(false);
    expect(isInScope(staff, { tenantId: 'other' })).toBe(false);
    expect(() => assertInScope(customer, { tenantId: TENANT, customerId: 'c-2' })).toThrow(
      NotFoundException,
    );
    expect(() => assertInScope(staff, null)).toThrow(NotFoundException);
    const row = { tenantId: TENANT, customerId: 'c-1', id: 'r' };
    expect(assertInScope(customer, row)).toBe(row);
  });
});

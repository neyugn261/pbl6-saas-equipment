import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  BranchAccessClient,
  BranchScopeGuard,
  BranchScoped,
  assertBranchAccess,
  branchWhere,
  staffBranchId,
} from './branch-scope';
import type { Principal } from './principal';

const branch = '00000000-0000-4000-8000-000000000301';
const other = '00000000-0000-4000-8000-000000000302';
const principal = (overrides: Partial<Principal> = {}): Principal => ({
  userId: '00000000-0000-4000-8000-000000000001',
  sessionId: '00000000-0000-4000-8000-000000000002',
  tenantId: '00000000-0000-4000-8000-000000000003',
  customerId: null,
  roles: ['SERVICE_MANAGER'],
  userType: 'TENANT_STAFF',
  permissions: new Set(),
  accessToken: 'caller-token',
  expiresAt: new Date(),
  ...overrides,
});
@BranchScoped()
class Controller {
  read() {}
}
const execution = (p: Principal) => ({
  getHandler: () => Controller.prototype.read,
  getClass: () => Controller,
  switchToHttp: () => ({ getRequest: () => ({ user: p }) }),
});

describe('branch access boundaries', () => {
  it('fails closed when branch context is missing, including mixed staff roles', () => {
    expect(() => branchWhere(principal())).toThrow(ForbiddenException);
    expect(() =>
      branchWhere(principal({ roles: ['SERVICE_MANAGER', 'TECHNICIAN'] })),
    ).toThrow(ForbiddenException);
  });
  it('allows only the resolved branch and hides other branches and unallocated records', () => {
    const p = principal({ branchId: branch });
    expect(branchWhere(p)).toEqual({ branchId: branch });
    expect(() => assertBranchAccess(p, other)).toThrow(NotFoundException);
    expect(() => assertBranchAccess(p, null)).toThrow(NotFoundException);
    expect(() => assertBranchAccess(p, branch)).not.toThrow();
  });
  it('Tenant Admin has tenant-wide scope; customer restrictions remain the owning service responsibility', () => {
    expect(
      staffBranchId(principal({ roles: ['TENANT_ADMIN', 'TECHNICIAN'] })),
    ).toBeNull();
    expect(
      branchWhere(
        principal({ userType: 'CUSTOMER', roles: ['CUSTOMER_USER'] }),
      ),
    ).toEqual({});
  });
  it('resolves each request from Organization and overwrites any preexisting branch', async () => {
    const p = principal({ branchId: other });
    const lookup = {
      context: jest
        .fn()
        .mockResolvedValue({
          tenantId: p.tenantId,
          userId: p.userId,
          branch: { id: branch },
        }),
    };
    const guard = new BranchScopeGuard(
      new Reflector(),
      lookup as unknown as BranchAccessClient,
    );
    await expect(guard.canActivate(execution(p) as never)).resolves.toBe(true);
    expect(p.branchId).toBe(branch);
    expect(lookup.context).toHaveBeenCalledWith(p);
    lookup.context.mockResolvedValue({ branch: null });
    await expect(guard.canActivate(execution(p) as never)).rejects.toThrow(
      ForbiddenException,
    );
  });
  it('never falls back to whole tenant when membership lookup fails', async () => {
    const lookup = {
      context: jest.fn().mockRejectedValue(new Error('unavailable')),
    };
    const guard = new BranchScopeGuard(
      new Reflector(),
      lookup as unknown as BranchAccessClient,
    );
    await expect(
      guard.canActivate(execution(principal()) as never),
    ).rejects.toThrow('unavailable');
    expect(lookup.context).toHaveBeenCalledTimes(1);
  });
  it('does not require a primary branch for Tenant Admin or customer', async () => {
    const lookup = { context: jest.fn() };
    const guard = new BranchScopeGuard(
      new Reflector(),
      lookup as unknown as BranchAccessClient,
    );
    await guard.canActivate(
      execution(principal({ roles: ['TENANT_ADMIN'] })) as never,
    );
    await guard.canActivate(
      execution(principal({ userType: 'CUSTOMER' })) as never,
    );
    expect(lookup.context).not.toHaveBeenCalled();
  });
});

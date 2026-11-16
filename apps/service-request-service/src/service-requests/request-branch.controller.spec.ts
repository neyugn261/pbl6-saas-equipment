import { RequestBranchController } from './request-branch.controller';
import type { PrismaService } from '../prisma/prisma.service';
import type { BranchAccessClient, Principal } from '@pbl6/auth';

describe('branch allocation concurrency contract', () => {
  function fixture(branchId: string | null = null) {
    const row = { id: 'request', branchId, status: 'NEW', activeWorkOrderId: null };
    const tx = { $queryRaw: jest.fn(), serviceRequest: { findFirst: jest.fn().mockResolvedValue(row), update: jest.fn() }, requestStatusHistory: { create: jest.fn() } };
    const db = { $transaction: (fn: (value: typeof tx) => unknown) => fn(tx) };
    const branches = { activeBranch: jest.fn() };
    const controller = new RequestBranchController(db as unknown as PrismaService, branches as unknown as BranchAccessClient);
    const principal = { tenantId: 'tenant', userId: 'admin' } as Principal;
    return { controller, principal, tx };
  }
  it('rejects stale expected branch without appending history', async () => {
    const { controller, principal, tx } = fixture('winner');
    await expect(controller.allocate(principal, 'request', { branchId: 'loser', expectedBranchId: null, reason: 'allocate' })).rejects.toMatchObject({ response: { code: 'BRANCH_VERSION_CONFLICT' } });
    expect(tx.serviceRequest.update).not.toHaveBeenCalled();
    expect(tx.requestStatusHistory.create).not.toHaveBeenCalled();
  });
  it('does not create history or event for an unchanged allocation', async () => {
    const { controller, principal, tx } = fixture('branch');
    await expect(controller.allocate(principal, 'request', { branchId: 'branch', expectedBranchId: 'branch', reason: 'retry' })).resolves.toEqual({ id: 'request', branchId: 'branch' });
    expect(tx.requestStatusHistory.create).not.toHaveBeenCalled();
    expect(tx.serviceRequest.update).not.toHaveBeenCalled();
  });
});

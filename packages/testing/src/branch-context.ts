import type { Principal } from '@pbl6/auth';
/** Organization contract double for suites with explicit fake upstreams. Real membership isolation is covered by test:branch-scope. */
export const FIXTURE_BRANCH = '00000000-0000-4000-8000-00000000ba01';
export const fixtureBranchContext = (branchId = FIXTURE_BRANCH) => ({
  context: async (p: Principal) => ({
    tenantId: p.tenantId,
    userId: p.userId,
    branch: { id: branchId, code: 'TEST', name: 'Fixture branch' },
  }),
  activeBranch: async () => undefined,
});

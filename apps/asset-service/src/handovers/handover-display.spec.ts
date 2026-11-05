import type { Principal } from '@pbl6/auth';
import type { DisplayNameLookup } from '@pbl6/service-kit';
import { HandoverService } from './handover.service';
import type { HandoverRepository } from './handover.repository';
import type { HandoverAuthorization } from './handover-authorization';
import type { OrganizationClient } from '../organization/organization-client';

describe('handover display-only enrichment', () => {
  const row = { id: 'handover', createdBy: 'creator', snapshot: { customerSiteId: 'site', customerName: 'Original customer' } };
  const repo = { list: async () => ({ rows: [row, row], total: 2 }) } as unknown as HandoverRepository;
  const auth = { check: async () => undefined } as unknown as HandoverAuthorization;
  const organization = {} as OrganizationClient;
  it('adds names outside the historical snapshot in two batches and does not expose staff names to customers', async () => {
    const calls: string[] = [];
    const names = { lookup: async (kind: string) => {
      calls.push(kind); return new Map([['creator', { name: 'Creator' }], ['site', { name: 'Renamed site', code: 'S1' }]]);
    } } as unknown as DisplayNameLookup;
    const service = new HandoverService(repo, auth, organization, names);
    const result = await service.list({ userType: 'TENANT_STAFF' } as Principal, { page: 1, pageSize: 20 });
    expect(calls).toEqual(['users', 'sites']);
    expect(result.items[0]).toMatchObject({ createdBy: 'creator', createdByName: 'Creator', customerSiteName: 'Renamed site', snapshot: row.snapshot });
    expect(result.items[0].snapshot).toBe(row.snapshot);
    calls.length = 0;
    const customer = await service.list({ userType: 'CUSTOMER' } as Principal, { page: 1, pageSize: 20 });
    expect(calls).toEqual(['sites']);
    expect(customer.items[0]).not.toHaveProperty('createdByName');
    expect(customer.items[0]).not.toHaveProperty('createdBy');
  });
  it('preserves handover content when display lookup is not configured', async () => {
    const result = await new HandoverService(repo, auth, organization).list({ userType: 'TENANT_STAFF' } as Principal, { page: 1, pageSize: 20 });
    expect(result.items[0]).toMatchObject({ id: 'handover', snapshot: row.snapshot, createdByName: null, customerSiteName: null });
  });
});

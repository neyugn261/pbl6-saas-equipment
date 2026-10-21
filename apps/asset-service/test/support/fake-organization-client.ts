import type { Principal } from '@pbl6/auth';
import type {
  CustomerRef,
  OrganizationClient,
  SiteRef,
} from '../../src/organization/organization-client';

/** Explicit test double. Missing configured references return null. */
export class FakeOrganizationClient implements OrganizationClient {
  readonly customers = new Map<string, CustomerRef>();
  readonly sites = new Map<string, SiteRef>();

  async getCustomer(customerId: string, _principal: Principal): Promise<CustomerRef | null> {
    return this.customers.get(customerId) ?? null;
  }

  async getSite(
    customerId: string,
    siteId: string,
    locationId: string | undefined,
    _principal: Principal,
  ): Promise<SiteRef | null> {
    const site = this.sites.get(`${customerId}:${siteId}`);
    if (!site || (locationId !== undefined && site.locationId !== locationId)) return null;
    return site;
  }
}

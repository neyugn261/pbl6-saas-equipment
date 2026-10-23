import type { Principal } from '@pbl6/auth';
import { ServiceHttpClient } from '@pbl6/service-kit';
import type { CustomerRef, OrganizationClient, SiteRef } from './organization-client';

/** No fallback: 404 is a missing reference; other upstream failures propagate. */
export class OrganizationHttpClient implements OrganizationClient {
  constructor(private readonly http: ServiceHttpClient) {}

  getCustomer(customerId: string, principal: Principal): Promise<CustomerRef | null> {
    return this.http.getOrNull<CustomerRef>(
      `/internal/customers/${customerId}`,
      { accessToken: principal.accessToken },
    );
  }

  getSite(
    customerId: string,
    siteId: string,
    locationId: string | undefined,
    principal: Principal,
  ): Promise<SiteRef | null> {
    return this.http.getOrNull<SiteRef>(
      `/internal/customers/${customerId}/sites/${siteId}`,
      {
        accessToken: principal.accessToken,
        query: { locationId },
      },
    );
  }
}

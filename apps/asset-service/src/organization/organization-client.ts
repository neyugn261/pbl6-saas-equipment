import type { Principal } from '@pbl6/auth';

/** Responses from Organization's internal endpoints (docs/api/organization.yaml). */
export interface CustomerRef {
  id: string;
  code: string;
  name: string;
  status: 'ACTIVE' | 'INACTIVE';
}

export interface SiteRef {
  customerId: string;
  siteId: string;
  siteStatus: 'ACTIVE' | 'INACTIVE';
  locationId: string | null;
  defaultServicingBranchId: string | null;
}

export interface OrganizationClient {
  getCustomer(customerId: string, principal: Principal): Promise<CustomerRef | null>;
  getSite(
    customerId: string,
    siteId: string,
    locationId: string | undefined,
    principal: Principal,
  ): Promise<SiteRef | null>;
}

export const ORGANIZATION_CLIENT = Symbol('ORGANIZATION_CLIENT');

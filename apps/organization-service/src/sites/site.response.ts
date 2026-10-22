import type { CustomerSite, Location } from '../generated/prisma/client.js';

export interface SiteResponse {
  id: string;
  customerId: string;
  code: string;
  name: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  defaultServicingBranchId: string | null;
  status: string;
}

export interface LocationResponse {
  id: string;
  customerSiteId: string;
  parentId: string | null;
  code: string | null;
  name: string;
  type: string;
  description: string | null;
  status: string;
}

export function toSiteResponse(site: CustomerSite): SiteResponse {
  return {
    id: site.id,
    customerId: site.customerId,
    code: site.code,
    name: site.name,
    address: site.address,
    latitude: site.latitude === null ? null : site.latitude.toNumber(),
    longitude: site.longitude === null ? null : site.longitude.toNumber(),
    defaultServicingBranchId: site.defaultServicingBranchId,
    status: site.status,
  };
}

export function toLocationResponse(location: Location): LocationResponse {
  return {
    id: location.id,
    customerSiteId: location.customerSiteId,
    parentId: location.parentId,
    code: location.code,
    name: location.name,
    type: location.type,
    description: location.description,
    status: location.status,
  };
}

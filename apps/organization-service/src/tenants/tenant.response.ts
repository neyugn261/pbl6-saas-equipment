import type { Tenant } from '../generated/prisma/client.js';

export interface TenantResponse {
  id: string;
  code: string;
  name: string;
  status: string;
  plan: string;
  createdAt: Date;
  updatedAt: Date;
}

export function toTenantResponse(tenant: Tenant): TenantResponse {
  return {
    id: tenant.id,
    code: tenant.code,
    name: tenant.name,
    status: tenant.status,
    plan: tenant.plan,
    createdAt: tenant.createdAt,
    updatedAt: tenant.updatedAt,
  };
}

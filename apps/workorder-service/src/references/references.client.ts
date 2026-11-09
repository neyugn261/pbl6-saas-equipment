import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ServiceHttpClient } from '@pbl6/service-kit';
import type { AppEnv } from '../config/env.validation';

export const REFERENCES = Symbol('WORKORDER_REFERENCES');
export interface UserRef {
  primaryBranchId?: string | null;
  id: string;
  tenantId: string | null;
  userType: string;
  roles: string[];
  status: string;
}
export interface BranchRef {
  id: string;
  status: string;
}
export interface RequestRef {
  branchId?: string | null;
  id: string;
  status: string;
  equipmentId: string;
  customerId: string;
  type: string;
  priority: string;
  title: string;
}
export interface EquipmentRef {
  id: string;
  customerId: string;
  customerSiteId: string | null;
  locationId: string | null;
}
export interface ReferencesClient {
  user(id: string, token: string): Promise<UserRef | null>;
  branch(id: string, token: string): Promise<BranchRef | null>;
  request(id: string, token: string): Promise<RequestRef | null>;
  equipment(id: string, token: string): Promise<EquipmentRef | null>;
}
@Injectable()
export class HttpReferencesClient implements ReferencesClient {
  private readonly identity: ServiceHttpClient;
  private readonly organization: ServiceHttpClient;
  private readonly requests: ServiceHttpClient;
  private readonly assets: ServiceHttpClient;
  constructor(config: ConfigService<AppEnv, true>) {
    this.identity = new ServiceHttpClient({
      name: 'identity-service',
      baseUrl: config.get('IDENTITY_SERVICE_URL', { infer: true }),
    });
    this.organization = new ServiceHttpClient({
      name: 'organization-service',
      baseUrl: config.get('ORGANIZATION_SERVICE_URL', { infer: true }),
    });
    this.requests = new ServiceHttpClient({
      name: 'service-request-service',
      baseUrl: config.get('SERVICE_REQUEST_SERVICE_URL', { infer: true }),
    });
    this.assets = new ServiceHttpClient({
      name: 'asset-service',
      baseUrl: config.get('ASSET_SERVICE_URL', { infer: true }),
    });
  }
  async user(id: string, accessToken: string) {
    const user = await this.identity.getOrNull<UserRef>(`/internal/users/${id}`,
      {
        accessToken,
      },
    );
    if (!user) return null;
    const context = await this.organization.get<{
      tenantId: string;
      userId: string;
      branch: { id: string } | null;
    }>(`/internal/staff/${id}/branch`, { accessToken });
    if (context.tenantId !== user.tenantId || context.userId !== user.id)
      throw new Error('Invalid staff branch reference');
    return { ...user, primaryBranchId: context.branch?.id ?? null };
  }
  branch(id: string, accessToken: string) {
    return this.organization.getOrNull<BranchRef>(`/internal/branches/${id}`, {
      accessToken,
    });
  }
  request(id: string, accessToken: string) {
    return this.requests.getOrNull<RequestRef>(
      `/internal/service-requests/${id}`,
      { accessToken },
    );
  }
  equipment(id: string, accessToken: string) {
    return this.assets.getOrNull<EquipmentRef>(`/internal/equipment/${id}`, {
      accessToken,
    });
  }
}

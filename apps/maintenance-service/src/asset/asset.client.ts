import type { Principal } from '@pbl6/auth';
import { ServiceHttpClient } from '@pbl6/service-kit';
export const ASSET_CLIENT = Symbol('ASSET_CLIENT');
export interface EquipmentRef {
  id: string;
  customerId: string;
  customerSiteId: string | null;
  status: string;
  snapshotVersion: number;
}
export interface AssetClient {
  equipment(id: string, principal: Principal): Promise<EquipmentRef | null>;
}
export class AssetHttpClient implements AssetClient {
  constructor(private readonly http: ServiceHttpClient) {}
  equipment(id: string, principal: Principal) {
    return this.http.getOrNull<EquipmentRef>(`/internal/equipment/${id}`, {
      accessToken: principal.accessToken,
    });
  }
}

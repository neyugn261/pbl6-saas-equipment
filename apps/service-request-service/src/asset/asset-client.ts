import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ServiceHttpClient } from '@pbl6/service-kit';
import type { AppEnv } from '../config/env.validation';

export const ASSET_CLIENT = Symbol('ASSET_CLIENT');

export interface EquipmentReference {
  id: string;
  customerId: string;
  customerSiteId: string;
  locationId: string | null;
  assetCode: string;
  status: 'ACTIVE' | 'IN_SERVICE' | 'OUT_OF_SERVICE' | 'RETIRED';
}

export interface WarrantyStatus {
  equipmentId: string;
  date: string;
  result: 'IN_WARRANTY' | 'OUT_OF_WARRANTY' | 'NO_WARRANTY';
  warrantyId: string | null;
  endDate: string | null;
}

export interface AssetClient {
  getEquipment(
    id: string,
    accessToken: string,
  ): Promise<EquipmentReference | null>;
  getWarrantyStatus(
    id: string,
    accessToken: string,
  ): Promise<WarrantyStatus | null>;
}

@Injectable()
export class HttpAssetClient implements AssetClient {
  private readonly http: ServiceHttpClient;

  constructor(config: ConfigService<AppEnv, true>) {
    this.http = new ServiceHttpClient({
      name: 'asset-service',
      baseUrl: config.get('ASSET_SERVICE_URL', { infer: true }),
    });
  }

  getEquipment(
    id: string,
    accessToken: string,
  ): Promise<EquipmentReference | null> {
    return this.http.getOrNull<EquipmentReference>(
      `/internal/equipment/${id}`,
      {
        accessToken,
      },
    );
  }

  getWarrantyStatus(
    id: string,
    accessToken: string,
  ): Promise<WarrantyStatus | null> {
    return this.http.getOrNull<WarrantyStatus>(
      `/equipment/${id}/warranty-status`,
      { accessToken },
    );
  }
}

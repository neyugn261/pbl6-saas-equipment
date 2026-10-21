import type {
  AssetClient,
  EquipmentReference,
  WarrantyStatus,
} from './asset-client';

export class FakeAssetClient implements AssetClient {
  readonly equipment = new Map<string, EquipmentReference>();
  readonly warranties = new Map<string, WarrantyStatus>();

  async getEquipment(
    id: string,
    _accessToken: string,
  ): Promise<EquipmentReference | null> {
    return this.equipment.get(id) ?? null;
  }

  async getWarrantyStatus(
    id: string,
    _accessToken: string,
  ): Promise<WarrantyStatus | null> {
    return this.warranties.get(id) ?? null;
  }
}

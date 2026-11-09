import type {
  AssetClient,
  EquipmentReference,
  WarrantyStatus,
} from './asset-client';

export class FakeAssetClient implements AssetClient {
  constructor(private readonly defaultBranchId?: string) {}
  readonly equipment = new Map<string, EquipmentReference>();
  readonly warranties = new Map<string, WarrantyStatus>();

  async getEquipment(
    id: string,
    _accessToken: string,
  ): Promise<EquipmentReference | null> {
    const row = this.equipment.get(id);
    return row
      ? {
          ...row,
          defaultServicingBranchId:
            row.defaultServicingBranchId ?? this.defaultBranchId,
        }
      : null;
  }

  async getWarrantyStatus(
    id: string,
    _accessToken: string,
  ): Promise<WarrantyStatus | null> {
    return this.warranties.get(id) ?? null;
  }
}

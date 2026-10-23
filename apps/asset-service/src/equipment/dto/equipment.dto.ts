import { PaginationQueryDto } from '@pbl6/service-kit';
import { IsIn, IsISO8601, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength, ValidateIf } from 'class-validator';

export const EQUIPMENT_STATUSES = ['ACTIVE', 'IN_SERVICE', 'OUT_OF_SERVICE', 'RETIRED'] as const;
export type EquipmentStatus = (typeof EQUIPMENT_STATUSES)[number];
export const WARRANTY_RESULTS = ['IN_WARRANTY', 'OUT_OF_WARRANTY', 'NO_WARRANTY'] as const;
export type WarrantyResult = (typeof WARRANTY_RESULTS)[number];

export class CreateEquipmentDto {
  @IsUUID() modelId: string;
  @IsUUID() customerId: string;
  @IsUUID() customerSiteId: string;
  @ValidateIf((_, value) => value !== undefined) @IsUUID() locationId?: string;
  @IsString() @MinLength(1) @MaxLength(100) assetCode: string;
  @IsString() @MinLength(1) @MaxLength(150) serialNumber: string;
  @ValidateIf((_, value) => value !== undefined) @Matches(/^\d{4}-\d{2}-\d{2}$/) @IsISO8601({ strict: true }) installationDate?: string;
  @ValidateIf((_, value) => value !== undefined) @Matches(/^\d{4}-\d{2}-\d{2}$/) @IsISO8601({ strict: true }) handoverDate?: string;
}

export class PatchEquipmentDto {
  @ValidateIf((_, value) => value !== undefined) @IsUUID() customerSiteId?: string;
  @ValidateIf((_, value) => value !== undefined && value !== null) @IsUUID() locationId?: string | null;
  @ValidateIf((_, value) => value !== undefined && value !== null)
  @Matches(/^\d{4}-\d{2}-\d{2}$/) @IsISO8601({ strict: true }) installationDate?: string | null;
  @ValidateIf((_, value) => value !== undefined && value !== null)
  @Matches(/^\d{4}-\d{2}-\d{2}$/) @IsISO8601({ strict: true }) handoverDate?: string | null;
  @ValidateIf((_, value) => value !== undefined) @IsIn(EQUIPMENT_STATUSES) status?: EquipmentStatus;
}

export class ListEquipmentQueryDto extends PaginationQueryDto {
  @IsOptional() @IsString() @MaxLength(100) q?: string;
  @IsOptional() @IsUUID() customerId?: string;
  @IsOptional() @IsUUID() siteId?: string;
  @IsOptional() @IsIn(EQUIPMENT_STATUSES) status?: EquipmentStatus;
  @IsOptional() @IsIn(WARRANTY_RESULTS) warranty?: WarrantyResult;
  @IsOptional() @IsIn(['createdAt', '-createdAt', 'assetCode', '-assetCode'])
  sort: 'createdAt' | '-createdAt' | 'assetCode' | '-assetCode' = '-createdAt';
}

export class HistoryQueryDto extends PaginationQueryDto {}

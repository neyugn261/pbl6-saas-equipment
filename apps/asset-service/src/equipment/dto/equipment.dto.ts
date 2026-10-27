import { PaginationQueryDto } from '@pbl6/service-kit';
import {
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
  Validate,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from 'class-validator';

@ValidatorConstraint({ name: 'specifications', async: false })
export class SpecificationsValidator implements ValidatorConstraintInterface {
  validate(value: unknown) {
    return (
      !!value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      Object.keys(value).length <= 50 &&
      Object.entries(value).every(
        ([key, item]) =>
          key.trim().length > 0 &&
          key.length <= 80 &&
          !['__proto__', 'constructor', 'prototype'].includes(key) &&
          (typeof item === 'boolean' ||
            (typeof item === 'number' && Number.isFinite(item)) ||
            (typeof item === 'string' && item.length <= 500)),
      )
    );
  }
  defaultMessage() {
    return 'Specifications must contain at most 50 short keys with string, finite number or boolean values';
  }
}

export const EQUIPMENT_STATUSES = [
  'ACTIVE',
  'IN_SERVICE',
  'OUT_OF_SERVICE',
  'RETIRED',
] as const;
export type EquipmentStatus = (typeof EQUIPMENT_STATUSES)[number];
export const WARRANTY_RESULTS = [
  'IN_WARRANTY',
  'OUT_OF_WARRANTY',
  'NO_WARRANTY',
] as const;
export type WarrantyResult = (typeof WARRANTY_RESULTS)[number];

export class CreateEquipmentDto {
  @ValidateIf((_, v) => v !== undefined)
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  displayName?: string;
  @IsOptional() @IsString() @MaxLength(10000) description?: string | null;
  @IsOptional()
  @Validate(SpecificationsValidator)
  technicalSpecifications?: Record<string, string | number | boolean> | null;
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsISO8601({ strict: true })
  commissionedDate?: string | null;
  @IsUUID() modelId: string;
  @IsUUID() customerId: string;
  @IsUUID() customerSiteId: string;
  @ValidateIf((_, value) => value !== undefined) @IsUUID() locationId?: string;
  @IsString() @MinLength(1) @MaxLength(100) assetCode: string;
  @IsString() @MinLength(1) @MaxLength(150) serialNumber: string;
  @ValidateIf((_, value) => value !== undefined)
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsISO8601({ strict: true })
  installationDate?: string;
  @ValidateIf((_, value) => value !== undefined)
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsISO8601({ strict: true })
  handoverDate?: string;
}

export class PatchEquipmentDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(200) displayName?:
    string | null;
  @IsOptional() @IsString() @MaxLength(10000) description?: string | null;
  @IsOptional()
  @Validate(SpecificationsValidator)
  technicalSpecifications?: Record<string, string | number | boolean> | null;
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsISO8601({ strict: true })
  commissionedDate?: string | null;
  @ValidateIf((_, v) => v !== undefined)
  @IsIn(['UNKNOWN', 'OPERATIONAL', 'DEGRADED', 'NOT_OPERATIONAL'])
  operationalStatus?: string;
  @ValidateIf((_, v) => v !== undefined)
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  reason?: string;
  @IsOptional() @IsString() @MaxLength(2000) customerNote?: string | null;
  @ValidateIf((_, value) => value !== undefined)
  @IsUUID()
  customerSiteId?: string;
  @ValidateIf((_, value) => value !== undefined && value !== null)
  @IsUUID()
  locationId?: string | null;
  @ValidateIf((_, value) => value !== undefined && value !== null)
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsISO8601({ strict: true })
  installationDate?: string | null;
  @ValidateIf((_, value) => value !== undefined && value !== null)
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsISO8601({ strict: true })
  handoverDate?: string | null;
  @ValidateIf((_, value) => value !== undefined)
  @IsIn(EQUIPMENT_STATUSES)
  status?: EquipmentStatus;
}

export class ListEquipmentQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(['UNKNOWN', 'OPERATIONAL', 'DEGRADED', 'NOT_OPERATIONAL'])
  operationalStatus?: string;
  @IsOptional() @IsString() @MaxLength(100) q?: string;
  @IsOptional() @IsUUID() customerId?: string;
  @IsOptional() @IsUUID() siteId?: string;
  @IsOptional() @IsIn(EQUIPMENT_STATUSES) status?: EquipmentStatus;
  @IsOptional() @IsIn(WARRANTY_RESULTS) warranty?: WarrantyResult;
  @IsOptional()
  @IsIn(['createdAt', '-createdAt', 'assetCode', '-assetCode'])
  sort: 'createdAt' | '-createdAt' | 'assetCode' | '-assetCode' = '-createdAt';
}

export class HistoryQueryDto extends PaginationQueryDto {}

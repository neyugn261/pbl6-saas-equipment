import { Transform } from 'class-transformer';
import {
  IsIn,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';
import { PaginationQueryDto } from '@pbl6/service-kit';
import { IfPresent, trim } from '../../common/validation';

export const TENANT_STATUSES = ['ACTIVE', 'SUSPENDED', 'DISABLED'] as const;
export type TenantStatus = (typeof TENANT_STATUSES)[number];

export class CreateTenantDto {
  /** Used at login (`tenantCode`); cannot change later. */
  @Transform(trim)
  @Matches(/^[A-Z0-9][A-Z0-9-]{1,49}$/, {
    message: 'code must be 2-50 uppercase letters, digits or dashes',
  })
  code: string;

  @Transform(trim)
  @IsString()
  @Length(1, 200)
  name: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 50)
  plan?: string;
}

export class UpdateTenantDto {
  @IfPresent()
  @Transform(trim)
  @IsString()
  @Length(1, 200)
  name?: string;

  @IfPresent()
  @Transform(trim)
  @IsString()
  @Length(1, 50)
  plan?: string;
}

export class ChangeTenantStatusDto {
  @IsIn(TENANT_STATUSES)
  status: TenantStatus;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(1000)
  reason?: string;
}

export class ListTenantsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @IsIn(TENANT_STATUSES)
  status?: TenantStatus;
}

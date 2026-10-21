import { Transform } from 'class-transformer';
import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
} from 'class-validator';
import {
  ACTIVE_STATUSES,
  type ActiveStatus,
  IfPresent,
  trim,
} from '../../common/validation';

export class CreateSiteDto {
  @Transform(trim)
  @IsString()
  @Length(1, 50)
  code: string;

  @Transform(trim)
  @IsString()
  @Length(1, 150)
  name: string;

  @Transform(trim)
  @IsString()
  @Length(1, 2000)
  address: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(-90)
  @Max(90)
  latitude?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(-180)
  @Max(180)
  longitude?: number;

  @IsOptional()
  @IsUUID()
  defaultServicingBranchId?: string;
}

export class UpdateSiteDto {
  @IfPresent()
  @Transform(trim)
  @IsString()
  @Length(1, 150)
  name?: string;

  @IfPresent()
  @Transform(trim)
  @IsString()
  @Length(1, 2000)
  address?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(-90)
  @Max(90)
  latitude?: number | null;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(-180)
  @Max(180)
  longitude?: number | null;

  @IsOptional()
  @IsUUID()
  defaultServicingBranchId?: string | null;

  @IfPresent()
  @IsIn(ACTIVE_STATUSES)
  status?: ActiveStatus;
}

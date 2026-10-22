import { Transform } from 'class-transformer';
import {
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
} from 'class-validator';
import {
  ACTIVE_STATUSES,
  type ActiveStatus,
  IfPresent,
  trim,
} from '../../common/validation';

export const LOCATION_TYPES = ['BUILDING', 'FLOOR', 'ROOM', 'AREA'] as const;
export type LocationType = (typeof LOCATION_TYPES)[number];

export class CreateLocationDto {
  @IsOptional()
  @IsUUID()
  parentId?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 50)
  code?: string;

  @Transform(trim)
  @IsString()
  @Length(1, 150)
  name: string;

  @IsIn(LOCATION_TYPES)
  type: LocationType;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  description?: string;
}

export class UpdateLocationDto {
  /** `null` moves the location to the top of the site. */
  @IsOptional()
  @IsUUID()
  parentId?: string | null;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 50)
  code?: string | null;

  @IfPresent()
  @Transform(trim)
  @IsString()
  @Length(1, 150)
  name?: string;

  @IfPresent()
  @IsIn(LOCATION_TYPES)
  type?: LocationType;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @IfPresent()
  @IsIn(ACTIVE_STATUSES)
  status?: ActiveStatus;
}

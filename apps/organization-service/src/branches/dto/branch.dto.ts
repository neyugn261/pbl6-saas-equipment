import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';
import {
  ACTIVE_STATUSES,
  type ActiveStatus,
  IfPresent,
  trim,
} from '../../common/validation';

export class CreateBranchDto {
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
  @Transform(trim)
  @IsString()
  @MaxLength(30)
  phone?: string;

  @IsOptional()
  @Transform(trim)
  @IsEmail()
  @MaxLength(255)
  email?: string;
}

export class UpdateBranchDto {
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
  @Transform(trim)
  @IsString()
  @MaxLength(30)
  phone?: string | null;

  @IsOptional()
  @Transform(trim)
  @IsEmail()
  @MaxLength(255)
  email?: string | null;

  @IfPresent()
  @IsIn(ACTIVE_STATUSES)
  status?: ActiveStatus;
}

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

export class CreateCustomerDto {
  @Transform(trim)
  @IsString()
  @Length(1, 50)
  code: string;

  @Transform(trim)
  @IsString()
  @Length(1, 200)
  name: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(50)
  taxCode?: string;

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

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  address?: string;
}

export class UpdateCustomerDto {
  @IfPresent()
  @Transform(trim)
  @IsString()
  @Length(1, 200)
  name?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(50)
  taxCode?: string | null;

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

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  address?: string | null;

  @IfPresent()
  @IsIn(ACTIVE_STATUSES)
  status?: ActiveStatus;
}

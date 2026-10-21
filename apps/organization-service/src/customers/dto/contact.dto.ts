import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
} from 'class-validator';
import { IfPresent, trim } from '../../common/validation';

export class CreateContactDto {
  @IsOptional()
  @IsUUID()
  customerSiteId?: string | null;

  @Transform(trim)
  @IsString()
  @Length(1, 150)
  name: string;

  @IsOptional()
  @Transform(trim)
  @IsEmail()
  @MaxLength(255)
  email?: string | null;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(30)
  phone?: string | null;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  position?: string | null;

  /** True moves the primary flag from the current primary contact. */
  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}

export class UpdateContactDto {
  @IsOptional()
  @IsUUID()
  customerSiteId?: string | null;

  @IfPresent()
  @Transform(trim)
  @IsString()
  @Length(1, 150)
  name?: string;

  @IsOptional()
  @Transform(trim)
  @IsEmail()
  @MaxLength(255)
  email?: string | null;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(30)
  phone?: string | null;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  position?: string | null;

  @IfPresent()
  @IsBoolean()
  isPrimary?: boolean;
}

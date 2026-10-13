import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class LoginDto {
  @Transform(trim)
  @IsEmail()
  @MaxLength(255)
  email: string;

  @IsString()
  @Length(1, 128)
  password: string;

  /** Omit for the platform scope (Platform Admin). */
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 50)
  tenantCode?: string;
}

import {
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class InviteTenantAdminDto {
  @IsEmail()
  @MaxLength(255)
  email!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(150)
  fullName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;
}

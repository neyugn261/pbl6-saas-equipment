import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class NewPasswordDto {
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^a-zA-Z0-9])/, {
    message:
      'password must contain uppercase, lowercase, digit and special character',
  })
  newPassword!: string;
}

export class ChangePasswordDto extends NewPasswordDto {
  @IsString()
  @Length(1, 128)
  currentPassword!: string;
}

export class ForgotPasswordDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsEmail()
  @MaxLength(255)
  email!: string;

  /** Same scope selection as login. Omit only for platform accounts. */
  @IsOptional()
  @IsString()
  @Length(1, 50)
  tenantCode?: string;
}

export class ResetPasswordDto extends NewPasswordDto {
  @IsUUID()
  challengeId!: string;

  @IsString()
  @Matches(/^\d{6}$/)
  otp!: string;
}

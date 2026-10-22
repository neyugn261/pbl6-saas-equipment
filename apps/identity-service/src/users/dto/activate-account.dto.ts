import { IsString, MinLength, MaxLength, Matches } from 'class-validator';

export class ActivateAccountDto {
  @IsString()
  token!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^a-zA-Z0-9])/, {
    message:
      'password must contain uppercase, lowercase, digit and special character',
  })
  password!: string;
}

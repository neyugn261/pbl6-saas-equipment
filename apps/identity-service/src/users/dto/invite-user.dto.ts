import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  IsArray,
  ArrayMaxSize,
} from 'class-validator';
import { ROLE_CODES, USER_TYPES } from '@pbl6/auth';
import type { RoleCode, UserType } from '@pbl6/auth';

export class InviteUserDto {
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

  @IsEnum(USER_TYPES)
  userType!: UserType;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsEnum(ROLE_CODES, { each: true })
  roles?: RoleCode[];
}

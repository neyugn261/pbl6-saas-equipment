import {
  IsOptional,
  IsEnum,
  IsInt,
  Min,
  Max,
  IsString,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ROLE_CODES, USER_TYPES } from '@pbl6/auth';
import type { RoleCode, UserType } from '@pbl6/auth';

export class ListUsersDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 20;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @IsEnum(['INVITED', 'ACTIVE', 'SUSPENDED', 'DISABLED'])
  status?: string;

  @IsOptional()
  @IsEnum(ROLE_CODES)
  role?: RoleCode;

  @IsOptional()
  @IsEnum(USER_TYPES)
  userType?: UserType;
}

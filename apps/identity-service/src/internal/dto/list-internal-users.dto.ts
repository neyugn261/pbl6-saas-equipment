import {
  IsOptional,
  IsEnum,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ROLE_CODES, USER_TYPES } from '@pbl6/auth';
import type { RoleCode, UserType } from '@pbl6/auth';

export class ListInternalUsersDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize?: number = 50;

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

import { IsArray, IsEnum } from 'class-validator';
import { ROLE_CODES } from '@pbl6/auth';
import type { RoleCode } from '@pbl6/auth';

export class AssignRolesDto {
  @IsArray()
  @IsEnum(ROLE_CODES, { each: true })
  roles!: RoleCode[];
}

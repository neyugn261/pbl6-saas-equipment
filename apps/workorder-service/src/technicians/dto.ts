import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { PaginationQueryDto } from '@pbl6/service-kit';

export const TECHNICIAN_STATUSES = [
  'AVAILABLE',
  'BUSY',
  'OFF_DUTY',
  'INACTIVE',
];
export class ListTechniciansDto extends PaginationQueryDto {
  @ValidateIf((_o, v) => v !== undefined)
  @IsString()
  @MaxLength(100)
  q?: string;
  @ValidateIf((_o, v) => v !== undefined) @IsUUID() branchId?: string;
  @ValidateIf((_o, v) => v !== undefined) @IsUUID() skillId?: string;
  @ValidateIf((_o, v) => v !== undefined)
  @IsIn(TECHNICIAN_STATUSES)
  status?: string;
}
export class CreateTechnicianDto {
  @IsUUID() userId: string;
  @IsUUID() branchId: string;
  @IsString() @MinLength(1) @MaxLength(50) employeeCode: string;
  @ValidateIf((_o, v) => v !== undefined)
  @IsIn(TECHNICIAN_STATUSES)
  status?: string;
}
export class PatchTechnicianDto {
  @ValidateIf((_o, v) => v !== undefined) @IsUUID() branchId?: string;
  @ValidateIf((_o, v) => v !== undefined)
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  employeeCode?: string;
  @ValidateIf((_o, v) => v !== undefined)
  @IsIn(TECHNICIAN_STATUSES)
  status?: string;
}
export class CreateSkillDto {
  @IsString() @Matches(/^[A-Z0-9][A-Z0-9_-]{0,49}$/) code: string;
  @IsString() @MinLength(1) @MaxLength(100) name: string;
  @IsOptional() @IsString() description?: string | null;
}
export class PatchSkillDto {
  @ValidateIf((_o, v) => v !== undefined)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;
  @IsOptional() @IsString() description?: string | null;
}
export class TechnicianSkillDto {
  @IsUUID() skillId: string;
  @IsOptional() @IsInt() @Min(1) @Max(5) level?: number | null;
}

import { PaginationQueryDto } from '@pbl6/service-kit';
import {
  IsIn,
  IsInt,
  IsISO8601,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import type { FrequencyUnit } from '../common/calendar';
const optional = (_: unknown, value: unknown) => value !== undefined;
const nullable = (_: unknown, value: unknown) =>
  value !== undefined && value !== null;
const units = ['DAY', 'WEEK', 'MONTH', 'YEAR'];
const statuses = ['ACTIVE', 'PAUSED', 'INACTIVE'];
export class CreatePlanDto {
  @IsUUID() equipmentId: string;
  @IsString() @MinLength(1) @MaxLength(200) name: string;
  @ValidateIf(nullable) @IsString() @MaxLength(10000) description?:
    string | null;
  @IsIn(units) frequencyUnit: FrequencyUnit;
  @IsInt() @Min(1) @Max(10000) frequencyValue: number;
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsISO8601({ strict: true })
  nextDueDate: string;
}
export class PatchPlanDto {
  @ValidateIf(optional) @IsString() @MinLength(1) @MaxLength(200) name?: string;
  @ValidateIf(nullable) @IsString() @MaxLength(10000) description?:
    string | null;
  @ValidateIf(optional) @IsIn(units) frequencyUnit?: FrequencyUnit;
  @ValidateIf(optional) @IsInt() @Min(1) @Max(10000) frequencyValue?: number;
  @ValidateIf(optional)
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsISO8601({ strict: true })
  nextDueDate?: string;
  @ValidateIf(optional) @IsIn(statuses) status?: string;
}
export class ListPlansDto extends PaginationQueryDto {
  @ValidateIf(optional) @IsUUID() equipmentId?: string;
  @ValidateIf(optional) @IsIn(statuses) status?: string;
}
export class ListTasksDto extends PaginationQueryDto {
  @ValidateIf(optional) @IsUUID() equipmentId?: string;
  @ValidateIf(optional) @IsUUID() planId?: string;
  @ValidateIf(optional)
  @IsIn(['PENDING', 'WORK_ORDER_CREATED', 'COMPLETED', 'FAILED', 'CANCELLED'])
  status?: string;
}
export class ReplacementDto {
  @IsUUID() requestId: string;
}

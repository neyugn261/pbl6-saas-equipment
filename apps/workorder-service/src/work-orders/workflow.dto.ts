import { Type } from 'class-transformer';
import {
  IsArray,
  ArrayMaxSize,
  ValidateNested,
  IsInt,
  Min,
} from 'class-validator';
import {
  IsBoolean,
  IsIn,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
export class AssignWorkOrderDto {
  @IsUUID() technicianId: string;
  @ValidateIf((_o, value) => value !== undefined)
  @IsString()
  @MaxLength(2000)
  note?: string;
}
export class ReasonDto {
  @IsString() @MinLength(1) @MaxLength(2000) reason: string;
}
export class CancelWorkOrderDto extends ReasonDto {
  @ValidateIf((_o, value) => value !== undefined)
  @IsBoolean()
  cancelServiceRequest?: boolean;
}
export class WorkLogDto {
  @IsString() @MinLength(1) @MaxLength(2000) note: string;
}
export class ServiceReportDto {
  @IsString() @MinLength(1) @MaxLength(5000) problemDescription: string;
  @ValidateIf((_o, value) => value !== undefined)
  @IsString()
  @MaxLength(5000)
  rootCause?: string;
  @IsString() @MinLength(1) @MaxLength(5000) solution: string;
  @IsIn(['RESOLVED', 'PARTIALLY_RESOLVED', 'UNRESOLVED']) result:
    'RESOLVED' | 'PARTIALLY_RESOLVED' | 'UNRESOLVED';
  @IsString() @MinLength(1) @MaxLength(2000) customerSummary: string;
}
/** Global whitelist rejects fields for actions with no request body. */
export class EmptyActionDto {}

export class ChecklistResultDto {
  @IsUUID() itemId: string;
  @IsIn(['NOT_DONE', 'DONE', 'NOT_APPLICABLE']) status:
    'NOT_DONE' | 'DONE' | 'NOT_APPLICABLE';
  @IsString() @MaxLength(2000) note: string;
}
export class ChecklistInputDto {
  @IsInt() @Min(0) expectedVersion: number;
  @IsArray()
  @ArrayMaxSize(60)
  @ValidateNested({ each: true })
  @Type(() => ChecklistResultDto)
  results: ChecklistResultDto[];
}

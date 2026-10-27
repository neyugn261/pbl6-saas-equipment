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

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
export const SIGN_OFF_STATUSES = [
  'SIGNED',
  'CUSTOMER_ABSENT',
  'CUSTOMER_REFUSED',
  'NOT_APPLICABLE',
] as const;

export class SignOffDto {
  @IsIn(SIGN_OFF_STATUSES)
  status: (typeof SIGN_OFF_STATUSES)[number];

  @ValidateIf((o: SignOffDto) => o.status === 'SIGNED' || o.signerName !== undefined)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  signerName?: string;

  @ValidateIf((_o, value) => value !== undefined && value !== null)
  @IsString()
  @MaxLength(100)
  signerTitle?: string;

  @ValidateIf((_o, value) => value !== undefined && value !== null)
  @IsString()
  @MaxLength(30)
  signerPhone?: string;

  @ValidateIf((_o, value) => value !== undefined && value !== null)
  @IsUUID()
  signatureAttachmentId?: string;

  @ValidateIf(
    (o: SignOffDto) =>
      o.status === 'CUSTOMER_REFUSED' ||
      o.status === 'CUSTOMER_ABSENT' ||
      (o.notes !== undefined && o.notes !== null),
  )
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  notes?: string;
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
  @ValidateIf(
    (o: ServiceReportDto) =>
      o.result === 'UNRESOLVED' || o.unresolvedReason !== undefined,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  unresolvedReason?: string;
  @IsString() @MinLength(1) @MaxLength(2000) customerSummary: string;
  @ValidateIf((_o, value) => value !== undefined)
  @ValidateNested()
  @Type(() => SignOffDto)
  signOff?: SignOffDto;
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

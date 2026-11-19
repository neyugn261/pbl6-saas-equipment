import {
  Equals,
  IsBoolean,
  IsIn,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { PaginationQueryDto } from '@pbl6/service-kit';
const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
export class PublicQrSettingInput {
  @IsBoolean() enabled: boolean;
}
export class PublicInquiryInput {
  @IsString() @MaxLength(600) formToken: string;
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  contactName: string;
  @Transform(trim)
  @IsString()
  @Matches(/^\+?[0-9 ()-]{8,30}$/)
  contactPhone: string;
  @Transform(trim)
  @IsString()
  @MinLength(10)
  @MaxLength(4000)
  description: string;
  @Equals(true) consent: boolean;
}
export class InquiryQuery extends PaginationQueryDto {
  @ValidateIf((_, value) => value !== undefined)
  @IsIn(['NEW', 'ACKNOWLEDGED', 'REJECTED'])
  status?: string;
}
export class InquiryDecision {
  @IsIn(['ACKNOWLEDGED', 'REJECTED']) status: 'ACKNOWLEDGED' | 'REJECTED';
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(2000) note: string;
}

import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { PaginationQueryDto } from '@pbl6/service-kit';
import { QUANTITY, ReturnInput } from '../inventory/dto';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const supplied = (_: unknown, value: unknown) => value !== undefined;

export class PartRequestLineInput {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toLowerCase() : value,
  )
  @IsUUID()
  partId: string;
  @Matches(QUANTITY) quantity: string;
}
export class CreatePartRequestInput {
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(2000) reason: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ArrayUnique((line: PartRequestLineInput) => line?.partId)
  @ValidateNested({ each: true })
  @Type(() => PartRequestLineInput)
  lines: PartRequestLineInput[];
}
export class RequestQuery extends PaginationQueryDto {
  @ValidateIf(supplied) @IsUUID() workOrderId?: string;
  @ValidateIf(supplied)
  @IsIn(['OPEN', 'CLOSED', 'CANCELLED', 'REJECTED'])
  status?: string;
}
export class RequestDecisionInput {
  @IsInt() @Min(1) expectedVersion: number;
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(2000) reason: string;
}
export class FulfillmentInput {
  @IsInt() @Min(1) expectedVersion: number;
  @IsUUID() lineId: string;
  @IsUUID() warehouseId: string;
  @Matches(QUANTITY) quantity: string;
  @IsUUID() custodianUserId: string;
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  handoverReference: string;
  @ValidateIf(supplied)
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  note?: string;
}
export class CreateReturnRequestInput {
  @Matches(QUANTITY) quantity: string;
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(2000) reason: string;
}
export class ReturnReceiptInput extends ReturnInput {
  @IsInt() @Min(1) expectedVersion: number;
}

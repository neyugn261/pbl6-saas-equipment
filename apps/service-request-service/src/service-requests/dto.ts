import { PaginationQueryDto } from '@pbl6/service-kit';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
  IsNumberString,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export const REQUEST_STATUSES = [
  'NEW',
  'REVIEWING',
  'AWAITING_INFO',
  'AWAITING_CUSTOMER_APPROVAL',
  'ACCEPTED',
  'PROCESSING',
  'RESOLVED',
  'CLOSED',
  'REJECTED',
  'CANCELLED',
  'COST_REJECTED',
] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const REQUEST_TYPES = [
  'WARRANTY',
  'REPAIR',
  'MAINTENANCE',
  'INSPECTION',
] as const;
export type RequestType = (typeof REQUEST_TYPES)[number];

export const PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const;
export type RequestPriority = (typeof PRIORITIES)[number];

export const COMMENT_VISIBILITIES = ['INTERNAL', 'CUSTOMER'] as const;
export type CommentVisibility = (typeof COMMENT_VISIBILITIES)[number];

export class CreateServiceRequestDto {
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsUUID()
  equipmentId!: string;

  @IsIn(REQUEST_TYPES)
  type!: RequestType;

  @IsOptional()
  @IsIn(PRIORITIES)
  priority?: RequestPriority;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(10000)
  description!: string;
}

export class ListServiceRequestsDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsUUID()
  equipmentId?: string;

  @IsOptional()
  @IsIn(PRIORITIES)
  priority?: RequestPriority;

  @IsOptional()
  @IsIn(['createdAt', '-createdAt', 'priority', '-priority'])
  sort: 'createdAt' | '-createdAt' | 'priority' | '-priority' = '-createdAt';
}

export class UpdateServiceRequestDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  description?: string;

  @IsOptional()
  @IsIn(PRIORITIES)
  priority?: RequestPriority;
}

export class RequiredReasonDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  reason!: string;
}

export class OptionalReasonDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string;
}

export class AddCommentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  content!: string;

  @IsOptional()
  @IsIn(COMMENT_VISIBILITIES)
  visibility?: CommentVisibility;
}

export class CostEstimateItemDto {
  @IsIn(['LABOR', 'PART', 'TRAVEL', 'OTHER'])
  itemType!: 'LABOR' | 'PART' | 'TRAVEL' | 'OTHER';

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  description!: string;

  @IsNumberString({ no_symbols: false })
  @MinLength(1)
  quantity!: string;

  @IsNumberString({ no_symbols: false })
  @MinLength(1)
  unitPrice!: string;
}

export class CostEstimateInputDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(3)
  currency?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  validUntil?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CostEstimateItemDto)
  items!: CostEstimateItemDto[];
}

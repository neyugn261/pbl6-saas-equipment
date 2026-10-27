import { Transform } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Matches,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { PaginationQueryDto } from '@pbl6/service-kit';
export const WO_STATUSES = [
  'CREATED',
  'ASSIGNED',
  'ACCEPTED',
  'TRAVELLING',
  'IN_PROGRESS',
  'ON_HOLD',
  'COMPLETED',
  'CANCELLED',
];
export const WO_TYPES = ['REPAIR', 'WARRANTY', 'MAINTENANCE', 'INSPECTION'];
export const PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'];
const DATE_TIME_ZONE = /T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
export class CreateWorkOrderDto {
  @IsUUID() serviceRequestId: string;
  @ValidateIf((_o, v) => v !== undefined)
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;
  @ValidateIf((_o, v) => v !== undefined) @IsString() description?: string;
  @ValidateIf((_o, v) => v !== undefined) @IsIn(PRIORITIES) priority?: string;
  @ValidateIf((_o, v) => v !== undefined)
  @IsISO8601({ strict: true })
  @Matches(DATE_TIME_ZONE)
  scheduledStart?: string;
  @ValidateIf((_o, v) => v !== undefined)
  @IsISO8601({ strict: true })
  @Matches(DATE_TIME_ZONE)
  scheduledEnd?: string;
}
export class PatchWorkOrderDto {
  @ValidateIf((_o, v) => v !== undefined)
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;
  @IsOptional() @IsString() description?: string | null;
  @ValidateIf((_o, v) => v !== undefined) @IsIn(PRIORITIES) priority?: string;
  @IsOptional()
  @IsISO8601({ strict: true })
  @Matches(DATE_TIME_ZONE)
  scheduledStart?: string | null;
  @IsOptional()
  @IsISO8601({ strict: true })
  @Matches(DATE_TIME_ZONE)
  scheduledEnd?: string | null;
}
export class ListWorkOrdersDto extends PaginationQueryDto {
  @ValidateIf((_o, v) => v !== undefined)
  @IsString()
  @MaxLength(100)
  q?: string;
  @ValidateIf((_o, v) => v !== undefined)
  @Transform(({ value }) =>
    typeof value === 'string' ? value.split(',') : value,
  )
  @IsArray()
  @ArrayNotEmpty()
  @IsIn(WO_STATUSES, { each: true })
  status?: string[];
  @ValidateIf((_o, v) => v !== undefined) @IsIn(WO_TYPES) type?: string;
  @ValidateIf((_o, v) => v !== undefined) @IsIn(PRIORITIES) priority?: string;
  @ValidateIf((_o, v) => v !== undefined) @IsUUID() technicianId?: string;
  @ValidateIf((_o, v) => v !== undefined) @IsUUID() customerId?: string;
  @ValidateIf((_o, v) => v !== undefined) @IsUUID() equipmentId?: string;
  @ValidateIf((_o, v) => v !== undefined) @IsUUID() serviceRequestId?: string;
  @ValidateIf((_o, v) => v !== undefined)
  @Transform(({ value }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  mine?: boolean;
  @ValidateIf((_o, v) => v !== undefined)
  @IsISO8601({ strict: true })
  @Matches(DATE_TIME_ZONE)
  scheduledFrom?: string;
  @ValidateIf((_o, v) => v !== undefined)
  @IsISO8601({ strict: true })
  @Matches(DATE_TIME_ZONE)
  scheduledTo?: string;
  @ValidateIf((_o, v) => v !== undefined)
  @IsIn([
    'createdAt',
    '-createdAt',
    'scheduledStart',
    '-scheduledStart',
    'priority',
    '-priority',
  ])
  sort: string = '-createdAt';
}

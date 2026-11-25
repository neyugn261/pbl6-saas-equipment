import {
  IsDateString,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { PaginationQueryDto } from '@pbl6/service-kit';
import { Transform } from 'class-transformer';
import { NOTIFICATION_RESOURCE_TYPES } from './notification.types';

export enum NotificationReadStatus {
  ALL = 'ALL',
  READ = 'READ',
  UNREAD = 'UNREAD',
}

export class NotificationQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(NotificationReadStatus)
  readStatus: NotificationReadStatus = NotificationReadStatus.ALL;

  @IsOptional()
  @IsDateString()
  createdFrom?: string;

  @IsOptional()
  @IsDateString()
  createdTo?: string;

  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(50)
  eventType?: string;

  @IsOptional()
  @IsIn(NOTIFICATION_RESOURCE_TYPES)
  resourceType?: (typeof NOTIFICATION_RESOURCE_TYPES)[number];
}

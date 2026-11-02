import { IsDateString, IsEnum, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '@pbl6/service-kit';

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
}

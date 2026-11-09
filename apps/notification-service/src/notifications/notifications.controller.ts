import { BranchScoped } from '@pbl6/auth';
import {
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
} from '@nestjs/common';
import {
  AllowUserTypes,
  CurrentUser,
  RequirePermissions,
  type Principal,
} from '@pbl6/auth';
import { NotificationsService } from './notifications.service';
import { NotificationQueryDto } from './notification-query.dto';

@BranchScoped()
@Controller('notifications')
@AllowUserTypes('TENANT_STAFF', 'CUSTOMER')
@RequirePermissions('notification:read')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  list(
    @CurrentUser() principal: Principal,
    @Query() query: NotificationQueryDto,
  ) {
    return this.notifications.list(principal, query);
  }

  @Get('unread-count')
  @Header('Cache-Control', 'no-store')
  unreadCount(@CurrentUser() principal: Principal) {
    return this.notifications.unreadCount(principal);
  }

  @Patch(':notificationId/read')
  @Header('Cache-Control', 'no-store')
  markRead(
    @CurrentUser() principal: Principal,
    @Param('notificationId', ParseUUIDPipe) notificationId: string,
  ) {
    return this.notifications.markRead(principal, notificationId);
  }
}

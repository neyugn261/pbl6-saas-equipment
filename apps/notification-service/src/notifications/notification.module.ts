import { Module } from '@nestjs/common';
import { NotificationEventsConsumer } from '../events/notification-events.consumer';
import { NotificationEventsService } from '../events/notification-events.service';
import { RecipientProjectionService } from '../events/recipient-projection.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

@Module({
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotificationEventsService,
    NotificationEventsConsumer,
    RecipientProjectionService,
  ],
})
export class NotificationModule {}

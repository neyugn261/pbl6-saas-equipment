import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Events, RabbitMqEventBus } from '@pbl6/event-contracts';
import { runWithCorrelationId } from '@pbl6/service-kit';
import type { AppEnv } from '../config/env.validation';
import { RecipientProjectionService } from './recipient-projection.service';
import {
  NOTIFICATION_BUSINESS_CONSUMER,
  NOTIFICATION_BUSINESS_EVENTS,
  NotificationEventsService,
} from './notification-events.service';

@Injectable()
export class NotificationEventsConsumer
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(NotificationEventsConsumer.name);
  private bus: RabbitMqEventBus | undefined;
  private retryTimer: NodeJS.Timeout | undefined;

  constructor(
    private readonly config: ConfigService<AppEnv, true>,
    private readonly events: NotificationEventsService,
    private readonly recipients: RecipientProjectionService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (this.config.get('NODE_ENV', { infer: true }) === 'test') return;

    const url = this.config.get('RABBITMQ_URL', { infer: true });
    if (url) {
      this.bus = new RabbitMqEventBus({
        url,
        logger: new Logger('NotificationEventBus'),
      });
      this.bus.subscribe({
        queue: 'notification-service.recipient-snapshots',
        events: [Events.NotificationRecipientSnapshot],
        handler: async (envelope) =>
          runWithCorrelationId(envelope.correlationId ?? envelope.eventId, () =>
            this.recipients.applySnapshot(envelope),
          ),
      });
      this.bus.subscribe({
        queue: 'notification-service.recipient-bootstrap',
        events: [Events.NotificationRecipientBootstrapCompleted],
        handler: async (envelope) =>
          runWithCorrelationId(envelope.correlationId ?? envelope.eventId, () =>
            this.recipients.applyBootstrapCompleted(envelope),
          ),
      });
      this.bus.subscribe({
        queue: NOTIFICATION_BUSINESS_CONSUMER,
        events: NOTIFICATION_BUSINESS_EVENTS,
        handler: async (envelope) =>
          runWithCorrelationId(envelope.correlationId ?? envelope.eventId, () =>
            this.events.handle(envelope),
          ),
      });
      await this.bus.start();
    } else {
      this.logger.warn(
        'RABBITMQ_URL is not set: Notification recipient and business events are not consumed',
      );
    }

    this.retryTimer = setInterval(() => {
      void this.events.reconcileDue().catch((error: unknown) => {
        this.logger.error({
          msg: 'Pending Notification reconciliation failed',
          errorType: error instanceof Error ? error.name : 'UnknownError',
        });
      });
    }, 10_000);
    this.retryTimer.unref();
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.retryTimer) clearInterval(this.retryTimer);
    await this.bus?.close();
  }
}

import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RabbitMqEventBus } from '@pbl6/event-contracts';
import { runWithCorrelationId } from '@pbl6/service-kit';
import { IdentityEnv } from '../config/env.validation';
import {
  DIRECTORY_CONSUMER,
  DIRECTORY_EVENTS,
  DirectoryEventHandler,
} from './directory-event.handler';

/**
 * Subscribes the directory handler to RabbitMQ when `RABBITMQ_URL` is set.
 * The service starts (and login works) even while the broker is down; the
 * consumer connects and catches up once it is reachable.
 */
@Injectable()
export class DirectoryConsumer
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(DirectoryConsumer.name);
  private bus: RabbitMqEventBus | undefined;

  constructor(
    private readonly config: ConfigService<IdentityEnv, true>,
    private readonly handler: DirectoryEventHandler,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const url = this.config.get('RABBITMQ_URL', { infer: true });
    if (!url) {
      this.logger.warn(
        'RABBITMQ_URL is not set: tenant and customer membership events are not consumed',
      );
      return;
    }
    this.bus = new RabbitMqEventBus({ url, logger: new Logger('EventBus') });
    this.bus.subscribe({
      queue: DIRECTORY_CONSUMER,
      events: DIRECTORY_EVENTS,
      handler: async (envelope) => {
        const result = await runWithCorrelationId(
          envelope.correlationId ?? envelope.eventId,
          () => this.handler.handle(envelope),
        );
        if (result === 'duplicate') {
          this.logger.log({
            msg: 'Duplicate event skipped',
            eventId: envelope.eventId,
            eventType: envelope.eventType,
          });
        }
      },
    });
    await this.bus.start();
  }

  async onApplicationShutdown(): Promise<void> {
    await this.bus?.close();
  }
}

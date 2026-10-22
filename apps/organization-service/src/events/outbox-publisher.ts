import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OutboxRelay, RabbitMqEventBus } from '@pbl6/event-contracts';
import { AppEnv } from '../config/env.validation';
import { PrismaService } from '../prisma/prisma.service';

export const PRODUCER = 'organization-service';

/**
 * Publishes `outbox_events` to RabbitMQ when `RABBITMQ_URL` is set (ADR 0005).
 * The API keeps working while the broker is down: events stay PENDING and are
 * sent once it is reachable.
 */
@Injectable()
export class OutboxPublisher
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(OutboxPublisher.name);
  private bus: RabbitMqEventBus | undefined;
  private relay: OutboxRelay | undefined;

  constructor(
    private readonly config: ConfigService<AppEnv, true>,
    private readonly prisma: PrismaService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const url = this.config.get('RABBITMQ_URL', { infer: true });
    if (!url) {
      this.logger.warn('RABBITMQ_URL is not set: outbox events are not published');
      return;
    }
    this.bus = new RabbitMqEventBus({ url, logger: new Logger('EventBus') });
    await this.bus.start();
    this.relay = new OutboxRelay({
      db: this.prisma,
      publisher: this.bus,
      producer: PRODUCER,
      logger: new Logger('OutboxRelay'),
    });
    this.relay.start();
  }

  async onApplicationShutdown(): Promise<void> {
    await this.relay?.stop();
    await this.bus?.close();
  }
}

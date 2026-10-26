import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Events, OutboxRelay, RabbitMqEventBus } from '@pbl6/event-contracts';
import type { AppEnv } from '../config/env.validation';
import { PrismaService } from '../prisma/prisma.service';
import { MaintenanceEventsConsumer } from './maintenance-events.consumer';
import { ServiceRequestEventsConsumer } from './service-request-events.consumer';

@Injectable()
export class OutboxRelayService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxRelayService.name);
  private bus?: RabbitMqEventBus;
  private relay?: OutboxRelay;
  constructor(
    private readonly config: ConfigService<AppEnv, true>,
    private readonly db: PrismaService,
    private readonly requests: ServiceRequestEventsConsumer,
    private readonly maintenance: MaintenanceEventsConsumer,
  ) {}
  async onModuleInit() {
    const url = this.config.get('RABBITMQ_URL', { infer: true });
    if (!url) {
      this.logger.warn(
        'RABBITMQ_URL is unset; Work Order events remain in the outbox',
      );
      return;
    }
    this.bus = new RabbitMqEventBus({ url, logger: this.logger });
    this.bus.subscribe({
      queue: REQUEST_CONSUMER_QUEUE,
      events: [Events.ServiceRequestStatusChanged],
      handler: (envelope) => this.requests.handle(envelope),
    });
    this.bus.subscribe({
      queue: MAINTENANCE_CONSUMER_QUEUE,
      events: [Events.MaintenanceTaskDue],
      handler: async (envelope) => {
        await this.maintenance.handle(envelope);
      },
    });
    await this.bus.start();
    this.relay = new OutboxRelay({
      db: this.db,
      publisher: this.bus,
      producer: 'workorder-service',
      logger: this.logger,
    });
    this.relay.start();
  }
  async onModuleDestroy() {
    await this.relay?.stop();
    await this.bus?.close();
  }
}
export const REQUEST_CONSUMER_QUEUE = 'workorder-service.service-requests';

export const MAINTENANCE_CONSUMER_QUEUE = 'workorder-service.maintenance-tasks';

import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Events, OutboxRelay, RabbitMqEventBus } from '@pbl6/event-contracts';
import { PrismaService } from '../prisma/prisma.service';
import { HistoryConsumer } from './history.consumer';
@Injectable()
export class EventsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EventsService.name);
  private bus?: RabbitMqEventBus;
  private relay?: OutboxRelay;
  constructor(
    private readonly db: PrismaService,
    private readonly config: ConfigService,
    private readonly history: HistoryConsumer,
  ) {}
  async onModuleInit() {
    const url = this.config.get<string>('RABBITMQ_URL');
    if (!url) {
      this.logger.warn(
        'RABBITMQ_URL unset; move events remain in Asset outbox',
      );
      return;
    }
    this.bus = new RabbitMqEventBus({ url, logger: this.logger });
    this.bus.subscribe({
      queue: 'asset-service.history',
      events: [Events.ServiceRequestStatusChanged, Events.WorkOrderCompletedV2],
      handler: (e) => this.history.handle(e),
    });
    await this.bus.start();
    this.relay = new OutboxRelay({
      db: this.db,
      publisher: this.bus,
      producer: 'asset-service',
      logger: this.logger,
    });
    this.relay.start();
  }
  async onModuleDestroy() {
    await this.relay?.stop();
    await this.bus?.close();
  }
}

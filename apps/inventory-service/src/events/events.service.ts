import {
  Injectable,
  Logger,
  type OnModuleInit,
  type OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Events, OutboxRelay, RabbitMqEventBus } from '@pbl6/event-contracts';
import { EstimatePartsService } from '../part-requests/estimate-parts.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class EventsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EventsService.name);
  private bus?: RabbitMqEventBus;
  private relay?: OutboxRelay;
  constructor(
    private readonly db: PrismaService,
    private readonly config: ConfigService,
    private readonly estimateParts: EstimatePartsService,
  ) {}
  async onModuleInit() {
    const url = this.config.get<string>('RABBITMQ_URL');
    if (!url) {
      this.logger.warn(
        'RABBITMQ_URL unset; low-stock events remain in Inventory outbox',
      );
      return;
    }
    this.bus = new RabbitMqEventBus({ url, logger: this.logger });
    this.bus.subscribe({ queue: 'inventory-service.estimate-parts', events: [Events.CostEstimatePartsSnapshot],
      handler: event => this.estimateParts.handle(event) });
    await this.bus.start();
    this.relay = new OutboxRelay({
      db: this.db,
      publisher: this.bus,
      producer: 'inventory-service',
      logger: this.logger,
    });
    this.relay.start();
  }
  async onModuleDestroy() {
    await this.relay?.stop();
    await this.bus?.close();
  }
}

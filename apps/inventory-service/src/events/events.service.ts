import {
  Injectable,
  Logger,
  type OnModuleInit,
  type OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OutboxRelay, RabbitMqEventBus } from '@pbl6/event-contracts';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class EventsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EventsService.name);
  private bus?: RabbitMqEventBus;
  private relay?: OutboxRelay;
  constructor(
    private readonly db: PrismaService,
    private readonly config: ConfigService,
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

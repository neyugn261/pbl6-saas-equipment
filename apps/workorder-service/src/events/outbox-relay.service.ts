import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OutboxRelay, RabbitMqEventBus } from '@pbl6/event-contracts';
import type { AppEnv } from '../config/env.validation';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class OutboxRelayService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxRelayService.name);
  private bus?: RabbitMqEventBus;
  private relay?: OutboxRelay;
  constructor(
    private readonly config: ConfigService<AppEnv, true>,
    private readonly db: PrismaService,
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

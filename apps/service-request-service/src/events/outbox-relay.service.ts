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
import { WorkOrderEventsConsumer } from './work-order-events.consumer';

@Injectable()
export class OutboxRelayService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxRelayService.name);
  private bus?: RabbitMqEventBus;
  private relay?: OutboxRelay;

  constructor(
    private readonly config: ConfigService<AppEnv, true>,
    private readonly prisma: PrismaService,
    private readonly workOrderEvents: WorkOrderEventsConsumer,
  ) {}

  async onModuleInit(): Promise<void> {
    const url = this.config.get('RABBITMQ_URL', { infer: true });
    if (!url) {
      this.logger.warn(
        'RABBITMQ_URL is unset; Service Request events will remain in the outbox',
      );
      return;
    }

    this.bus = new RabbitMqEventBus({ url, logger: this.logger });
    this.bus.subscribe({
      queue: 'service-request-service.work-orders',
      events: [
        Events.WorkOrderCreated,
        Events.WorkOrderCompleted,
        Events.WorkOrderCompletedV2,
        Events.WorkOrderCancelled,
        Events.WorkOrderCancelledV2,
      ],
      handler: (envelope) => this.workOrderEvents.handle(envelope),
    });
    await this.bus.start();
    this.relay = new OutboxRelay({
      db: this.prisma,
      publisher: this.bus,
      producer: 'service-request-service',
      logger: this.logger,
    });
    this.relay.start();
  }

  async onModuleDestroy(): Promise<void> {
    await this.relay?.stop();
    await this.bus?.close();
  }
}

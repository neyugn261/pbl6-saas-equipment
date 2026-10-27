import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Events, OutboxRelay, RabbitMqEventBus } from '@pbl6/event-contracts';
import { PrismaService } from '../prisma/prisma.service';
import { EquipmentEventsConsumer } from './equipment-events.consumer';
import { WorkOrderEventsConsumer } from './work-order-events.consumer';
@Injectable()
export class EventsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EventsService.name);
  private bus?: RabbitMqEventBus;
  private relay?: OutboxRelay;
  constructor(
    private readonly db: PrismaService,
    private readonly config: ConfigService,
    private readonly equipment: EquipmentEventsConsumer,
    private readonly workOrders: WorkOrderEventsConsumer,
  ) {}
  async onModuleInit() {
    const url = this.config.get<string>('RABBITMQ_URL');
    if (!url) {
      this.logger.warn(
        'RABBITMQ_URL unset; events remain in Maintenance outbox',
      );
      return;
    }
    this.bus = new RabbitMqEventBus({ url, logger: this.logger });
    this.bus.subscribe({
      queue: 'maintenance-service.equipment',
      events: [Events.EquipmentMoved],
      handler: (e) => this.equipment.handle(e),
    });
    this.bus.subscribe({
      queue: 'maintenance-service.workorder',
      events: [
        Events.WorkOrderCreated,
        Events.WorkOrderCompletedV2,
        Events.WorkOrderCancelledV2,
      ],
      handler: (e) => this.workOrders.handle(e),
    });
    await this.bus.start();
    this.relay = new OutboxRelay({
      db: this.db,
      publisher: this.bus,
      producer: 'maintenance-service',
      logger: this.logger,
    });
    this.relay.start();
  }
  async onModuleDestroy() {
    await this.relay?.stop();
    await this.bus?.close();
  }
}

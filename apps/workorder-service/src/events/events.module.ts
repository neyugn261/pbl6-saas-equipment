import { Module } from '@nestjs/common';
import { MaintenanceEventsConsumer } from './maintenance-events.consumer';
import { OutboxRelayService } from './outbox-relay.service';
import { WorkOrdersModule } from '../work-orders/work-orders.module';
import { ServiceRequestEventsConsumer } from './service-request-events.consumer';
@Module({
  imports: [WorkOrdersModule],
  providers: [
    OutboxRelayService,
    ServiceRequestEventsConsumer,
    MaintenanceEventsConsumer,
  ],
})
export class EventsModule {}

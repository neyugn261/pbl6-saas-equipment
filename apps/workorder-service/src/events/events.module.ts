import { Module } from '@nestjs/common';
import { MaintenanceEventsConsumer } from './maintenance-events.consumer';
import { OutboxRelayService } from './outbox-relay.service';
import { WorkOrdersModule } from '../work-orders/work-orders.module';
import { ServiceRequestEventsConsumer } from './service-request-events.consumer';
import { SiteRoutingConsumer } from './site-routing.consumer';
@Module({
  imports: [WorkOrdersModule],
  providers: [
    OutboxRelayService,
    ServiceRequestEventsConsumer,
    MaintenanceEventsConsumer,
    SiteRoutingConsumer,
  ],
})
export class EventsModule {}

import { Module } from '@nestjs/common';
import { OutboxRelayService } from './outbox-relay.service';
import { WorkOrdersModule } from '../work-orders/work-orders.module';
import { ServiceRequestEventsConsumer } from './service-request-events.consumer';
@Module({
  imports: [WorkOrdersModule],
  providers: [OutboxRelayService, ServiceRequestEventsConsumer],
})
export class EventsModule {}

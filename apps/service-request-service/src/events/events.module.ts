import { Module } from '@nestjs/common';
import { OutboxRelayService } from './outbox-relay.service';
import { WorkOrderEventsConsumer } from './work-order-events.consumer';

@Module({
  providers: [OutboxRelayService, WorkOrderEventsConsumer],
})
export class EventsModule {}

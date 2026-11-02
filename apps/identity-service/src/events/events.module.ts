import { Module } from '@nestjs/common';
import { DirectoryConsumer } from './directory-consumer';
import { DirectoryEventHandler } from './directory-event.handler';
import { OutboxPublisher } from './outbox-publisher';

@Module({
  providers: [DirectoryEventHandler, DirectoryConsumer, OutboxPublisher],
  exports: [DirectoryEventHandler],
})
export class EventsModule {}

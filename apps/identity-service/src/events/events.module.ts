import { Module } from '@nestjs/common';
import { DirectoryConsumer } from './directory-consumer';
import { DirectoryEventHandler } from './directory-event.handler';

@Module({
  providers: [DirectoryEventHandler, DirectoryConsumer],
  exports: [DirectoryEventHandler],
})
export class EventsModule {}

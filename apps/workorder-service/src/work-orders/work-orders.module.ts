import { Module } from '@nestjs/common';
import { ReferencesModule } from '../references/references.module';
import { WorkOrdersRepository } from './work-orders.repository';
import { WorkOrdersService } from './work-orders.service';
import {
  InternalWorkOrdersController,
  WorkOrdersController,
} from './work-orders.controller';
@Module({
  imports: [ReferencesModule],
  providers: [WorkOrdersRepository, WorkOrdersService],
  controllers: [WorkOrdersController, InternalWorkOrdersController],
})
export class WorkOrdersModule {}

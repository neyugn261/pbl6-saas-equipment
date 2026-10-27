import { Module } from '@nestjs/common';
import { ReferencesModule } from '../references/references.module';
import { WorkOrdersRepository } from './work-orders.repository';
import { WorkOrdersService } from './work-orders.service';
import { WorkOrderWorkflowRepository } from './workflow.repository';
import { WorkOrderWorkflowService } from './workflow.service';
import { WorkOrderWorkflowController } from './workflow.controller';
import {
  InternalWorkOrdersController,
  WorkOrdersController,
} from './work-orders.controller';
@Module({
  imports: [ReferencesModule],
  providers: [
    WorkOrdersRepository,
    WorkOrdersService,
    WorkOrderWorkflowRepository,
    WorkOrderWorkflowService,
  ],
  controllers: [
    WorkOrdersController,
    InternalWorkOrdersController,
    WorkOrderWorkflowController,
  ],
  exports: [WorkOrderWorkflowRepository],
})
export class WorkOrdersModule {}

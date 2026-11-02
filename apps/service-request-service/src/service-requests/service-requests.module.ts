import { Module } from '@nestjs/common';
import { AssetModule } from '../asset/asset.module';
import {
  HttpWorkOrderAttachmentsClient,
  WORKORDER_ATTACHMENTS_CLIENT,
} from '../attachments/workorder-attachments.client';
import { ServiceRequestAttachmentsController } from '../attachments/service-request-attachments.controller';
import { ServiceRequestAttachmentsService } from '../attachments/service-request-attachments.service';
import {
  CostEstimatesController,
  InternalServiceRequestsController,
  ServiceRequestsController,
} from './service-requests.controller';
import { ServiceRequestsService } from './service-requests.service';

@Module({
  imports: [AssetModule],
  controllers: [
    ServiceRequestsController,
    CostEstimatesController,
    InternalServiceRequestsController,
    ServiceRequestAttachmentsController,
  ],
  providers: [
    ServiceRequestsService,
    ServiceRequestAttachmentsService,
    {
      provide: WORKORDER_ATTACHMENTS_CLIENT,
      useClass: HttpWorkOrderAttachmentsClient,
    },
  ],
})
export class ServiceRequestsModule {}

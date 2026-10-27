import { Module } from '@nestjs/common';
import { AssetModule } from '../asset/asset.module';
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
  ],
  providers: [ServiceRequestsService],
})
export class ServiceRequestsModule {}

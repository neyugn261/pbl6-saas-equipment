import { Module } from '@nestjs/common';
import { AssetModule } from '../asset/asset.module';
import {
  InternalServiceRequestsController,
  ServiceRequestsController,
} from './service-requests.controller';
import { ServiceRequestsService } from './service-requests.service';

@Module({
  imports: [AssetModule],
  controllers: [ServiceRequestsController, InternalServiceRequestsController],
  providers: [ServiceRequestsService],
})
export class ServiceRequestsModule {}

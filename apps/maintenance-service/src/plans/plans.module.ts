import { RegistrationPlanController } from '../registrations/registration-plan.controller';
import { RegistrationPlanService } from '../registrations/registration-plan.service';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ServiceHttpClient } from '@pbl6/service-kit';
import { ASSET_CLIENT, AssetHttpClient } from '../asset/asset.client';
import { PlansController, TasksController } from './plans.controller';
import { PlansRepository } from './plans.repository';
import { PlansService } from './plans.service';
import { JourneyService } from './journey.service';
import { JourneyController } from './journey.controller';
@Module({
  controllers: [
    PlansController,
    TasksController,
    JourneyController,
    RegistrationPlanController,
  ],
  providers: [
    PlansRepository,
    RegistrationPlanService,
    PlansService,
    JourneyService,
    {
      provide: ASSET_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new AssetHttpClient(
          new ServiceHttpClient({
            name: 'asset-service',
            baseUrl: config.getOrThrow<string>('ASSET_SERVICE_URL'),
          }),
        ),
    },
  ],
})
export class PlansModule {}

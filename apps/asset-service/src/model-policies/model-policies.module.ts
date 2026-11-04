import { Module } from '@nestjs/common';
import { ModelPoliciesController } from './model-policies.controller';
import { ModelPoliciesService } from './model-policies.service';
@Module({
  controllers: [ModelPoliciesController],
  providers: [ModelPoliciesService],
  exports: [ModelPoliciesService],
})
export class ModelPoliciesModule {}

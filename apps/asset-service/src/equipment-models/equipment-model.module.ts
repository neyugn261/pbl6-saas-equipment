import { Module } from '@nestjs/common';
import { EquipmentModelController } from './equipment-model.controller';
import { EquipmentModelRepository } from './equipment-model.repository';
import { EquipmentModelService } from './equipment-model.service';

@Module({
  controllers: [EquipmentModelController],
  providers: [EquipmentModelRepository, EquipmentModelService],
  exports: [EquipmentModelRepository],
})
export class EquipmentModelModule {}

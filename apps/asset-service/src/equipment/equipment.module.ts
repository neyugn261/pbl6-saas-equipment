import { Module } from '@nestjs/common';
import { EquipmentModelModule } from '../equipment-models/equipment-model.module';
import { OrganizationModule } from '../organization/organization.module';
import { EquipmentController, InternalEquipmentController } from './equipment.controller';
import { EquipmentRepository } from './equipment.repository';
import { EquipmentService } from './equipment.service';

@Module({
  imports: [EquipmentModelModule, OrganizationModule],
  controllers: [EquipmentController, InternalEquipmentController],
  providers: [EquipmentRepository, EquipmentService],
})
export class EquipmentModule {}

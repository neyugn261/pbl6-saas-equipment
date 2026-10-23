import { Module } from '@nestjs/common';
import { EquipmentModelModule } from '../equipment-models/equipment-model.module';
import { OrganizationModule } from '../organization/organization.module';
import { EquipmentController, InternalEquipmentController } from './equipment.controller';
import { EquipmentRepository } from './equipment.repository';
import { EquipmentService } from './equipment.service';
import { EquipmentWarrantyController, WarrantyController } from '../warranties/warranty.controller';
import { WarrantyRepository } from '../warranties/warranty.repository';
import { WarrantyService } from '../warranties/warranty.service';
import { EquipmentQrController, QrController } from '../qr/qr.controller';
import { QrRepository } from '../qr/qr.repository';
import { QrService } from '../qr/qr.service';

@Module({
  imports: [EquipmentModelModule, OrganizationModule],
  controllers: [EquipmentController, InternalEquipmentController, EquipmentWarrantyController, WarrantyController,
    EquipmentQrController, QrController],
  providers: [EquipmentRepository, EquipmentService, WarrantyRepository, WarrantyService, QrRepository, QrService],
})
export class EquipmentModule {}

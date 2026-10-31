import { RegistrationService } from '../registrations/registration.service';
import {
  RegistrationController,
  RegistrationProjectionController,
} from '../registrations/registration.controller';
import { Module } from '@nestjs/common';
import { EquipmentModelModule } from '../equipment-models/equipment-model.module';
import { OrganizationModule } from '../organization/organization.module';
import {
  EquipmentController,
  InternalEquipmentController,
} from './equipment.controller';
import { EquipmentRepository } from './equipment.repository';
import { EquipmentService } from './equipment.service';
import {
  EquipmentWarrantyController,
  WarrantyController,
} from '../warranties/warranty.controller';
import { WarrantyRepository } from '../warranties/warranty.repository';
import { WarrantyService } from '../warranties/warranty.service';
import { EquipmentQrController, QrController } from '../qr/qr.controller';
import { QrRepository } from '../qr/qr.repository';
import { QrService } from '../qr/qr.service';
import { HistoryController } from '../history/history.controller';
import { HistoryService } from '../history/history.service';
import { DossierController } from '../dossier/dossier.controller';
import { DossierService } from '../dossier/dossier.service';

@Module({
  imports: [EquipmentModelModule, OrganizationModule],
  controllers: [
    EquipmentController,
    RegistrationController,
    RegistrationProjectionController,
    InternalEquipmentController,
    EquipmentWarrantyController,
    WarrantyController,
    EquipmentQrController,
    QrController,
    HistoryController,
    DossierController,
  ],
  providers: [
    EquipmentRepository,
    RegistrationService,
    EquipmentService,
    WarrantyRepository,
    WarrantyService,
    QrRepository,
    QrService,
    HistoryService,
    DossierService,
  ],
  exports: [EquipmentService, HistoryService],
})
export class EquipmentModule {}

import { AppliedPoliciesController } from '../model-policies/applied-policies.controller';
import { ModelSetupService } from '../model-policies/model-setup.service';
import { RegistrationService } from '../registrations/registration.service';
import { HandoverController, CustomerHandoverController } from '../handovers/handover.controller';
import { HandoverService } from '../handovers/handover.service';
import { HandoverRepository } from '../handovers/handover.repository';
import { HandoverAuthorization } from '../handovers/handover-authorization';
import { HandoverWorker } from '../handovers/handover.worker';
import {
  RegistrationController,
  RegistrationProjectionController,
} from '../registrations/registration.controller';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DisplayNameLookup } from '@pbl6/service-kit';
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
    HandoverController, CustomerHandoverController,
    EquipmentController,
    AppliedPoliciesController,
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
    { provide: DisplayNameLookup, inject: [ConfigService], useFactory: (config: ConfigService) =>
      new DisplayNameLookup({ identity: config.get<string>('IDENTITY_SERVICE_URL'), organization: config.get<string>('ORGANIZATION_SERVICE_URL') }) },
    HandoverService, HandoverRepository, HandoverAuthorization, HandoverWorker,
    EquipmentRepository,
    RegistrationService,
    ModelSetupService,
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

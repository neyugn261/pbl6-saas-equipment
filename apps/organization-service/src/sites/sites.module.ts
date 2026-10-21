import { Module } from '@nestjs/common';
import { BranchesModule } from '../branches/branches.module';
import { CustomersModule } from '../customers/customers.module';
import { LocationsService } from './locations.service';
import { SitesController } from './sites.controller';
import { SitesRepository } from './sites.repository';
import { SitesService } from './sites.service';

@Module({
  imports: [BranchesModule, CustomersModule],
  controllers: [SitesController],
  providers: [SitesService, LocationsService, SitesRepository],
  exports: [SitesService, SitesRepository],
})
export class SitesModule {}

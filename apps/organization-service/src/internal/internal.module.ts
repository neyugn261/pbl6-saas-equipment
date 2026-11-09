import { Module } from '@nestjs/common';
import { BranchesModule } from '../branches/branches.module';
import { CustomersModule } from '../customers/customers.module';
import { SitesModule } from '../sites/sites.module';
import { InternalController } from './internal.controller';
import { OrganizationDisplayNamesController } from './display-names.controller';
import { StaffContextController } from './staff-context.controller';

@Module({
  imports: [BranchesModule, CustomersModule, SitesModule],
  controllers: [InternalController, OrganizationDisplayNamesController,
    StaffContextController,
  ],
})
export class InternalModule {}

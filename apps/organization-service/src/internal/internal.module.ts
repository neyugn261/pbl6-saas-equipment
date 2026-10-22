import { Module } from '@nestjs/common';
import { BranchesModule } from '../branches/branches.module';
import { CustomersModule } from '../customers/customers.module';
import { SitesModule } from '../sites/sites.module';
import { InternalController } from './internal.controller';

@Module({
  imports: [BranchesModule, CustomersModule, SitesModule],
  controllers: [InternalController],
})
export class InternalModule {}

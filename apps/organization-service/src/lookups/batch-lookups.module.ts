import { Module } from '@nestjs/common';
import { CustomersModule } from '../customers/customers.module';
import { SitesModule } from '../sites/sites.module';
import { BatchLookupsController } from './batch-lookups.controller';
import { BatchLookupService } from './batch-lookup.service';

@Module({
  imports: [CustomersModule, SitesModule],
  controllers: [BatchLookupsController],
  providers: [BatchLookupService],
})
export class BatchLookupsModule {}

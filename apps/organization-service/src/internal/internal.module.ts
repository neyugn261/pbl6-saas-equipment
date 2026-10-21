import { Module } from '@nestjs/common';
import { CustomersModule } from '../customers/customers.module';
import { SitesModule } from '../sites/sites.module';
import { InternalController } from './internal.controller';

@Module({
  imports: [CustomersModule, SitesModule],
  controllers: [InternalController],
})
export class InternalModule {}

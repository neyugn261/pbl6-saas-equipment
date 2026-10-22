import { Module } from '@nestjs/common';
import { CustomersModule } from '../customers/customers.module';
import { MembershipsController } from './memberships.controller';
import { MembershipsRepository } from './memberships.repository';
import { MembershipsService } from './memberships.service';

@Module({
  imports: [CustomersModule],
  controllers: [MembershipsController],
  providers: [MembershipsService, MembershipsRepository],
})
export class MembershipsModule {}

import { Module } from '@nestjs/common';
import { ContactsController } from './contacts.controller';
import { ContactsService } from './contacts.service';
import { CustomersController } from './customers.controller';
import { CustomersRepository } from './customers.repository';
import { CustomersService } from './customers.service';

@Module({
  controllers: [CustomersController, ContactsController],
  providers: [CustomersService, ContactsService, CustomersRepository],
  exports: [CustomersService],
})
export class CustomersModule {}

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  AllowUserTypes,
  CurrentUser,
  dataScope,
  type Principal,
  RequirePermissions,
  requireTenantId,
} from '@pbl6/auth';
import type { Page } from '@pbl6/service-kit';
import { ListQueryDto } from '../common/validation';
import { ContactsService } from './contacts.service';
import type { ContactResponse, CustomerResponse } from './customer.response';
import { CustomersService } from './customers.service';
import { CreateContactDto } from './dto/contact.dto';
import { CreateCustomerDto, UpdateCustomerDto } from './dto/customer.dto';

/** Reads are open to CUSTOMER accounts for their own customer (ADR 0003); writes are staff only. */
@Controller('customers')
export class CustomersController {
  constructor(
    private readonly customers: CustomersService,
    private readonly contacts: ContactsService,
  ) {}

  @Get()
  @RequirePermissions('customer:read')
  list(
    @Query() query: ListQueryDto,
    @CurrentUser() user: Principal,
  ): Promise<Page<CustomerResponse>> {
    return this.customers.list(dataScope(user), query);
  }

  @Post()
  @AllowUserTypes('TENANT_STAFF')
  @RequirePermissions('customer:manage')
  create(
    @Body() body: CreateCustomerDto,
    @CurrentUser() user: Principal,
  ): Promise<CustomerResponse> {
    return this.customers.create(requireTenantId(user), body);
  }

  @Get(':customerId')
  @RequirePermissions('customer:read')
  get(
    @Param('customerId', ParseUUIDPipe) id: string,
    @CurrentUser() user: Principal,
  ): Promise<CustomerResponse> {
    return this.customers.get(dataScope(user), id);
  }

  @Patch(':customerId')
  @AllowUserTypes('TENANT_STAFF')
  @RequirePermissions('customer:manage')
  update(
    @Param('customerId', ParseUUIDPipe) id: string,
    @Body() body: UpdateCustomerDto,
    @CurrentUser() user: Principal,
  ): Promise<CustomerResponse> {
    return this.customers.update(dataScope(user), id, body);
  }

  @Delete(':customerId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @AllowUserTypes('TENANT_STAFF')
  @RequirePermissions('customer:manage')
  remove(
    @Param('customerId', ParseUUIDPipe) id: string,
    @CurrentUser() user: Principal,
  ): Promise<void> {
    return this.customers.remove(dataScope(user), id);
  }

  @Get(':customerId/contacts')
  @RequirePermissions('customer:read')
  listContacts(
    @Param('customerId', ParseUUIDPipe) id: string,
    @CurrentUser() user: Principal,
  ): Promise<ContactResponse[]> {
    return this.contacts.list(dataScope(user), id);
  }

  @Post(':customerId/contacts')
  @AllowUserTypes('TENANT_STAFF')
  @RequirePermissions('customer:manage')
  createContact(
    @Param('customerId', ParseUUIDPipe) id: string,
    @Body() body: CreateContactDto,
    @CurrentUser() user: Principal,
  ): Promise<ContactResponse> {
    return this.contacts.create(dataScope(user), id, body);
  }
}

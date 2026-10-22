import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
} from '@nestjs/common';
import {
  AllowUserTypes,
  CurrentUser,
  dataScope,
  type Principal,
  RequirePermissions,
} from '@pbl6/auth';
import { ContactsService } from './contacts.service';
import type { ContactResponse } from './customer.response';
import { UpdateContactDto } from './dto/contact.dto';

@Controller('contacts')
@AllowUserTypes('TENANT_STAFF')
export class ContactsController {
  constructor(private readonly contacts: ContactsService) {}

  @Patch(':contactId')
  @RequirePermissions('customer:manage')
  update(
    @Param('contactId', ParseUUIDPipe) id: string,
    @Body() body: UpdateContactDto,
    @CurrentUser() user: Principal,
  ): Promise<ContactResponse> {
    return this.contacts.update(dataScope(user), id, body);
  }

  @Delete(':contactId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('customer:manage')
  remove(
    @Param('contactId', ParseUUIDPipe) id: string,
    @CurrentUser() user: Principal,
  ): Promise<void> {
    return this.contacts.remove(dataScope(user), id);
  }
}

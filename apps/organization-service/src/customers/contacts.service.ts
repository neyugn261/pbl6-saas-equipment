import { Injectable } from '@nestjs/common';
import type { DataScope } from '@pbl6/auth';
import { notFound, unprocessable } from '../common/errors';
import { assertCustomerVisible } from '../common/scope';
import type { CustomerContact } from '../generated/prisma/client.js';
import { type ContactResponse, toContactResponse } from './customer.response';
import { CustomersRepository } from './customers.repository';
import { CustomersService } from './customers.service';
import type { CreateContactDto, UpdateContactDto } from './dto/contact.dto';

@Injectable()
export class ContactsService {
  constructor(
    private readonly customers: CustomersService,
    private readonly repository: CustomersRepository,
  ) {}

  async list(scope: DataScope, customerId: string): Promise<ContactResponse[]> {
    await this.customers.load(scope, customerId);
    const contacts = await this.repository.listContacts(scope.tenantId, customerId);
    return contacts.map(toContactResponse);
  }

  async create(
    scope: DataScope,
    customerId: string,
    input: CreateContactDto,
  ): Promise<ContactResponse> {
    await this.customers.load(scope, customerId);
    await this.assertSite(scope.tenantId, customerId, input.customerSiteId);
    const contact = await this.repository.createContact({
      ...input,
      tenantId: scope.tenantId,
      customerId,
    });
    return toContactResponse(contact);
  }

  async update(
    scope: DataScope,
    id: string,
    input: UpdateContactDto,
  ): Promise<ContactResponse> {
    const contact = await this.load(scope, id);
    await this.assertSite(scope.tenantId, contact.customerId, input.customerSiteId);
    return toContactResponse(await this.repository.updateContact(contact, input));
  }

  async remove(scope: DataScope, id: string): Promise<void> {
    const contact = await this.load(scope, id);
    await this.repository.updateContact(contact, { deletedAt: new Date() });
  }

  private async load(scope: DataScope, id: string): Promise<CustomerContact> {
    const contact = await this.repository.findContact(scope.tenantId, id);
    if (!contact) throw notFound('CONTACT_NOT_FOUND', 'Contact not found');
    assertCustomerVisible(scope, contact.customerId, 'CONTACT_NOT_FOUND');
    return contact;
  }

  /** A contact may be tied to one live site of the same customer. */
  private async assertSite(
    tenantId: string,
    customerId: string,
    siteId: string | null | undefined,
  ): Promise<void> {
    if (!siteId) return;
    if (!(await this.repository.isSiteOfCustomer(tenantId, customerId, siteId))) {
      throw unprocessable('SITE_NOT_OF_CUSTOMER', 'The site does not belong to this customer');
    }
  }
}

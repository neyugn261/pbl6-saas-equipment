import { Injectable } from '@nestjs/common';
import { toSkipTake } from '@pbl6/service-kit';
import { codeOrNameMatches, type ListQueryDto } from '../common/validation';
import {
  Customer,
  CustomerContact,
  Prisma,
} from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service';

/** Data access for customers and their contacts. Soft-deleted rows are never returned. */
@Injectable()
export class CustomersRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** `onlyId` limits the list to one customer (CUSTOMER accounts). */
  async list(
    tenantId: string,
    onlyId: string | null,
    query: ListQueryDto,
  ): Promise<[Customer[], number]> {
    const where: Prisma.CustomerWhereInput = {
      tenantId,
      deletedAt: null,
      status: query.status,
      ...(onlyId === null ? {} : { id: onlyId }),
      ...codeOrNameMatches(query.q),
    };
    return this.prisma.$transaction([
      this.prisma.customer.findMany({
        where,
        orderBy: { code: 'asc' },
        ...toSkipTake(query),
      }),
      this.prisma.customer.count({ where }),
    ]);
  }

  find(tenantId: string, id: string): Promise<Customer | null> {
    return this.prisma.customer.findFirst({ where: { id, tenantId, deletedAt: null } });
  }

  create(data: Prisma.CustomerUncheckedCreateInput): Promise<Customer> {
    return this.prisma.customer.create({ data });
  }

  update(id: string, data: Prisma.CustomerUncheckedUpdateInput): Promise<Customer> {
    return this.prisma.customer.update({ where: { id }, data });
  }

  listContacts(tenantId: string, customerId: string): Promise<CustomerContact[]> {
    return this.prisma.customerContact.findMany({
      where: { tenantId, customerId, deletedAt: null },
      orderBy: [{ isPrimary: 'desc' }, { name: 'asc' }],
    });
  }

  /** A live contact whose customer is live too. */
  findContact(tenantId: string, id: string): Promise<CustomerContact | null> {
    return this.prisma.customerContact.findFirst({
      where: { id, tenantId, deletedAt: null, customer: { deletedAt: null } },
    });
  }

  /** True when the site is a live site of the customer. */
  async isSiteOfCustomer(
    tenantId: string,
    customerId: string,
    siteId: string,
  ): Promise<boolean> {
    const count = await this.prisma.customerSite.count({
      where: { id: siteId, tenantId, customerId, deletedAt: null },
    });
    return count > 0;
  }

  /**
   * Creates a contact. A primary contact takes the flag from the previous one
   * in the same transaction (partial unique index uq_customer_contacts_primary).
   */
  createContact(
    data: Prisma.CustomerContactUncheckedCreateInput,
  ): Promise<CustomerContact> {
    return this.prisma.$transaction(async (tx) => {
      if (data.isPrimary) {
        await this.clearPrimary(tx, data.customerId, null);
      }
      return tx.customerContact.create({ data });
    });
  }

  /** Updates a contact; `isPrimary: true` moves the flag as in `createContact`. */
  updateContact(
    contact: CustomerContact,
    data: Prisma.CustomerContactUncheckedUpdateInput,
  ): Promise<CustomerContact> {
    return this.prisma.$transaction(async (tx) => {
      if (data.isPrimary === true) {
        await this.clearPrimary(tx, contact.customerId, contact.id);
      }
      return tx.customerContact.update({ where: { id: contact.id }, data });
    });
  }

  private clearPrimary(
    tx: Prisma.TransactionClient,
    customerId: string,
    exceptId: string | null,
  ): Promise<Prisma.BatchPayload> {
    return tx.customerContact.updateMany({
      where: {
        customerId,
        isPrimary: true,
        deletedAt: null,
        ...(exceptId === null ? {} : { id: { not: exceptId } }),
      },
      data: { isPrimary: false },
    });
  }
}

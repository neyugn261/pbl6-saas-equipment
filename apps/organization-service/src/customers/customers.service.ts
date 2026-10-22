import { Injectable } from '@nestjs/common';
import type { DataScope } from '@pbl6/auth';
import { type Page, toPage } from '@pbl6/service-kit';
import { notFound } from '../common/errors';
import { assertCustomerVisible } from '../common/scope';
import type { ListQueryDto } from '../common/validation';
import type { Customer } from '../generated/prisma/client.js';
import { type CustomerResponse, toCustomerResponse } from './customer.response';
import { CustomersRepository } from './customers.repository';
import type { CreateCustomerDto, UpdateCustomerDto } from './dto/customer.dto';

@Injectable()
export class CustomersService {
  constructor(private readonly customers: CustomersRepository) {}

  async list(scope: DataScope, query: ListQueryDto): Promise<Page<CustomerResponse>> {
    const [rows, total] = await this.customers.list(scope.tenantId, scope.customerId, query);
    return toPage(rows.map(toCustomerResponse), total, query);
  }

  async get(scope: DataScope, id: string): Promise<CustomerResponse> {
    return toCustomerResponse(await this.load(scope, id));
  }

  async create(tenantId: string, input: CreateCustomerDto): Promise<CustomerResponse> {
    return toCustomerResponse(await this.customers.create({ ...input, tenantId }));
  }

  async update(
    scope: DataScope,
    id: string,
    input: UpdateCustomerDto,
  ): Promise<CustomerResponse> {
    await this.load(scope, id);
    return toCustomerResponse(await this.customers.update(id, input));
  }

  /**
   * Soft delete; its sites, locations and contacts are hidden with it and its
   * memberships are deactivated.
   */
  async remove(scope: DataScope, id: string): Promise<void> {
    await this.load(scope, id);
    await this.customers.softDelete(id);
  }

  /** A live customer of the tenant that the caller may see, else 404. */
  async load(scope: DataScope, id: string): Promise<Customer> {
    assertCustomerVisible(scope, id);
    const customer = await this.customers.find(scope.tenantId, id);
    if (!customer) throw notFound('CUSTOMER_NOT_FOUND', 'Customer not found');
    return customer;
  }
}

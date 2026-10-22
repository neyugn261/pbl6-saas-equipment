import type {
  Customer,
  CustomerContact,
} from '../generated/prisma/client.js';

export interface CustomerResponse {
  id: string;
  code: string;
  name: string;
  taxCode: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ContactResponse {
  id: string;
  customerId: string;
  customerSiteId: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  position: string | null;
  isPrimary: boolean;
}

export function toCustomerResponse(customer: Customer): CustomerResponse {
  return {
    id: customer.id,
    code: customer.code,
    name: customer.name,
    taxCode: customer.taxCode,
    phone: customer.phone,
    email: customer.email,
    address: customer.address,
    status: customer.status,
    createdAt: customer.createdAt,
    updatedAt: customer.updatedAt,
  };
}

export function toContactResponse(contact: CustomerContact): ContactResponse {
  return {
    id: contact.id,
    customerId: contact.customerId,
    customerSiteId: contact.customerSiteId,
    name: contact.name,
    email: contact.email,
    phone: contact.phone,
    position: contact.position,
    isPrimary: contact.isPrimary,
  };
}

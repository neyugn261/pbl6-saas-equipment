import type { DataScope } from '@pbl6/auth';
import type { CustomersRepository } from '../customers/customers.repository';
import type { SitesRepository } from '../sites/sites.repository';
import { BatchLookupService } from './batch-lookup.service';

jest.mock('../customers/customers.repository', () => ({
  CustomersRepository: class CustomersRepository {},
}));
jest.mock('../sites/sites.repository', () => ({
  SitesRepository: class SitesRepository {},
}));

const TENANT_ID = '20000000-0000-4000-8000-000000000001';
const CUSTOMER_ID = '20000000-0000-4000-8000-000000000002';
const SITE_ID = '20000000-0000-4000-8000-000000000003';
const LOCATION_ID = '20000000-0000-4000-8000-000000000004';
const PARENT_LOCATION_ID = '20000000-0000-4000-8000-000000000005';
const CONTACT_ID = '20000000-0000-4000-8000-000000000006';

const tenantScope: DataScope = {
  tenantId: TENANT_ID,
  customerId: null,
};

function setup() {
  const customers = {
    lookupByCodes: jest.fn().mockResolvedValue([
      {
        id: CUSTOMER_ID,
        code: 'CUST-1',
        name: 'Customer One',
        address: 'Customer address',
        status: 'ACTIVE',
      },
    ]),
    lookupContacts: jest.fn().mockResolvedValue([
      {
        id: CONTACT_ID,
        code: 'CONTACT-1',
        customerId: CUSTOMER_ID,
        customerSiteId: SITE_ID,
        name: 'Contact One',
        email: 'contact@example.test',
        phone: null,
        position: null,
        isPrimary: true,
      },
    ]),
  } as unknown as CustomersRepository;
  const sites = {
    lookupByCodes: jest.fn().mockResolvedValue([
      {
        id: SITE_ID,
        tenantId: TENANT_ID,
        customerId: CUSTOMER_ID,
        code: 'SITE-1',
        name: 'Factory',
        address: 'Site address',
        status: 'ACTIVE',
        defaultServicingBranchId: null,
        customer: {
          code: 'CUST-1',
          name: 'Customer One',
          address: 'Customer address',
        },
        defaultServicingBranch: null,
      },
    ]),
    lookupLocations: jest.fn().mockResolvedValue([
      {
        id: LOCATION_ID,
        tenantId: TENANT_ID,
        customerSiteId: SITE_ID,
        parentId: PARENT_LOCATION_ID,
        code: 'LINE-1',
        name: 'Production line',
        type: 'AREA',
        status: 'ACTIVE',
        customerSite: {
          code: 'SITE-1',
          name: 'Factory',
          address: 'Site address',
          defaultServicingBranchId: null,
          customerId: CUSTOMER_ID,
          customer: { code: 'CUST-1', address: 'Customer address' },
        },
      },
    ]),
    locationPathRows: jest.fn().mockResolvedValue([
      {
        id: PARENT_LOCATION_ID,
        parentId: null,
        code: 'FLOOR-1',
        name: 'Floor 1',
        customerSiteId: SITE_ID,
      },
    ]),
  } as unknown as SitesRepository;
  return {
    customers,
    sites,
    service: new BatchLookupService(customers, sites),
  };
}

describe('BatchLookupService', () => {
  it('resolves related business codes in batches and returns the hierarchy and address context', async () => {
    const { customers, sites, service } = setup();

    const result = await service.lookup(tenantScope, {
      customerCodes: ['CUST-1'],
      sites: [{ customerCode: 'CUST-1', code: 'SITE-1' }],
      locations: [
        {
          customerCode: 'CUST-1',
          code: 'SITE-1',
          locationCode: 'LINE-1',
        },
      ],
      contacts: [{ customerCode: 'CUST-1', code: 'CONTACT-1' }],
    });

    expect(customers.lookupByCodes).toHaveBeenCalledWith(
      TENANT_ID,
      null,
      ['CUST-1'],
    );
    expect(sites.lookupByCodes).toHaveBeenCalledWith(TENANT_ID, [
      { customerCode: 'CUST-1', customerId: CUSTOMER_ID, code: 'SITE-1' },
      { customerCode: 'CUST-1', customerId: CUSTOMER_ID, code: 'SITE-1' },
    ]);
    expect(result.locations[0]).toMatchObject({
      customerAddress: 'Customer address',
      siteAddress: 'Site address',
      locationPath: [
        { code: 'FLOOR-1', name: 'Floor 1' },
        { code: 'LINE-1', name: 'Production line' },
      ],
    });
    expect(result.contacts).toHaveLength(1);
  });

  it('does not resolve another customer code or issue downstream lookups outside customer scope', async () => {
    const { customers, sites, service } = setup();
    const ownCustomerScope = { tenantId: TENANT_ID, customerId: CUSTOMER_ID };

    await service.lookup(ownCustomerScope, {
      sites: [{ customerCode: 'OTHER-CUSTOMER', code: 'SITE-1' }],
      contacts: [{ customerCode: 'OTHER-CUSTOMER', code: 'CONTACT-1' }],
    });

    expect(customers.lookupByCodes).toHaveBeenCalledWith(
      TENANT_ID,
      CUSTOMER_ID,
      ['OTHER-CUSTOMER'],
    );
    expect(sites.lookupByCodes).not.toHaveBeenCalled();
    expect(customers.lookupContacts).not.toHaveBeenCalled();
  });

  it('passes large caller batches through without a 50-row business cap', async () => {
    const { customers, service } = setup();
    const codes = Array.from({ length: 600 }, (_, index) => `CUSTOMER-${index}`);
    (customers.lookupByCodes as jest.Mock).mockResolvedValue([]);

    await service.lookup(tenantScope, { customerCodes: codes });

    expect(customers.lookupByCodes).toHaveBeenCalledWith(
      TENANT_ID,
      null,
      codes,
    );
  });
});

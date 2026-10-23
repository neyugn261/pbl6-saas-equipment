import type { Principal } from '@pbl6/auth';
import {
  runWithCorrelationId,
  ServiceHttpClient,
  toApiError,
  UpstreamError,
  UpstreamUnavailableError,
} from '@pbl6/service-kit';
import { OrganizationHttpClient } from './organization-http.client';

const principal = { accessToken: 'caller-token' } as Principal;

describe('OrganizationHttpClient contract', () => {
  it('forwards bearer token, correlation id and optional locationId', async () => {
    const fetchMock = jest.fn(async () => Response.json({
      customerId: 'customer-1', siteId: 'site-1', siteStatus: 'ACTIVE',
      locationId: 'location-1', defaultServicingBranchId: null,
    }));
    const client = new OrganizationHttpClient(new ServiceHttpClient({
      name: 'organization-service', baseUrl: 'http://organization.test',
      fetch: fetchMock as typeof fetch,
    }));
    const site = await runWithCorrelationId('asset-corr-1', () =>
      client.getSite('customer-1', 'site-1', 'location-1', principal),
    );
    expect(site?.siteId).toBe('site-1');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.pathname).toBe('/internal/customers/customer-1/sites/site-1');
    expect(url.searchParams.get('locationId')).toBe('location-1');
    expect(init.headers).toMatchObject({
      authorization: 'Bearer caller-token', 'x-correlation-id': 'asset-corr-1',
    });
  });

  it('returns null only for 404, not for upstream failures', async () => {
    const response = jest.fn(async () => Response.json({ code: 'CUSTOMER_NOT_FOUND' }, { status: 404 }));
    const missing = new OrganizationHttpClient(new ServiceHttpClient({
      name: 'organization-service', baseUrl: 'http://organization.test',
      fetch: response as typeof fetch,
    }));
    expect(await missing.getCustomer('missing', principal)).toBeNull();

    const failed = new OrganizationHttpClient(new ServiceHttpClient({
      name: 'organization-service', baseUrl: 'http://organization.test',
      fetch: jest.fn(async () => Response.json({}, { status: 500 })) as typeof fetch,
    }));
    await expect(failed.getCustomer('customer-1', principal)).rejects.toBeInstanceOf(UpstreamError);
    try {
      await failed.getCustomer('customer-1', principal);
    } catch (error) {
      expect(toApiError(error).status).toBe(502);
    }

    const offline = new OrganizationHttpClient(new ServiceHttpClient({
      name: 'organization-service', baseUrl: 'http://organization.test',
      fetch: jest.fn(async () => { throw new Error('offline'); }) as typeof fetch,
    }));
    await expect(offline.getCustomer('customer-1', principal))
      .rejects.toBeInstanceOf(UpstreamUnavailableError);
  });
});

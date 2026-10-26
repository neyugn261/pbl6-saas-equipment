import { ConfigService } from '@nestjs/config';
import {
  runWithCorrelationId,
  UpstreamUnavailableError,
} from '@pbl6/service-kit';
import { HttpReferencesClient } from './references.client';

describe('Work Order HTTP references', () => {
  afterEach(() => jest.restoreAllMocks());
  it('forwards user authorization and correlation id to all four real service paths', async () => {
    const fetch = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(
        async () =>
          new Response(JSON.stringify({ id: 'ref' }), { status: 200 }),
      );
    const client = new HttpReferencesClient(
      new ConfigService({
        IDENTITY_SERVICE_URL: 'http://identity.test',
        ORGANIZATION_SERVICE_URL: 'http://organization.test',
        ASSET_SERVICE_URL: 'http://asset.test',
        SERVICE_REQUEST_SERVICE_URL: 'http://requests.test',
      }),
    );
    await runWithCorrelationId('week1-reference', async () => {
      await client.user('user-id', 'user-token');
      await client.branch('branch-id', 'user-token');
      await client.request('request-id', 'user-token');
      await client.equipment('equipment-id', 'user-token');
    });
    expect(fetch.mock.calls.map((c) => String(c[0]))).toEqual([
      'http://identity.test/internal/users/user-id',
      'http://organization.test/internal/branches/branch-id',
      'http://requests.test/internal/service-requests/request-id',
      'http://asset.test/internal/equipment/equipment-id',
    ]);
    for (const [, options] of fetch.mock.calls)
      expect(options?.headers).toMatchObject({
        authorization: 'Bearer user-token',
        'x-correlation-id': 'week1-reference',
      });
  });
  it('treats 404 as a missing reference and propagates outages without fake fallback', async () => {
    const fetch = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('{}', { status: 404 }))
      .mockRejectedValueOnce(new Error('offline'));
    const client = new HttpReferencesClient(
      new ConfigService({
        IDENTITY_SERVICE_URL: 'http://identity.test',
        ORGANIZATION_SERVICE_URL: 'http://organization.test',
        ASSET_SERVICE_URL: 'http://asset.test',
        SERVICE_REQUEST_SERVICE_URL: 'http://requests.test',
      }),
    );
    expect(await client.user('missing', 'token')).toBeNull();
    await expect(client.request('missing', 'token')).rejects.toBeInstanceOf(
      UpstreamUnavailableError,
    );
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});

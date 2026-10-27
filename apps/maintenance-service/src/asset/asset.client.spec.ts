import { ServiceHttpClient } from '@pbl6/service-kit';
import { AssetHttpClient } from './asset.client';
import type { Principal } from '@pbl6/auth';
it('forwards the caller token to the scoped internal Asset reference, without fallback', async () => {
  const fetcher = jest
    .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
    .mockResolvedValue(new Response('{}', { status: 200 }));
  const client = new AssetHttpClient(
    new ServiceHttpClient({
      name: 'asset-service',
      baseUrl: 'http://asset.test',
      fetch: fetcher,
    }),
  );
  await client.equipment('id', { accessToken: 'user-access' } as Principal);
  expect(String(fetcher.mock.calls[0][0])).toBe(
    'http://asset.test/internal/equipment/id',
  );
  expect(fetcher.mock.calls[0][1]?.headers).toMatchObject({
    authorization: 'Bearer user-access',
  });
  fetcher.mockRejectedValueOnce(new Error('offline'));
  await expect(
    client.equipment('id', { accessToken: 'user-access' } as Principal),
  ).rejects.toThrow('unavailable');
});

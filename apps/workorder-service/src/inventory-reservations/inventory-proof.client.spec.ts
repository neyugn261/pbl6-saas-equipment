import { ConfigService } from '@nestjs/config';
import type { Principal } from '@pbl6/auth';
import { runWithCorrelationId } from '@pbl6/service-kit';
import { InventoryProofClient } from './inventory-proof.client';

describe('Inventory proof HTTP boundary', () => {
  const principal = { accessToken: 'original-test-bearer' } as Principal;
  afterEach(() => jest.restoreAllMocks());
  const client = () =>
    new InventoryProofClient(
      new ConfigService({ INVENTORY_SERVICE_URL: 'http://inventory.test' }),
    );
  it('forwards the original bearer and correlation ID to the direct internal proof URL', async () => {
    const fetch = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response('{"state":"PENDING"}'));
    const http = client();
    await runWithCorrelationId('reservation-http', () =>
      http.get(principal, 'operation-key'),
    );
    expect(String(fetch.mock.calls[0][0])).toBe(
      'http://inventory.test/internal/inventory-operations/operation-key',
    );
    expect(fetch.mock.calls[0][1]?.headers).toMatchObject({
      authorization: 'Bearer original-test-bearer',
      'x-correlation-id': 'reservation-http',
    });
  });
  it('fails closed with 503 when Inventory is not configured', async () => {
    const fetch = jest
      .spyOn(global, 'fetch')
      .mockRejectedValue(new Error('Unexpected test network'));
    await expect(
      new InventoryProofClient(
        new ConfigService({ INVENTORY_SERVICE_URL: '' }),
      ).get(principal, 'key'),
    ).rejects.toMatchObject({ status: 503 });
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each([401, 403])(
    'preserves source authorization failure %i',
    async (status) => {
      jest
        .spyOn(global, 'fetch')
        .mockResolvedValue(new Response('{}', { status }));
      await expect(client().get(principal, 'key')).rejects.toMatchObject({
        status,
      });
    },
  );
  it('maps only the typed missing operation to a proof conflict', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(
        new Response('{"code":"INVENTORY_NOT_FOUND"}', { status: 404 }),
      );
    await expect(client().get(principal, 'key')).rejects.toMatchObject({
      status: 409,
    });
  });
  it.each([404, 500, 503])(
    'keeps source routing/outage %i unavailable instead of inventing an aborted operation',
    async (status) => {
      jest
        .spyOn(global, 'fetch')
        .mockResolvedValue(new Response('{}', { status }));
      await expect(client().get(principal, 'key')).rejects.toMatchObject({
        status: 503,
      });
    },
  );
  it('keeps network failure unavailable and sanitizes diagnostics', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockRejectedValue(new Error('private transport diagnostic'));
    try {
      await client().get(principal, 'key');
      throw new Error('expected rejection');
    } catch (error) {
      expect(error).toMatchObject({ status: 503 });
      expect(JSON.stringify(error)).not.toContain(
        'private transport diagnostic',
      );
    }
  });
});

import { ConfigService } from '@nestjs/config';
import type { Principal } from '@pbl6/auth';
import { ReferencesClient } from './references.client';
import { randomUUID } from 'node:crypto';

describe('Inventory forwarded references and reservation gate', () => {
  const id = randomUUID(),
    requestId = randomUUID(),
    hash = 'a'.repeat(64);
  const p = { accessToken: 'test-caller-token' } as Principal;
  let client: ReferencesClient;
  let fetchMock: jest.SpyInstance;
  beforeEach(() => {
    fetchMock = jest.spyOn(globalThis, 'fetch');
    client = new ReferencesClient(
      new ConfigService({
        ORGANIZATION_SERVICE_URL: 'http://organization.test',
        WORKORDER_SERVICE_URL: 'http://workorders.test',
        ASSET_SERVICE_URL: 'http://asset.test',
      }),
    );
  });
  afterEach(() => fetchMock.mockRestore());
  it('uses the real internal reservation route and forwards caller JWT', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          workOrderId: id,
          requestId,
          fingerprint: hash,
          state: 'HELD',
        }),
        { status: 201 },
      ),
    );
    await client.reserve(id, { requestId, fingerprint: hash }, p);
    const [url, options] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(
      `http://workorders.test/internal/work-orders/${id}/inventory-reservations`,
    );
    expect(options.headers.authorization).toBe('Bearer test-caller-token');
    expect(JSON.parse(options.body)).toEqual({ requestId, fingerprint: hash });
  });
  it('fails closed on an unimplemented reservation API without falling back to GET', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 404 }));
    await expect(
      client.reserve(id, { requestId, fingerprint: hash }, p),
    ).rejects.toMatchObject({
      response: { code: 'WO_RESERVATION_UNAVAILABLE' },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('rejects reservation mismatches and propagates terminal conflicts', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          workOrderId: randomUUID(),
          requestId,
          fingerprint: hash,
          state: 'HELD',
        }),
      ),
    );
    await expect(
      client.reserve(id, { requestId, fingerprint: hash }, p),
    ).rejects.toMatchObject({
      response: { code: 'INVALID_RESERVATION_RESPONSE' },
    });
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 409 }));
    await expect(
      client.reserve(id, { requestId, fingerprint: hash }, p),
    ).rejects.toMatchObject({ response: { code: 'WO_RESERVATION_CONFLICT' } });
  });
  it('treats missing Branch as null and source errors as failures', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 404 }));
    expect(await client.branch(id, p)).toBeNull();
    fetchMock.mockRejectedValueOnce(new Error('test network'));
    await expect(client.branch(id, p)).rejects.toMatchObject({
      name: 'UpstreamUnavailableError',
    });
  });
  it('forwards the caller JWT to live equipment scope, WO detail and report APIs', async () => {
    fetchMock.mockImplementation(
      async () => new Response(JSON.stringify({ id }), { status: 200 }),
    );
    await client.equipment(id, p);
    await client.workOrderDetail(id, p);
    await client.serviceReport(id, p);
    await client.assignments(id, p);
    expect(fetchMock.mock.calls.map((call) => String(call[0]))).toEqual([
      `http://asset.test/internal/equipment/${id}`,
      `http://workorders.test/work-orders/${id}`,
      `http://workorders.test/work-orders/${id}/service-report`,
      `http://workorders.test/work-orders/${id}/assignments`,
    ]);
    expect(
      fetchMock.mock.calls.every(
        (call) => call[1].headers.authorization === 'Bearer test-caller-token',
      ),
    ).toBe(true);
  });
});

import { ConfigService } from '@nestjs/config';
import { runWithCorrelationId } from '@pbl6/service-kit';
import type { AppEnv } from '../config/env.validation';
import { HttpWorkOrderAttachmentsClient } from './workorder-attachments.client';

function config(): ConfigService<AppEnv, true> {
  return new ConfigService<AppEnv, true>({
    NODE_ENV: 'test',
    PORT: 3007,
    SERVICE_REQUEST_DATABASE_URL:
      'postgresql://localhost/service_request_test_db',
    ASSET_SERVICE_URL: 'http://asset:3002',
    WORKORDER_SERVICE_URL: 'http://workorder:3004',
    JWT_ACCESS_SECRET: 't'.repeat(32),
    JWT_ISSUER: 'pbl6-identity',
    JWT_AUDIENCE: 'pbl6',
  });
}

describe('HttpWorkOrderAttachmentsClient', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('redacts untrusted source error codes from errors that the shared filter logs', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          code: 'signed-url-secret',
          message: 'signed-url-secret',
        }),
        { status: 500 },
      ),
    );
    const error = await new HttpWorkOrderAttachmentsClient(config())
      .listPublished('request', 'token', 1, 20)
      .catch((value: unknown) => value);
    expect(error).toBeInstanceOf(Error);
    expect(String(error)).not.toContain('signed-url-secret');
    expect(JSON.stringify(error)).not.toContain('signed-url-secret');
  });

  it.each([null, 'not-json', { items: [], page: 1, pageSize: 20, total: -1 }])(
    'rejects invalid upstream pages without returning raw payload: %p',
    async (payload) => {
      jest
        .spyOn(global, 'fetch')
        .mockResolvedValue(new Response(JSON.stringify(payload)));
      await expect(
        new HttpWorkOrderAttachmentsClient(config()).listPublished(
          'request',
          'token',
          1,
          20,
        ),
      ).rejects.toMatchObject({ status: 502 });
    },
  );

  it('only returns allowlisted metadata from the source', async () => {
    const item = {
      id: '00000000-0000-4000-8000-000000002101',
      fileName: 'report.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 10,
      createdAt: '2026-11-01T10:00:00.000Z',
    };
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          items: [{ ...item, storageKey: 'private', bucket: 'private' }],
          page: 1,
          pageSize: 20,
          total: 1,
          internal: 'private',
        }),
      ),
    );
    await expect(
      new HttpWorkOrderAttachmentsClient(config()).listPublished(
        'request',
        'token',
        1,
        20,
      ),
    ).resolves.toEqual({ items: [item], page: 1, pageSize: 20, total: 1 });
  });

  it('rejects unsafe download payloads', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          downloadUrl: 'javascript:alert(1)',
          expiresAt: 'invalid',
        }),
      ),
    );
    await expect(
      new HttpWorkOrderAttachmentsClient(config()).downloadPublished(
        'request',
        'attachment',
        'token',
      ),
    ).rejects.toMatchObject({ status: 502 });
  });

  it('forwards the caller token and pagination to the internal list route', async () => {
    const fetch = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(
        new Response(
          JSON.stringify({ items: [], page: 1, pageSize: 20, total: 0 }),
          { status: 200 },
        ),
      );
    const client = new HttpWorkOrderAttachmentsClient(config());

    await runWithCorrelationId('sr-attachment-test', () =>
      client.listPublished(
        '00000000-0000-4000-8000-000000002001',
        'customer-token',
        1,
        20,
      ),
    );

    expect(String(fetch.mock.calls[0][0])).toBe(
      'http://workorder:3004/internal/service-request-attachments/00000000-0000-4000-8000-000000002001?page=1&pageSize=20',
    );
    const headers = fetch.mock.calls[0][1]?.headers as Record<string, string>;
    expect(headers.authorization.endsWith('customer-token')).toBe(true);
    expect(headers).toMatchObject({
      'x-correlation-id': 'sr-attachment-test',
    });
  });

  it('calls the source download route without exposing its metadata parameters', async () => {
    const fetch = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          downloadUrl: 'https://storage.example/file?sig=fixture',
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
        }),
        { status: 200 },
      ),
    );
    const client = new HttpWorkOrderAttachmentsClient(config());

    await client.downloadPublished(
      '00000000-0000-4000-8000-000000002001',
      '00000000-0000-4000-8000-000000002101',
      'customer-token',
    );

    expect(String(fetch.mock.calls[0][0])).toBe(
      'http://workorder:3004/internal/service-request-attachments/00000000-0000-4000-8000-000000002001/00000000-0000-4000-8000-000000002101/download',
    );
    const headers = fetch.mock.calls[0][1]?.headers as Record<string, string>;
    expect(headers.authorization.endsWith('customer-token')).toBe(true);
  });
});

import { ConfigService } from '@nestjs/config';
import { toApiError } from '@pbl6/service-kit';
import type { AppEnv } from '../config/env.validation';
import { HttpWorkOrderAttachmentsClient } from './workorder-attachments.client';

const item = {
  id: '00000000-0000-4000-8000-000000002101',
  fileName: 'report.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 10,
  createdAt: '2026-11-01T10:00:00.000Z',
};
const page = { items: [item], page: 1, pageSize: 20, total: 1 };
const client = () =>
  new HttpWorkOrderAttachmentsClient(
    new ConfigService<AppEnv, true>({
      WORKORDER_SERVICE_URL: 'http://source.test',
    } as AppEnv),
  );
const list = () => client().listPublished('request', 'caller', 1, 20);
const download = () =>
  client().downloadPublished('request', 'attachment', 'caller');
function respond(value: unknown) {
  jest
    .spyOn(global, 'fetch')
    .mockResolvedValue(new Response(JSON.stringify(value)));
}

describe('C4 client negative contract matrix', () => {
  afterEach(() => jest.restoreAllMocks());
  it.each([
    { ...item, id: 'invalid' },
    { ...item, mimeType: 'text/html' },
    { ...item, sizeBytes: '10' },
    { ...item, sizeBytes: 10485761 },
    { ...item, createdAt: 'invalid' },
    { ...item, fileName: null },
  ])('rejects malformed metadata %p', async (bad) => {
    respond({ ...page, items: [bad] });
    await expect(list()).rejects.toMatchObject({ status: 502 });
  });
  it.each([
    { ...page, page: 2 },
    { ...page, pageSize: 101 },
    { ...page, total: '1' },
    { ...page, total: 0 },
    { ...page, total: 1.5 },
    { ...page, items: {} },
    { ...page, items: Array(21).fill(item), total: 21 },
  ])('rejects malformed pagination %p', async (bad) => {
    respond(bad);
    await expect(list()).rejects.toMatchObject({ status: 502 });
  });
  it('rejects non-JSON source responses', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(
        new Response('<html>internal</html>', {
          headers: { 'content-type': 'text/html' },
        }),
      );
    await expect(list()).rejects.toMatchObject({ status: 502 });
  });
  it.each([
    'not-a-url',
    'https://user:secret@storage.example/file',
    'javascript:alert(1)',
    'file:///private',
    'data:text/plain,private',
  ])('rejects invalid download URL %s', async (downloadUrl) => {
    respond({
      downloadUrl,
      expiresAt: new Date(Date.now() + 60000).toISOString(),
    });
    await expect(download()).rejects.toMatchObject({ status: 502 });
  });
  it.each([
    'http://localhost:9000/bucket/file?sig=test',
    'https://files.example/file?sig=test',
  ])('accepts storage-compatible URL %s', async (downloadUrl) => {
    const ticket = {
      downloadUrl,
      expiresAt: new Date(Date.now() + 60000).toISOString(),
    };
    respond(ticket);
    await expect(download()).resolves.toEqual(ticket);
  });
  it('does not return an already expired signed ticket', async () => {
    respond({
      downloadUrl: 'https://storage.example/file?sig=private',
      expiresAt: new Date(Date.now() - 60000).toISOString(),
    });
    await expect(download()).rejects.toMatchObject({ status: 502 });
  });
  it('maps body-read transport failure to sanitized unavailable, not an internal error', async () => {
    const response = new Response('{}');
    jest
      .spyOn(response, 'text')
      .mockRejectedValue(
        new DOMException('signed-url-private', 'TimeoutError'),
      );
    jest.spyOn(global, 'fetch').mockResolvedValue(response);
    const error = await list().catch((e: unknown) => e);
    expect(toApiError(error).status).toBe(503);
    expect(String(error)).not.toContain('signed-url-private');
  });
  it.each([401, 403, 404, 409, 500, 503])(
    'sanitizes source HTTP %i without retries',
    async (status) => {
      const fetchMock = jest
        .spyOn(global, 'fetch')
        .mockResolvedValue(
          new Response(
            JSON.stringify({ code: 'private', storageKey: 'private' }),
            { status },
          ),
        );
      const error = await list().catch((e: unknown) => e);
      expect(error).toMatchObject({ status, body: undefined });
      expect(String(error)).not.toContain('private');
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );
  it('works without an incoming correlation context', async () => {
    respond(page);
    await expect(list()).resolves.toEqual(page);
    const call = (global.fetch as jest.Mock).mock.calls[0];
    expect(call[1].headers['x-correlation-id']).toBeUndefined();
    expect(call[1].headers.authorization).toBe('Bearer caller');
  });
});

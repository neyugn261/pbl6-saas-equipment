import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { RequestListener } from 'node:http';
import { ConfigService } from '@nestjs/config';
import { toApiError } from '@pbl6/service-kit';
import type { AppEnv } from '../config/env.validation';
import { HttpWorkOrderAttachmentsClient } from './workorder-attachments.client';

describe('C4 real loopback HTTP transport', () => {
  let server: Server;
  async function start(handler: RequestListener) {
    server = createServer(handler);
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    const { port } = server.address() as AddressInfo;
    return new HttpWorkOrderAttachmentsClient(
      new ConfigService<AppEnv, true>({
        WORKORDER_SERVICE_URL: `http://127.0.0.1:${port}`,
      } as AppEnv),
    );
  }
  afterEach(async () => {
    if (!server?.listening) return;
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  });
  it.each(['headers', 'body'])(
    'returns 503 for an actual 5-second timeout waiting for %s',
    async (phase) => {
      let calls = 0;
      const client = await start((_req, res) => {
        calls++;
        if (phase === 'body') {
          res.writeHead(200, { 'content-type': 'application/json' });
          res.write('{"items":');
        }
        // Deliberately leave the connection open until AbortSignal expires.
      });
      const error = await client
        .listPublished('request', 'fixture-token', 1, 20)
        .catch((value: unknown) => value);
      expect(toApiError(error)).toMatchObject({
        status: 503,
        body: { code: 'UPSTREAM_UNAVAILABLE' },
      });
      expect(calls).toBe(1);
    },
    10000,
  );
  it('returns 503 for a refused loopback connection', async () => {
    const client = await start((_req, res) => res.end());
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    const error = await client
      .listPublished('request', 'fixture-token', 1, 20)
      .catch((value: unknown) => value);
    expect(toApiError(error).status).toBe(503);
  });
});

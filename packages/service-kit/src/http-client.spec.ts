import { runWithCorrelationId } from './correlation';
import { ServiceHttpClient, UpstreamError, UpstreamUnavailableError } from './http-client';

function fakeFetch(status: number, body: unknown) {
  const calls: { url: string; init: RequestInit }[] = [];
  const impl = (async (url: URL | string, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return new Response(body === undefined ? null : JSON.stringify(body), { status });
  }) as typeof fetch;
  return { impl, calls };
}

describe('ServiceHttpClient', () => {
  it('forwards the bearer token and correlation id and builds the query', async () => {
    const { impl, calls } = fakeFetch(200, { id: 'e1' });
    const client = new ServiceHttpClient({ name: 'asset-service', baseUrl: 'http://asset:3002/', fetch: impl });
    const result = await runWithCorrelationId('corr-1', () =>
      client.get<{ id: string }>('/internal/equipment/e1', {
        accessToken: 'tok',
        query: { date: '2026-10-17', skip: undefined },
      }),
    );
    expect(result).toEqual({ id: 'e1' });
    expect(calls[0].url).toBe('http://asset:3002/internal/equipment/e1?date=2026-10-17');
    expect(calls[0].init.headers).toMatchObject({
      authorization: 'Bearer tok',
      'x-correlation-id': 'corr-1',
    });
  });

  it('returns null for 404 with getOrNull and throws UpstreamError otherwise', async () => {
    const notFound = new ServiceHttpClient({ name: 's', baseUrl: 'http://s', fetch: fakeFetch(404, { code: 'NOT_FOUND', message: 'x' }).impl });
    await expect(notFound.getOrNull('/a')).resolves.toBeNull();
    await expect(notFound.get('/a')).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' });

    const conflict = new ServiceHttpClient({ name: 's', baseUrl: 'http://s', fetch: fakeFetch(409, 'plain text').impl });
    await expect(conflict.post('/a', { x: 1 })).rejects.toBeInstanceOf(UpstreamError);
  });

  it('sends JSON bodies', async () => {
    const { impl, calls } = fakeFetch(201, { ok: true });
    const client = new ServiceHttpClient({ name: 's', baseUrl: 'http://s', fetch: impl });
    await client.post('/a', { x: 1 });
    expect(calls[0].init).toMatchObject({ method: 'POST', body: '{"x":1}' });
    expect(calls[0].init.headers).toMatchObject({ 'content-type': 'application/json' });
  });

  it('reports network failures and timeouts as UpstreamUnavailableError', async () => {
    const failing = (async () => {
      throw new TypeError('fetch failed');
    }) as typeof fetch;
    const client = new ServiceHttpClient({ name: 'org', baseUrl: 'http://org', fetch: failing });
    await expect(client.get('/x')).rejects.toBeInstanceOf(UpstreamUnavailableError);

    const hanging = ((_url: URL, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
      })) as typeof fetch;
    const slow = new ServiceHttpClient({ name: 'org', baseUrl: 'http://org', timeoutMs: 20, fetch: hanging });
    await expect(slow.get('/x')).rejects.toBeInstanceOf(UpstreamUnavailableError);
  });
});

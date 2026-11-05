import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { DisplayIdsQuery, DisplayNameLookup } from './display-names';

describe('read-only display name batches', () => {
  const original = globalThis.fetch;
  const caller = { tenantId: 'tenant-a', accessToken: 'caller-token' };
  afterEach(() => { globalThis.fetch = original; });
  it('deduplicates, chunks beyond 100 and forwards the caller token without caching across tenants', async () => {
    const calls: { ids: string[]; token: string }[] = [];
    globalThis.fetch = (async (url: URL, init: RequestInit) => {
      const ids = url.searchParams.get('ids')!.split(',');
      calls.push({ ids, token: (init.headers as Record<string, string>).authorization });
      return new Response(JSON.stringify(ids.map(id => ({ id, tenantId: caller.tenantId, name: 'Inactive user' }))));
    }) as typeof fetch;
    const lookup = new DisplayNameLookup({ identity: 'http://identity.test' });
    const ids = Array.from({ length: 205 }, (_, i) => `user-${i}`);
    expect((await lookup.lookup('users', [...ids, ...ids, null, undefined], caller)).size).toBe(205);
    expect(calls.map(c => c.ids.length)).toEqual([100, 100, 5]);
    expect(calls.every(c => c.token === 'Bearer caller-token')).toBe(true);
    expect((await lookup.lookup('users', ['user-1'], { ...caller, tenantId: 'tenant-b' })).size).toBe(0);
    expect(calls).toHaveLength(4);
  });
  it('rejects foreign tenants, unrelated IDs and malformed names', async () => {
    globalThis.fetch = (async () => new Response(JSON.stringify([
      { id: 'a', tenantId: 'other', name: 'Foreign' }, { id: 'b', tenantId: 'tenant-a', name: 'Wrong reference' },
      { id: 'a', tenantId: 'tenant-a', name: null },
    ]))) as typeof fetch;
    expect((await new DisplayNameLookup({ identity: 'http://identity.test' }).lookup('users', ['a'], caller)).size).toBe(0);
  });
  it.each([403, 404, 503])('degrades safely on upstream %s', async status => {
    globalThis.fetch = (async () => new Response('{}', { status })) as typeof fetch;
    expect((await new DisplayNameLookup({ identity: 'http://identity.test' }).lookup('users', ['a'], caller)).size).toBe(0);
  });
  it('aborts a stalled lookup and stops further batches', async () => {
    let calls = 0;
    globalThis.fetch = ((_url: unknown, init: RequestInit) => new Promise((_resolve, reject) => {
      calls++;
      init.signal!.addEventListener('abort', () => reject(new Error('timeout')));
    })) as typeof fetch;
    const started = Date.now();
    expect((await new DisplayNameLookup({ identity: 'http://identity.test' }).lookup('users', Array.from({ length: 201 }, (_, i) => `${i}`), caller)).size).toBe(0);
    expect(Date.now() - started).toBeLessThan(2000);
    expect(calls).toBe(1);
  });
  it('does not request empty lists or unconfigured sources', async () => {
    globalThis.fetch = (() => { throw new Error('Unexpected fetch'); }) as typeof fetch;
    expect((await new DisplayNameLookup({ identity: 'http://identity.test' }).lookup('users', [], caller)).size).toBe(0);
    expect((await new DisplayNameLookup({}).lookup('branches', ['a'], caller)).size).toBe(0);
  });
  it('validates the separate batch contract: UUIDs, nonempty and at most 100', async () => {
    const uuid = '00000000-0000-4000-8000-000000000001';
    expect(await validate(plainToInstance(DisplayIdsQuery, { ids: uuid }))).toHaveLength(0);
    for (const ids of ['', 'invalid', Array(101).fill(uuid).join(',')])
      expect((await validate(plainToInstance(DisplayIdsQuery, { ids }))).length).toBeGreaterThan(0);
  });
});

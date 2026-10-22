import { INestApplication } from '@nestjs/common';
import {
  type EventEnvelope,
  OutboxRelay,
  parseEnvelope,
} from '@pbl6/event-contracts';
import { App } from 'supertest/types';
import { PRODUCER } from '../../src/events/outbox-publisher';
import { PrismaService } from '../../src/prisma/prisma.service';
import {
  api,
  bearer,
  createTenant,
  createTestApp,
  resetDatabase,
} from './support/test-app';

describe('Tenants and outbox (e2e, organization_test_db)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  const platform = () => api(app, bearer('PLATFORM_ADMIN'));
  const outbox = () =>
    prisma.outboxEvent.findMany({ orderBy: { occurredAt: 'asc' } });

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  it('creates a tenant and writes TenantCreated in the same transaction', async () => {
    const res = await platform()
      .post('/tenants', { code: 'ACME', name: 'Acme Equipment' })
      .set('x-correlation-id', 'it-tenant-1')
      .expect(201);
    expect(res.body).toMatchObject({ code: 'ACME', name: 'Acme Equipment', status: 'ACTIVE', plan: 'BASIC' });

    const events = await outbox();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      tenantId: res.body.id,
      aggregateType: 'Tenant',
      aggregateId: res.body.id,
      eventType: 'TenantCreated',
      eventVersion: 1,
      status: 'PENDING',
      payload: {
        data: { tenantId: res.body.id, code: 'ACME', name: 'Acme Equipment', status: 'ACTIVE' },
        meta: { correlationId: 'it-tenant-1' },
      },
    });
  });

  it('writes no event when the tenant is not created', async () => {
    await platform().post('/tenants', { code: 'ACME', name: 'Acme' }).expect(201);
    const dup = await platform().post('/tenants', { code: 'ACME', name: 'Again' }).expect(409);
    expect(dup.body.code).toBe('UNIQUE_VIOLATION');
    await platform().post('/tenants', { code: 'acme corp', name: 'x' }).expect(400);
    expect(await outbox()).toHaveLength(1);
  });

  it('changes the status with TenantStatusChanged and refuses a no-op change', async () => {
    const tenant = (await platform().post('/tenants', { code: 'ACME', name: 'Acme' }).expect(201)).body;
    const res = await platform()
      .post(`/tenants/${tenant.id}/status`, { status: 'SUSPENDED', reason: 'Unpaid' })
      .expect(200);
    expect(res.body.status).toBe('SUSPENDED');

    const same = await platform().post(`/tenants/${tenant.id}/status`, { status: 'SUSPENDED' }).expect(409);
    expect(same.body.code).toBe('INVALID_STATE_TRANSITION');

    const events = await outbox();
    expect(events.map((e) => e.eventType)).toEqual(['TenantCreated', 'TenantStatusChanged']);
    expect(events[1].payload).toMatchObject({
      data: { tenantId: tenant.id, code: 'ACME', status: 'SUSPENDED', previousStatus: 'ACTIVE' },
    });
  });

  it('lists, reads and renames tenants but never changes the code', async () => {
    const tenant = (await platform().post('/tenants', { code: 'ACME', name: 'Acme' }).expect(201)).body;
    await platform().post('/tenants', { code: 'BETA', name: 'Beta' }).expect(201);

    const list = await platform().get('/tenants?q=acm').expect(200);
    expect(list.body).toMatchObject({ total: 1, items: [{ code: 'ACME' }] });
    const renamed = await platform().patch(`/tenants/${tenant.id}`, { name: 'Acme JSC', plan: 'PRO' }).expect(200);
    expect(renamed.body).toMatchObject({ code: 'ACME', name: 'Acme JSC', plan: 'PRO' });
    await platform().patch(`/tenants/${tenant.id}`, { code: 'NEW' }).expect(400);
    await platform().get('/tenants/00000000-0000-4000-8000-000000000999').expect(404);
  });

  it('is reserved to the Platform Admin', async () => {
    const tenantId = await createTenant(prisma, 'ACME');
    await api(app, bearer('TENANT_ADMIN', tenantId)).get('/tenants').expect(403);
    await api(app, bearer('TENANT_ADMIN', tenantId)).post('/tenants', { code: 'X1', name: 'x' }).expect(403);
    await api(app, bearer('TENANT_ADMIN', tenantId)).get(`/tenants/${tenantId}`).expect(403);
  });

  it('publishes pending rows through the outbox relay as valid envelopes', async () => {
    await platform().post('/tenants', { code: 'ACME', name: 'Acme' }).expect(201);
    const published: EventEnvelope[] = [];
    const relay = new OutboxRelay({
      db: prisma,
      publisher: { publish: async (envelope) => void published.push(envelope) },
      producer: PRODUCER,
    });

    await expect(relay.runOnce()).resolves.toMatchObject({ published: 1, failed: 0 });
    expect(published).toHaveLength(1);
    // What a consumer does with the broker message: parse and check it against the catalog.
    expect(() => parseEnvelope(JSON.stringify(published[0]))).not.toThrow();
    expect(published[0]).toMatchObject({ eventType: 'TenantCreated', producer: 'organization-service' });
    expect((await outbox())[0].status).toBe('PUBLISHED');
    await expect(relay.runOnce()).resolves.toMatchObject({ published: 0 });
  });
});

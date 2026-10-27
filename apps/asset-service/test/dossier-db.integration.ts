import { randomUUID } from 'node:crypto';
import { Logger, type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { config } from 'dotenv';
import {
  requireTestDatabaseUrl,
  signTestAccessToken,
  testJwtEnv,
} from '@pbl6/testing';
import { configureApp } from '@pbl6/service-kit';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { ORGANIZATION_CLIENT } from '../src/organization/organization-client';

config({ path: '../../.env', quiet: true });
Object.assign(process.env, testJwtEnv(), {
  NODE_ENV: 'test',
  ASSET_DATABASE_URL: requireTestDatabaseUrl('ASSET_TEST_DATABASE_URL'),
  RABBITMQ_URL: '',
  ORGANIZATION_SERVICE_URL: 'http://organization.test',
  ASSET_QR_PORTAL_BASE_URL: 'http://portal.test',
  SERVICE_REQUEST_SERVICE_URL: 'http://requests.test',
  WORKORDER_SERVICE_URL: 'http://workorder.test',
  MAINTENANCE_SERVICE_URL: 'http://maintenance.test',
});
const tenantId = randomUUID(),
  customerId = randomUUID(),
  siteId = randomUUID(),
  actor = randomUUID(),
  refId = randomUUID();
const manager = signTestAccessToken({
  role: 'SERVICE_MANAGER',
  tenantId,
  userId: actor,
});
const customer = signTestAccessToken({
  role: 'CUSTOMER_USER',
  tenantId,
  customerId,
});
const foreign = signTestAccessToken({
  role: 'CUSTOMER_USER',
  tenantId,
  customerId: randomUUID(),
});
const headers = (token = manager) => ({ authorization: `Bearer ${token}` });
let app: INestApplication,
  db: PrismaService,
  equipmentId: string,
  modelId: string;
let fetchMock: jest.SpyInstance;
const sourceRequest = (extra = {}) => ({
  id: refId,
  equipmentId,
  customerId,
  requestNo: 'SR-DOSSIER',
  status: 'AWAITING_INFO',
  title: 'Pump noise',
  allowedActions: ['edit', 'add-comment'],
  ...extra,
});
const fakeSources = () =>
  jest.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
    const target = new URL(String(url));
    let value: unknown = { items: [], total: 0 };
    if (target.pathname === `/customers/${customerId}`)
      value = { id: customerId, name: 'Customer', internalSecret: 'hidden' };
    else if (target.pathname === `/sites/${siteId}`)
      value = { id: siteId, customerId, name: 'Factory' };
    else if (target.pathname.endsWith('/contacts'))
      value = [
        {
          id: randomUUID(),
          customerId,
          customerSiteId: siteId,
          name: 'Site contact',
        },
      ];
    else if (target.pathname === '/service-requests')
      value = { items: [sourceRequest()], total: 22 };
    else if (target.pathname === `/service-requests/${refId}`)
      value = sourceRequest({
        warrantyCheck: {
          result: 'IN_WARRANTY',
          checkedAt: '2026-01-01T00:00:00Z',
        },
        liveEstimate: null,
      });
    else if (target.pathname.endsWith('/estimates'))
      value = [
        {
          id: randomUUID(),
          revisionNo: 1,
          status: 'REJECTED',
          totalAmount: '100.00',
        },
      ];
    else if (target.pathname === '/maintenance-summary')
      value = { equipmentId, nextDue: null, taskCounts: {} };
    else if (
      target.pathname.endsWith('/history') ||
      target.pathname.endsWith('/comments')
    )
      value = [];
    return new Response(JSON.stringify(value), { status: 200 });
  });
beforeAll(async () => {
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(ORGANIZATION_CLIENT)
    .useValue({
      getCustomer: async () => ({ id: customerId }),
      getSite: async () => ({ customerId, siteId }),
    })
    .compile();
  app = module.createNestApplication({ logger: false });
  configureApp(app, { logger: new Logger('dossier-db') });
  await app.init();
  db = app.get(PrismaService);
  const model = await request(app.getHttpServer())
    .post('/equipment-models')
    .set(headers())
    .send({ manufacturer: 'Test', modelCode: randomUUID(), name: 'Pump' })
    .expect(201);
  modelId = model.body.id;
  const equipment = await request(app.getHttpServer())
    .post('/equipment')
    .set(headers())
    .send({
      modelId,
      customerId,
      customerSiteId: siteId,
      assetCode: randomUUID(),
      serialNumber: randomUUID(),
      displayName: 'Pump #1',
      technicalSpecifications: { powerKw: 5, voltage: '220 V' },
      commissionedDate: '2026-01-01',
    })
    .expect(201);
  equipmentId = equipment.body.id;
});
afterEach(() => {
  fetchMock?.mockRestore();
});
afterAll(async () => {
  await db.outboxEvent.deleteMany({ where: { tenantId } });
  await db.equipmentHistory.deleteMany({ where: { tenantId } });
  await db.warranty.deleteMany({ where: { tenantId } });
  await db.equipment.deleteMany({ where: { tenantId } });
  await db.equipmentModelHistory.deleteMany({ where: { tenantId } });
  await db.equipmentModel.deleteMany({ where: { tenantId } });
  await app.close();
});
it('composes scoped source sections, bounded previews and completeness without deriving health from jobs', async () => {
  fetchMock = fakeSources();
  const { body } = await request(app.getHttpServer())
    .get(`/equipment/${equipmentId}/dossier`)
    .set(headers())
    .expect(200);
  expect(body.equipment).toMatchObject({
    displayName: 'Pump #1',
    technicalSpecifications: { powerKw: 5 },
    commissionedDate: '2026-01-01',
  });
  expect(body.requests).toMatchObject({
    status: 'AVAILABLE',
    data: { total: 22, pageSize: 5, items: [{ waitingFor: 'CUSTOMER' }] },
  });
  expect(body.operationalCondition.status).toBe('UNKNOWN');
  const countBefore = await db.equipmentHistory.count({
    where: { tenantId, equipmentId },
  });
  await request(app.getHttpServer())
    .patch(`/equipment/${equipmentId}`)
    .set(headers())
    .send({ technicalSpecifications: { voltage: '220 V', powerKw: 5 } })
    .expect(200);
  expect(
    await db.equipmentHistory.count({ where: { tenantId, equipmentId } }),
  ).toBe(countBefore);
  expect(body.customer.data.internalSecret).toBeUndefined();
  const source = fetchMock.mock.calls.find(([url]) =>
    String(url).includes('/service-requests'),
  )!;
  expect(String(source[0])).toContain(`equipmentId=${equipmentId}`);
  expect(source[1].headers.authorization).toBe(`Bearer ${manager}`);
});
it('authorizes equipment before upstream calls and validates query filters', async () => {
  fetchMock = fakeSources();
  await request(app.getHttpServer())
    .get(`/equipment/${equipmentId}/dossier`)
    .set(headers(foreign))
    .expect(404);
  expect(fetchMock).not.toHaveBeenCalled();
  await request(app.getHttpServer())
    .get(`/equipment/${equipmentId}/service-requests?pageSize=101`)
    .set(headers())
    .expect(400);
  await request(app.getHttpServer())
    .get('/equipment-history?from=2026-02-01&to=2026-01-01')
    .set(headers())
    .expect(400);
});
it('keeps customer WO/Maintenance restricted and hides internal audit reasons', async () => {
  await request(app.getHttpServer())
    .patch(`/equipment/${equipmentId}`)
    .set(headers())
    .send({
      operationalStatus: 'DEGRADED',
      reason: 'Internal diagnosis private',
      customerNote: 'Reduced capacity until repaired',
    })
    .expect(200);
  fetchMock = fakeSources();
  const { body } = await request(app.getHttpServer())
    .get(`/equipment/${equipmentId}/dossier`)
    .set(headers(customer))
    .expect(200);
  expect(body.workOrders.status).toBe('RESTRICTED');
  expect(body.equipment.operationalStatusUpdatedBy).toBeNull();
  expect(body.maintenance.status).toBe('RESTRICTED');
  expect(
    fetchMock.mock.calls.some(
      ([url]) =>
        String(url).includes('workorder.test') ||
        String(url).includes('maintenance.test'),
    ),
  ).toBe(false);
  const feed = await request(app.getHttpServer())
    .get(
      `/equipment/${equipmentId}/timeline?eventType=OPERATIONAL_STATUS_CONFIRMED`,
    )
    .set(headers(customer))
    .expect(200);
  expect(feed.body.items[0]).toMatchObject({
    reasonInternal: null,
    createdBy: null,
    customerNote: 'Reduced capacity until repaired',
    changes: { operationalStatus: { before: 'UNKNOWN', after: 'DEGRADED' } },
  });
  expect(JSON.stringify(feed.body)).not.toContain('Internal diagnosis private');
});
it('marks remote outages and absent configuration distinctly while retaining local profile', async () => {
  fetchMock = fakeSources();
  fetchMock.mockImplementation(async () => {
    throw new Error('private transport info');
  });
  app.get(ConfigService).set('MAINTENANCE_SERVICE_URL', '');
  try {
    const { body } = await request(app.getHttpServer())
      .get(`/equipment/${equipmentId}/dossier`)
      .set(headers())
      .expect(200);
    expect(body.requests).toEqual({ status: 'UNAVAILABLE', data: null });
    expect(body.maintenance.status).toBe('NOT_CONFIGURED');
    expect(body.equipment.id).toBe(equipmentId);
    expect(JSON.stringify(body)).not.toContain('private transport');
  } finally {
    app
      .get(ConfigService)
      .set('MAINTENANCE_SERVICE_URL', 'http://maintenance.test');
  }
});
it('checks linked resource membership before reading subordinate history and comments', async () => {
  fetchMock = fakeSources();
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify(sourceRequest({ equipmentId: randomUUID() })), {
      status: 200,
    }),
  );
  const { body } = await request(app.getHttpServer())
    .get(`/equipment/${equipmentId}/service-requests/${refId}`)
    .set(headers())
    .expect(200);
  expect(body.status).toBe('NOT_FOUND');
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
it('keeps claim snapshot separate from current calendar coverage and forwards source actions', async () => {
  fetchMock = fakeSources();
  const { body } = await request(app.getHttpServer())
    .get(`/equipment/${equipmentId}/service-requests/${refId}`)
    .set(headers(customer))
    .expect(200);
  expect(body.data.warrantyCheck.result).toBe('IN_WARRANTY');
  expect(body.data.calendarCoverageNow.result).toBe('NO_WARRANTY');
  expect(body.data.request.allowedActions).toEqual(['edit', 'add-comment']);
  expect(body.data.estimates).toMatchObject({
    status: 'AVAILABLE',
    data: [{ revisionNo: 1, status: 'REJECTED' }],
  });
});
it('uses the Request PROCESSING status to explain responsibility after WO creation', async () => {
  fetchMock = fakeSources();
  fetchMock.mockImplementation(async (url) => {
    const target = new URL(String(url));
    return new Response(
      JSON.stringify(
        target.pathname === `/service-requests/${refId}`
          ? sourceRequest({ status: 'PROCESSING' })
          : [],
      ),
      { status: 200 },
    );
  });
  const { body } = await request(app.getHttpServer())
    .get(`/equipment/${equipmentId}/service-requests/${refId}`)
    .set(headers(customer))
    .expect(200);
  expect(body.data.request).toMatchObject({
    status: 'PROCESSING',
    waitingFor: 'WORK_ORDER_TEAM',
  });
});
it('requires a condition reason, validates specs and preserves original context after a move', async () => {
  await request(app.getHttpServer())
    .patch(`/equipment/${equipmentId}`)
    .set(headers())
    .send({ operationalStatus: 'OPERATIONAL' })
    .expect(400);
  await request(app.getHttpServer())
    .patch(`/equipment/${equipmentId}`)
    .set(headers())
    .send({ technicalSpecifications: { nested: {} } })
    .expect(400);
  const previous = await db.equipmentHistory.findFirstOrThrow({
    where: { tenantId, equipmentId, eventType: 'REGISTERED' },
  });
  const nextSite = randomUUID();
  await db.equipment.update({
    where: { id: equipmentId },
    data: { customerSiteId: nextSite },
  });
  const { body } = await request(app.getHttpServer())
    .get(`/equipment-history/${previous.id}`)
    .set(headers())
    .expect(200);
  expect(body.context.customerSiteId).toBe(siteId);
  expect(body.actorRoles).toContain('SERVICE_MANAGER');
  expect(body.completeness).toBe('CAPTURED');
  await request(app.getHttpServer())
    .get(`/equipment-history/${previous.id}`)
    .set(headers(foreign))
    .expect(404);
  await db.equipment.update({
    where: { id: equipmentId },
    data: { customerSiteId: siteId },
  });
});
it('records model history, warranty creation/void snapshots, and redacts legacy private metadata', async () => {
  await request(app.getHttpServer())
    .patch(`/equipment-models/${modelId}`)
    .set(headers())
    .send({ name: 'Updated pump' })
    .expect(200);
  const models = await request(app.getHttpServer())
    .get(`/equipment-models/${modelId}/history`)
    .set(headers())
    .expect(200);
  expect(models.body.history.total).toBe(2);
  expect(models.body.history.items[0].changes.name).toEqual({
    before: 'Pump',
    after: 'Updated pump',
  });
  const warranty = await request(app.getHttpServer())
    .post(`/equipment/${equipmentId}/warranties`)
    .set(headers())
    .send({
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      warrantyType: 'STANDARD',
      terms: 'Parts covered',
    })
    .expect(201);
  await request(app.getHttpServer())
    .post(`/warranties/${warranty.body.id}/void`)
    .set(headers())
    .send({
      reason: 'Private reason',
      customerNote: 'Replaced by new coverage',
    })
    .expect(200);
  await db.equipmentHistory.create({
    data: {
      tenantId,
      equipmentId,
      eventType: 'WARRANTY_VOIDED',
      referenceType: 'WARRANTY',
      referenceId: warranty.body.id,
      metadata: { reason: 'Old private reason' },
    },
  });
  const feed = await request(app.getHttpServer())
    .get(`/warranties/${warranty.body.id}/history`)
    .set(headers(customer))
    .expect(200);
  expect(feed.body.history.total).toBe(3);
  expect(JSON.stringify(feed.body)).not.toContain('private reason');
  expect(
    feed.body.history.items.some(
      (row: { completeness: string }) => row.completeness === 'LEGACY_SUMMARY',
    ),
  ).toBe(true);
});

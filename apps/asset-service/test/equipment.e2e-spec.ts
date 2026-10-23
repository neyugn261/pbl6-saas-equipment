import { randomUUID } from 'node:crypto';
import { INestApplication, Logger, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { signTestAccessToken } from '@pbl6/testing';
import { configureApp, UpstreamError, UpstreamUnavailableError } from '@pbl6/service-kit';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { EquipmentModelRepository } from '../src/equipment-models/equipment-model.repository';
import { EquipmentRepository } from '../src/equipment/equipment.repository';
import { ORGANIZATION_CLIENT } from '../src/organization/organization-client';
import { PrismaService } from '../src/prisma/prisma.service';
import { FakeOrganizationClient } from './support/fake-organization-client';

const tenantA = '00000000-0000-4000-8000-000000000001';
const tenantB = '00000000-0000-4000-8000-000000000002';
const customerA = '00000000-0000-4000-8000-000000000101';
const customerB = '00000000-0000-4000-8000-000000000102';
const siteA = '00000000-0000-4000-8000-000000000201';
const siteB = '00000000-0000-4000-8000-000000000202';
const locationA = '00000000-0000-4000-8000-000000000301';
const modelA = '00000000-0000-4000-8000-000000000401';
const equipmentId = '00000000-0000-4000-8000-000000000501';
const staff = signTestAccessToken({ role: 'SERVICE_MANAGER', tenantId: tenantA });
const staffB = signTestAccessToken({ role: 'SERVICE_MANAGER', tenantId: tenantB });
const dispatcher = signTestAccessToken({ role: 'DISPATCHER', tenantId: tenantA });
const customer = signTestAccessToken({ role: 'CUSTOMER_USER', tenantId: tenantA, customerId: customerA });
const otherCustomer = signTestAccessToken({ role: 'CUSTOMER_USER', tenantId: tenantA, customerId: customerB });
const now = new Date('2026-10-21T00:00:00.000Z');
const equipmentRow = (overrides: Record<string, unknown> = {}) => ({
  id: equipmentId, tenantId: tenantA, modelId: modelA, customerId: customerA,
  customerSiteId: siteA, locationId: locationA, assetCode: 'P-01', serialNumber: 'S-01',
  installationDate: null, handoverDate: null, status: 'ACTIVE', createdAt: now, updatedAt: now,
  ...overrides,
});
const modelRow = (overrides: Record<string, unknown> = {}) => ({
  id: modelA, tenantId: tenantA, manufacturer: 'Acme', modelCode: 'P', name: 'Pump',
  category: null, description: null, status: 'ACTIVE', createdAt: now, updatedAt: now,
  ...overrides,
});

describe('equipment HTTP contract (e2e)', () => {
  let app: INestApplication<App>;
  const organization = new FakeOrganizationClient();
  const models = { findScoped: jest.fn() };
  const repository = {
    list: jest.fn(), findScoped: jest.fn(), findDetail: jest.fn(), warrantyAt: jest.fn(),
    createWithHistory: jest.fn(), patchWithHistory: jest.fn(), history: jest.fn(),
  };
  const fakePrisma = { $connect: async () => undefined, $disconnect: async () => undefined,
    $queryRawUnsafe: async () => [{ '?column?': 1 }] };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService).useValue(fakePrisma)
      .overrideProvider(EquipmentModelRepository).useValue(models)
      .overrideProvider(EquipmentRepository).useValue(repository)
      .overrideProvider(ORGANIZATION_CLIENT).useValue(organization)
      .compile();
    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app, { logger: new Logger('e2e') });
    await app.init();
  });
  afterAll(async () => app.close());
  beforeEach(() => {
    jest.resetAllMocks();
    organization.customers.clear(); organization.sites.clear();
    organization.customers.set(customerA, { id: customerA, code: 'C-A', name: 'Customer A', status: 'ACTIVE' });
    organization.sites.set(`${customerA}:${siteA}`, { customerId: customerA, siteId: siteA,
      siteStatus: 'ACTIVE', locationId: locationA, defaultServicingBranchId: null });
    organization.sites.set(`${customerA}:${siteB}`, { customerId: customerA, siteId: siteB,
      siteStatus: 'ACTIVE', locationId: null, defaultServicingBranchId: null });
    models.findScoped.mockImplementation(async (tenantId: string, id: string) =>
      tenantId === tenantA && id === modelA ? modelRow() : null);
    repository.findScoped.mockImplementation(async (scope: {tenantId: string; customerId: string | null}, id: string) =>
      scope.tenantId === tenantA && id === equipmentId && (scope.customerId === null || scope.customerId === customerA)
        ? equipmentRow() : null);
    repository.findDetail.mockImplementation(async (scope: {tenantId: string; customerId: string | null}, id: string) =>
      scope.tenantId === tenantA && id === equipmentId && (scope.customerId === null || scope.customerId === customerA)
        ? { ...equipmentRow(), model: modelRow(), qrCodes: [] } : null);
    repository.list.mockImplementation(async (scope: {tenantId: string; customerId: string | null}) => ({
      rows: scope.tenantId === tenantA && scope.customerId !== customerB ? [equipmentRow()] : [],
      total: scope.tenantId === tenantA && scope.customerId !== customerB ? 1 : 0,
    }));
    repository.warrantyAt.mockResolvedValue(null);
    repository.createWithHistory.mockImplementation(async (_tenantId: string, _actorId: string, input: Record<string, unknown>) => equipmentRow(input));
    repository.patchWithHistory.mockImplementation(async (_scope: object, _id: string, _actorId: string, input: Record<string, unknown>) => equipmentRow(input));
    repository.history.mockImplementation(async (scope: {tenantId: string; customerId: string | null}) => {
      if (scope.tenantId !== tenantA || (scope.customerId !== null && scope.customerId !== customerA)) {
        throw new NotFoundException({ code: 'EQUIPMENT_NOT_FOUND', message: 'Equipment not found' });
      }
      return { rows: [{ id: randomUUID(), tenantId: tenantA,
      equipmentId, eventType: 'REGISTERED', referenceType: null, referenceId: null,
      description: null, metadata: null, sourceEventId: null, createdBy: randomUUID(),
      occurredAt: now, createdAt: now }], total: 1 };
    });
  });

  const input = { modelId: modelA, customerId: customerA, customerSiteId: siteA,
    locationId: locationA, assetCode: 'P-01', serialNumber: 'S-01' };

  it('registers for a same-tenant customer and rejects invalid references before writing', async () => {
    const created = await request(app.getHttpServer()).post('/equipment')
      .set('authorization', `Bearer ${staff}`).send(input).expect(201);
    expect(created.body).toMatchObject({ ...input, status: 'ACTIVE', installationDate: null });
    expect(repository.createWithHistory).toHaveBeenCalledWith(tenantA, expect.any(String), expect.objectContaining(input));
    for (const [payload, code] of [
      [{ ...input, modelId: randomUUID() }, 'MODEL_NOT_FOUND'],
      [{ ...input, customerId: randomUUID() }, 'CUSTOMER_NOT_FOUND'],
      [{ ...input, customerSiteId: randomUUID() }, 'SITE_NOT_OF_CUSTOMER'],
      [{ ...input, locationId: randomUUID() }, 'LOCATION_NOT_IN_SITE'],
    ] as const) {
      const res = await request(app.getHttpServer()).post('/equipment')
        .set('authorization', `Bearer ${staff}`).send(payload).expect(422);
      expect(res.body.code).toBe(code);
    }
    models.findScoped.mockResolvedValueOnce(modelRow({ status: 'INACTIVE' }));
    const inactive = await request(app.getHttpServer()).post('/equipment')
      .set('authorization', `Bearer ${staff}`).send(input).expect(422);
    expect(inactive.body.code).toBe('MODEL_INACTIVE');
    expect(repository.createWithHistory).toHaveBeenCalledTimes(1);
  });

  it('uses Organization existence/ownership without adding an undocumented customer/site status rule', async () => {
    organization.customers.set(customerA, { id: customerA, code: 'C-A', name: 'Customer A', status: 'INACTIVE' });
    organization.sites.set(`${customerA}:${siteA}`, { customerId: customerA, siteId: siteA,
      siteStatus: 'INACTIVE', locationId: locationA, defaultServicingBranchId: null });
    await request(app.getHttpServer()).post('/equipment')
      .set('authorization', `Bearer ${staff}`).send(input).expect(201);
  });

  it('enforces DTOs, auth, permission and upstream failure without a write', async () => {
    for (const payload of [{ ...input, tenantId: tenantB }, { ...input, assetCode: 'x'.repeat(101) },
      { ...input, installationDate: '2026-02-30' }, { ...input, locationId: null },
      { ...input, handoverDate: null }]) {
      await request(app.getHttpServer()).post('/equipment').set('authorization', `Bearer ${staff}`)
        .send(payload).expect(400);
    }
    await request(app.getHttpServer()).post('/equipment').send(input).expect(401);
    await request(app.getHttpServer()).post('/equipment').set('authorization', `Bearer ${customer}`).send(input).expect(403);
    await request(app.getHttpServer()).post('/equipment').set('authorization', `Bearer ${dispatcher}`).send(input).expect(403);
    const upstream = jest.spyOn(organization, 'getCustomer')
      .mockRejectedValueOnce(new UpstreamUnavailableError('organization-service', new Error('ECONNREFUSED')))
      .mockRejectedValueOnce(new UpstreamError('organization-service', 500, 'INTERNAL_ERROR', {}));
    await request(app.getHttpServer()).post('/equipment').set('authorization', `Bearer ${staff}`).send(input).expect(503);
    await request(app.getHttpServer()).post('/equipment').set('authorization', `Bearer ${staff}`).send(input).expect(502);
    expect(repository.createWithHistory).not.toHaveBeenCalled();
    upstream.mockRestore();
  });

  it('maps database uniqueness conflicts to 409 for asset code and serial within a model', async () => {
    for (const duplicate of ['assetCode', 'serialNumber']) {
      repository.createWithHistory.mockRejectedValueOnce(Object.assign(new Error(duplicate), {
        name: 'PrismaClientKnownRequestError', code: 'P2002',
      }));
      const res = await request(app.getHttpServer()).post('/equipment')
        .set('authorization', `Bearer ${staff}`).send(input).expect(409);
      expect(res.body.code).toBe('UNIQUE_VIOLATION');
    }
  });

  it('scopes list, detail, internal reference and history to tenant and token customer', async () => {
    const own = await request(app.getHttpServer()).get(`/equipment/${equipmentId}`)
      .set('authorization', `Bearer ${customer}`).expect(200);
    expect(own.body).toMatchObject({ id: equipmentId, hasActiveQr: false,
      warranty: { result: 'NO_WARRANTY', warrantyId: null, endDate: null } });
    const ref = await request(app.getHttpServer()).get(`/internal/equipment/${equipmentId}`)
      .set('authorization', `Bearer ${customer}`).expect(200);
    expect(Object.keys(ref.body).sort()).toEqual(['assetCode', 'customerId', 'customerSiteId', 'id', 'locationId', 'status']);
    const history = await request(app.getHttpServer()).get(`/equipment/${equipmentId}/history?page=1&pageSize=5`)
      .set('authorization', `Bearer ${customer}`).expect(200);
    expect(history.body.items[0]).toMatchObject({ eventType: 'REGISTERED', equipmentId });
    expect(repository.history).toHaveBeenCalledWith({ tenantId: tenantA, customerId: customerA }, equipmentId, 1, 5);
    await request(app.getHttpServer()).get('/equipment?customerId='+customerB)
      .set('authorization', `Bearer ${customer}`).expect(200);
    expect(repository.list).toHaveBeenCalledWith({ tenantId: tenantA, customerId: customerA }, expect.objectContaining({ customerId: customerB }));
    for (const token of [staffB, otherCustomer]) {
      for (const path of [`/equipment/${equipmentId}`, `/internal/equipment/${equipmentId}`, `/equipment/${equipmentId}/history`]) {
        await request(app.getHttpServer()).get(path).set('authorization', `Bearer ${token}`).expect(404);
      }
    }
    await request(app.getHttpServer()).get('/equipment').set('authorization', `Bearer ${staffB}`)
      .expect(200, { items: [], page: 1, pageSize: 20, total: 0 });
  });

  it('validates patch site/location, disallows field changes after retirement and scopes writes', async () => {
    await request(app.getHttpServer()).patch(`/equipment/${equipmentId}`)
      .set('authorization', `Bearer ${staff}`).send({ customerSiteId: siteB }).expect(200);
    expect(repository.patchWithHistory).toHaveBeenCalledWith(
      { tenantId: tenantA, customerId: null }, equipmentId, expect.any(String), { customerSiteId: siteB });
    const badLocation = await request(app.getHttpServer()).patch(`/equipment/${equipmentId}`)
      .set('authorization', `Bearer ${staff}`).send({ customerSiteId: siteB, locationId: locationA }).expect(422);
    expect(badLocation.body.code).toBe('LOCATION_NOT_IN_SITE');
    const badSite = await request(app.getHttpServer()).patch(`/equipment/${equipmentId}`)
      .set('authorization', `Bearer ${staff}`).send({ customerSiteId: randomUUID() }).expect(422);
    expect(badSite.body.code).toBe('SITE_NOT_OF_CUSTOMER');
    for (const invalid of [{}, { customerId: customerB }, { modelId: modelA },
      { serialNumber: 'changed' }, { status: null }, { customerSiteId: null }]) {
      await request(app.getHttpServer()).patch(`/equipment/${equipmentId}`)
        .set('authorization', `Bearer ${staff}`).send(invalid).expect(400);
    }
    await request(app.getHttpServer()).patch(`/equipment/${equipmentId}`)
      .set('authorization', `Bearer ${customer}`).send({ status: 'RETIRED' }).expect(403);
    await request(app.getHttpServer()).patch(`/equipment/${equipmentId}`)
      .set('authorization', `Bearer ${staffB}`).send({ status: 'RETIRED' }).expect(404);
    repository.findScoped.mockResolvedValueOnce(equipmentRow({ status: 'RETIRED' }));
    const retired = await request(app.getHttpServer()).patch(`/equipment/${equipmentId}`)
      .set('authorization', `Bearer ${staff}`).send({ status: 'ACTIVE' }).expect(409);
    expect(retired.body.code).toBe('EQUIPMENT_RETIRED');
  });

  it('validates list filters and exposes true local warranty state in detail', async () => {
    await request(app.getHttpServer()).get('/equipment?pageSize=101')
      .set('authorization', `Bearer ${staff}`).expect(400);
    await request(app.getHttpServer()).get('/equipment?tenantId='+tenantB)
      .set('authorization', `Bearer ${staff}`).expect(400);
    await request(app.getHttpServer()).get('/equipment?warranty=IN_WARRANTY&sort=assetCode&q=pump')
      .set('authorization', `Bearer ${staff}`).expect(200);
    expect(repository.list).toHaveBeenCalledWith({ tenantId: tenantA, customerId: null },
      expect.objectContaining({ warranty: 'IN_WARRANTY', sort: 'assetCode', q: 'pump' }));
    repository.warrantyAt.mockResolvedValueOnce({ id: randomUUID(), startDate: new Date('1900-01-01'), endDate: new Date('2999-12-31') });
    const res = await request(app.getHttpServer()).get(`/equipment/${equipmentId}`)
      .set('authorization', `Bearer ${staff}`).expect(200);
    expect(res.body.warranty).toMatchObject({ result: 'IN_WARRANTY', endDate: '2999-12-31' });
    repository.warrantyAt.mockResolvedValueOnce({ id: randomUUID(), startDate: new Date('1900-01-01'), endDate: new Date('1901-01-31') });
    const ended = await request(app.getHttpServer()).get(`/equipment/${equipmentId}`)
      .set('authorization', `Bearer ${staff}`).expect(200);
    expect(ended.body.warranty).toMatchObject({ result: 'OUT_OF_WARRANTY', endDate: '1901-01-31' });
  });
});

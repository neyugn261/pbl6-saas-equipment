import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { Logger, type INestApplication } from '@nestjs/common';
import { configureApp } from '@pbl6/service-kit';
import {
  requireTestDatabaseUrl,
  signTestAccessToken,
  testJwtEnv,
} from '@pbl6/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { ORGANIZATION_CLIENT } from '../src/organization/organization-client';
import { AppModule as MaintenanceModule } from '../../maintenance-service/src/app.module';
import { PrismaService as MaintenanceDb } from '../../maintenance-service/src/prisma/prisma.service';

describe('Equipment registration — real Asset/Maintenance HTTP and dedicated PostgreSQL databases', () => {
  let app: INestApplication,
    maintenance: INestApplication,
    db: PrismaService,
    plans: MaintenanceDb;
  let assetUrl: string, maintenanceUrl: string, modelId: string;
  const tenantId = randomUUID(),
    customerId = randomUUID(),
    siteId = randomUUID(),
    userId = randomUUID();
  const headers = (role = 'SERVICE_MANAGER', tenant = tenantId) => ({
    authorization: `Bearer ${signTestAccessToken({ role: role as 'SERVICE_MANAGER', tenantId: tenant, userId })}`,
  });
  const config = (extra: object) =>
    new ConfigService({
      ...process.env,
      ...testJwtEnv(),
      NODE_ENV: 'test',
      RABBITMQ_URL: '',
      MAINTENANCE_SCHEDULER_ENABLED: 'false',
      ...extra,
    });
  const warranty = {
    mode: 'CREATE',
    startDate: '2026-01-01',
    endDate: '2026-12-31',
    warrantyType: 'STANDARD',
    terms: 'Public terms',
  };
  const maintenanceChoice = {
    mode: 'CREATE',
    name: 'Quarterly inspection',
    frequencyUnit: 'MONTH',
    frequencyValue: 3,
    nextDueDate: '2027-01-01',
  };
  const input = (extra: object = {}) => ({
    equipment: {
      mode: 'NEW',
      data: {
        modelId,
        customerId,
        customerSiteId: siteId,
        assetCode: randomUUID(),
        serialNumber: randomUUID(),
        handoverDate: '2026-01-01',
      },
    },
    warranty,
    maintenance: maintenanceChoice,
    ...extra,
  });
  const create = (
    body: object = input(),
    key = randomUUID(),
    role = 'SERVICE_MANAGER',
  ) =>
    request(app.getHttpServer())
      .post('/equipment-registrations')
      .set(headers(role))
      .set('Idempotency-Key', key)
      .send(body);
  const submit = (id: string, version = 1) =>
    request(app.getHttpServer())
      .post(`/equipment-registrations/${id}/submit`)
      .set(headers())
      .send({ expectedVersion: version });
  beforeAll(async () => {
    const assetTest = requireTestDatabaseUrl('ASSET_TEST_DATABASE_URL');
    const maintenanceTest = requireTestDatabaseUrl(
      'MAINTENANCE_TEST_DATABASE_URL',
    );
    execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
      cwd: resolve('../maintenance-service'),
      env: { ...process.env, MAINTENANCE_DATABASE_URL: maintenanceTest },
      stdio: 'pipe',
    });
    const mc = config({
      MAINTENANCE_DATABASE_URL: maintenanceTest,
      ASSET_SERVICE_URL: 'http://placeholder.test',
    });
    const ac = config({
      ASSET_DATABASE_URL: assetTest,
      MAINTENANCE_SERVICE_URL: 'http://placeholder.test',
    });
    const org = {
      getCustomer: async (id: string) =>
        id === customerId ? { id, status: 'ACTIVE' } : null,
      getSite: async (c: string, s: string) =>
        c === customerId && s === siteId
          ? { customerId: c, siteId: s, siteStatus: 'ACTIVE', locationId: null }
          : null,
    };
    const am = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ConfigService)
      .useValue(ac)
      .overrideProvider(ORGANIZATION_CLIENT)
      .useValue(org)
      .compile();
    app = am.createNestApplication({ logger: false });
    configureApp(app, { logger: new Logger('registration-test') });
    await app.listen(0, '127.0.0.1');
    assetUrl = await app.getUrl();
    mc.set('ASSET_SERVICE_URL', assetUrl);
    const mm = await Test.createTestingModule({ imports: [MaintenanceModule] })
      .overrideProvider(ConfigService)
      .useValue(mc)
      .compile();
    maintenance = mm.createNestApplication({ logger: false });
    configureApp(maintenance, {
      logger: new Logger('registration-maintenance-test'),
    });
    await maintenance.listen(0, '127.0.0.1');
    maintenanceUrl = await maintenance.getUrl();
    ac.set('MAINTENANCE_SERVICE_URL', maintenanceUrl);
    db = app.get(PrismaService);
    plans = maintenance.get(MaintenanceDb);
    const [a] = await db.$queryRawUnsafe<{ name: string }[]>(
      'SELECT current_database() AS name',
    );
    const [m] = await plans.$queryRawUnsafe<{ name: string }[]>(
      'SELECT current_database() AS name',
    );
    expect(a.name).toBe('asset_test_db');
    expect(m.name).toBe('maintenance_test_db');
    modelId = (
      await db.equipmentModel.create({
        data: {
          tenantId,
          manufacturer: 'Registration test',
          modelCode: randomUUID(),
          name: 'Pump',
        },
      })
    ).id;
  }, 30000);
  afterAll(async () => {
    jest.restoreAllMocks();
    if (db && plans) {
      await plans.maintenanceHistory.deleteMany({ where: { tenantId } });
      await plans.maintenancePlan.deleteMany({ where: { tenantId } });
      await plans.equipmentSnapshot.deleteMany({ where: { tenantId } });
      await db.equipmentRegistration.deleteMany({ where: { tenantId } });
      await db.equipmentHistory.deleteMany({ where: { tenantId } });
      await db.warranty.deleteMany({ where: { tenantId } });
      await db.equipment.deleteMany({ where: { tenantId } });
      await db.equipmentModel.deleteMany({ where: { tenantId } });
    }
    await maintenance?.close();
    await app?.close();
  });
  it('creates a draft, then atomically applies warranty and creates one Plan via real reverse HTTP', async () => {
    const draft = await create().expect(201);
    expect(draft.body).toMatchObject({
      status: 'DRAFT',
      warrantyId: null,
      maintenancePlanId: null,
      version: 1,
    });
    expect(
      await db.warranty.count({
        where: { equipmentId: draft.body.equipmentId },
      }),
    ).toBe(0);
    const result = await submit(draft.body.id).expect(200);
    expect(result.body.status).toBe('COMPLETED');
    expect(result.body.warrantyId).toBeTruthy();
    expect(result.body.maintenancePlanId).toBeTruthy();
    const plan = await plans.maintenancePlan.findUniqueOrThrow({
      where: { id: result.body.maintenancePlanId },
    });
    expect(plan).toMatchObject({
      tenantId,
      equipmentId: draft.body.equipmentId,
      setupRegistrationId: draft.body.id,
      frequencyValue: 3,
    });
    expect(plan.anchorDate.toISOString().slice(0, 10)).toBe('2027-01-01');
  });
  it('replays the original create key without restoring an obsolete draft', async () => {
    const body = input(),
      key = randomUUID();
    const a = await create(body, key).expect(201);
    await submit(a.body.id).expect(200);
    const b = await create(body, key).expect(201);
    expect(b.body.id).toBe(a.body.id);
    expect(b.body.status).toBe('COMPLETED');
    await create(
      { ...body, warranty: { mode: 'NONE', reason: 'Different request' } },
      key,
    ).expect(409);
  });
  it('serializes concurrent identical POSTs and versioned submits', async () => {
    const body = input(),
      key = randomUUID();
    const [a, b] = await Promise.all([create(body, key), create(body, key)]);
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(a.body.id).toBe(b.body.id);
    const results = await Promise.all([submit(a.body.id), submit(a.body.id)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(
      await db.warranty.count({ where: { equipmentId: a.body.equipmentId } }),
    ).toBe(1);
    expect(
      await plans.maintenancePlan.count({
        where: { setupRegistrationId: a.body.id },
      }),
    ).toBe(1);
  });
  it('survives loss of Maintenance response after its commit, and freezes pending input', async () => {
    const draft = await create().expect(201);
    const realFetch = globalThis.fetch;
    let dropped = false;
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (url, options) => {
        const response = await realFetch(url, options);
        if (
          !dropped &&
          String(url).startsWith(maintenanceUrl) &&
          options?.method === 'PUT'
        ) {
          dropped = true;
          throw new TypeError('Simulated response loss after commit');
        }
        return response;
      });
    const pending = await submit(draft.body.id).expect(202);
    expect(pending.body.status).toBe('PENDING_MAINTENANCE');
    expect(
      await plans.maintenancePlan.count({
        where: { setupRegistrationId: draft.body.id },
      }),
    ).toBe(1);
    fetchSpy.mockRestore();
    await request(app.getHttpServer())
      .patch(`/equipment-registrations/${draft.body.id}`)
      .set(headers())
      .send({
        expectedVersion: pending.body.version,
        maintenance: {
          mode: 'NONE',
          reason: 'Must not change ambiguous input',
        },
      })
      .expect(409);
    const results = await Promise.all(
      [1, 2].map(() =>
        request(app.getHttpServer())
          .post(`/equipment-registrations/${draft.body.id}/resume`)
          .set(headers()),
      ),
    );
    expect(results.map((r) => r.status)).toEqual([200, 200]);
    expect(results[0].body.maintenancePlanId).toBe(
      results[1].body.maintenancePlanId,
    );
    expect(
      await plans.maintenancePlan.count({
        where: { setupRegistrationId: draft.body.id },
      }),
    ).toBe(1);
    expect(
      await db.equipmentHistory.count({
        where: {
          equipmentId: draft.body.equipmentId,
          eventType: 'SERVICE_SETUP_COMPLETED',
        },
      }),
    ).toBe(1);
  });
  it('does not reset a Plan after completion and later schedule edits', async () => {
    const draft = await create().expect(201),
      completed = await submit(draft.body.id).expect(200);
    await plans.maintenancePlan.update({
      where: { id: completed.body.maintenancePlanId },
      data: { name: 'Edited by manager', status: 'INACTIVE' },
    });
    const replay = await request(maintenance.getHttpServer())
      .put(
        `/internal/equipment-registrations/${draft.body.id}/maintenance-plan`,
      )
      .set(headers())
      .expect(200);
    expect(replay.body.replay).toBe(true);
    expect(
      await plans.maintenancePlan.findUniqueOrThrow({
        where: { id: completed.body.maintenancePlanId },
      }),
    ).toMatchObject({ name: 'Edited by manager', status: 'INACTIVE' });
  });
  it('allows explicit NONE, keeps unknown drafts incomplete and rejects unknown nested fields', async () => {
    const draft = await create(
      input({
        warranty: { mode: 'UNCONFIRMED' },
        maintenance: { mode: 'UNCONFIRMED' },
      }),
    ).expect(201);
    await submit(draft.body.id).expect(400);
    const patch = await request(app.getHttpServer())
      .patch(`/equipment-registrations/${draft.body.id}`)
      .set(headers())
      .send({
        expectedVersion: 1,
        warranty: { mode: 'NONE', reason: 'No warranty agreed' },
        maintenance: { mode: 'NONE', reason: 'On demand service' },
      })
      .expect(200);
    const complete = await submit(draft.body.id, patch.body.version).expect(
      200,
    );
    expect(complete.body).toMatchObject({
      status: 'COMPLETED',
      warrantyId: null,
      maintenancePlanId: null,
    });
    await create(input({ warranty: { mode: 'NONE', reason: '   ' } })).expect(
      400,
    );
    await create(
      input({ maintenance: { ...maintenanceChoice, tenantId: randomUUID() } }),
    ).expect(400);
  });
  it('validates schedule boundaries before creating a frozen request', async () => {
    for (const schedule of [
      { nextDueDate: '9999-12-31', frequencyUnit: 'DAY', frequencyValue: 1 },
      { nextDueDate: '9999-12-01', frequencyUnit: 'MONTH', frequencyValue: 1 },
      { nextDueDate: '0000-01-01', frequencyUnit: 'YEAR', frequencyValue: 1 },
    ])
      await create(
        input({ maintenance: { ...maintenanceChoice, ...schedule } }),
      ).expect(400);
    await create(
      input({
        maintenance: {
          ...maintenanceChoice,
          nextDueDate: '9999-11-01',
          frequencyUnit: 'MONTH',
          frequencyValue: 1,
        },
      }),
    ).expect(201);
  });
  it('enforces Tenant Admin and customer permissions and hides foreign tenant registrations', async () => {
    await create(input(), randomUUID(), 'TENANT_ADMIN').expect(403);
    const draft = await create(
      input({ maintenance: { mode: 'UNCONFIRMED' } }),
      randomUUID(),
      'TENANT_ADMIN',
    ).expect(201);
    await request(app.getHttpServer())
      .post(`/equipment-registrations/${draft.body.id}/submit`)
      .set(headers('TENANT_ADMIN'))
      .send({ expectedVersion: 1 })
      .expect(403);
    await request(app.getHttpServer())
      .get(`/equipment-registrations/${draft.body.id}`)
      .set(headers('SERVICE_MANAGER', randomUUID()))
      .expect(404);
    await request(app.getHttpServer())
      .get('/equipment-registrations')
      .set(
        'authorization',
        `Bearer ${signTestAccessToken({ role: 'CUSTOMER_ADMIN', tenantId, customerId })}`,
      )
      .expect(403);
    await request(maintenance.getHttpServer())
      .put(
        `/internal/equipment-registrations/${draft.body.id}/maintenance-plan`,
      )
      .set(headers('TENANT_ADMIN'))
      .expect(403);
  });
  it('keeps setup progress and audit references out of every customer history surface', async () => {
    const draft = await create(
      input({
        warranty: { mode: 'UNCONFIRMED' },
        maintenance: { mode: 'UNCONFIRMED' },
      }),
    ).expect(201);
    const customerHeaders = {
      authorization: `Bearer ${signTestAccessToken({ role: 'CUSTOMER_ADMIN', tenantId, customerId })}`,
    };
    const audit = await db.equipmentHistory.findFirstOrThrow({
      where: {
        referenceType: 'EQUIPMENT_REGISTRATION',
        referenceId: draft.body.id,
      },
    });
    const detail = await request(app.getHttpServer())
      .get(`/equipment/${draft.body.equipmentId}`)
      .set(customerHeaders)
      .expect(200);
    expect(detail.body).not.toHaveProperty('registrationId');
    expect(detail.body).not.toHaveProperty('registrationStatus');
    await request(app.getHttpServer())
      .get('/equipment?registrationStatus=DRAFT')
      .set(customerHeaders)
      .expect(403);
    const equipmentList = await request(app.getHttpServer())
      .get('/equipment')
      .set(customerHeaders)
      .expect(200);
    expect(
      equipmentList.body.items.some(
        (row: Record<string, unknown>) =>
          'registrationId' in row || 'registrationStatus' in row,
      ),
    ).toBe(false);
    for (const path of [
      `/equipment/${draft.body.equipmentId}/history`,
      `/equipment/${draft.body.equipmentId}/timeline`,
      `/equipment-history?equipmentId=${draft.body.equipmentId}`,
    ]) {
      const result = await request(app.getHttpServer())
        .get(path)
        .set(customerHeaders)
        .expect(200);
      expect(
        result.body.items.some(
          (row: { eventType: string }) => row.eventType === 'REGISTERED',
        ),
      ).toBe(true);
      expect(JSON.stringify(result.body)).not.toContain(draft.body.id);
      expect(
        result.body.items.some(
          (row: { referenceType: string }) =>
            row.referenceType === 'EQUIPMENT_REGISTRATION',
        ),
      ).toBe(false);
    }
    await request(app.getHttpServer())
      .get(`/equipment-history/${audit.id}`)
      .set(customerHeaders)
      .expect(404);
    await request(app.getHttpServer())
      .get(`/equipment-history/${audit.id}`)
      .set(headers())
      .expect(200);
  });
  it('keeps existing warranty and Plan without changing their dates or paused status', async () => {
    const eq = await db.equipment.create({
      data: {
        tenantId,
        modelId,
        customerId,
        customerSiteId: siteId,
        assetCode: randomUUID(),
        serialNumber: randomUUID(),
        handoverDate: new Date('2025-01-01'),
      },
    });
    const w = await db.warranty.create({
      data: {
        tenantId,
        equipmentId: eq.id,
        startDate: new Date('2025-01-01'),
        endDate: new Date('2025-12-31'),
        warrantyType: 'STANDARD',
      },
    });
    const plan = await plans.maintenancePlan.create({
      data: {
        tenantId,
        equipmentId: eq.id,
        customerId,
        customerSiteId: siteId,
        anchorDate: new Date('2027-01-31'),
        nextDueDate: new Date('2027-01-31'),
        name: 'Existing',
        frequencyUnit: 'MONTH',
        frequencyValue: 3,
        status: 'PAUSED',
      },
    });
    const d = await create({
      equipment: { mode: 'EXISTING', id: eq.id },
      warranty: { mode: 'KEEP', warrantyId: w.id },
      maintenance: { mode: 'KEEP', planId: plan.id },
    }).expect(201);
    const c = await submit(d.body.id).expect(200);
    expect(c.body.warrantyId).toBe(w.id);
    expect(c.body.maintenancePlanId).toBe(plan.id);
    expect(
      await plans.maintenancePlan.findUniqueOrThrow({ where: { id: plan.id } }),
    ).toMatchObject({ status: 'PAUSED', nextDueDate: new Date('2027-01-31') });
    const customerHeaders = {
      authorization: `Bearer ${signTestAccessToken({ role: 'CUSTOMER_ADMIN', tenantId, customerId })}`,
    };
    for (const path of [
      `/maintenance-plans/${plan.id}/history`,
      `/maintenance-history?planId=${plan.id}&eventType=INITIAL_SETUP_LINKED`,
    ]) {
      const feed = await request(maintenance.getHttpServer())
        .get(path)
        .set(customerHeaders)
        .expect(200);
      expect(feed.body.total).toBe(0);
      expect(JSON.stringify(feed.body)).not.toContain(d.body.id);
    }
    const staffFeed = await request(maintenance.getHttpServer())
      .get(`/maintenance-plans/${plan.id}/history`)
      .set(headers())
      .expect(200);
    expect(
      staffFeed.body.items.some(
        (row: { eventType: string }) =>
          row.eventType === 'INITIAL_SETUP_LINKED',
      ),
    ).toBe(true);
  });
  it('rolls back Warranty/phase together when overlap is detected', async () => {
    const d = await create().expect(201);
    await db.warranty.create({
      data: {
        tenantId,
        equipmentId: d.body.equipmentId,
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-12-31'),
        warrantyType: 'STANDARD',
      },
    });
    const result = await submit(d.body.id).expect(409);
    expect(result.body.code).toBe('WARRANTY_OVERLAP');
    expect(
      await db.equipmentRegistration.findUniqueOrThrow({
        where: { id: d.body.id },
      }),
    ).toMatchObject({ status: 'DRAFT', warrantyId: null, submittedAt: null });
    expect(
      await plans.maintenancePlan.count({
        where: { setupRegistrationId: d.body.id },
      }),
    ).toBe(0);
  });
  it('protects DB phase constraints and local tenant/equipment Warranty references', async () => {
    const d = await create().expect(201);
    await expect(
      db.$executeRawUnsafe(
        "UPDATE equipment_registrations SET status='COMPLETED' WHERE id=$1::uuid",
        d.body.id,
      ),
    ).rejects.toThrow();
    await expect(
      db.$executeRawUnsafe(
        "UPDATE equipment_registrations SET warranty_decision='NONE' WHERE id=$1::uuid",
        d.body.id,
      ),
    ).rejects.toThrow();
    expect(
      (
        await db.equipmentRegistration.findUniqueOrThrow({
          where: { id: d.body.id },
        })
      ).status,
    ).toBe('DRAFT');
  });
});

import { randomUUID, randomBytes, createHmac } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { type INestApplication } from '@nestjs/common';
import { BranchAccessClient } from '@pbl6/auth';
import { fixtureBranchContext, signTestAccessToken } from '@pbl6/testing';
import { configureApp } from '@pbl6/service-kit';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { EventsService } from '../src/events/events.service';
import { RegistrationService } from '../src/registrations/registration.service';
import { ORGANIZATION_CLIENT } from '../src/organization/organization-client';
import { PublicQrTenantConsumer } from '../src/events/public-qr-tenant.consumer';

describe('Minh UX Asset — real HTTP and PostgreSQL; Organization is an explicit fixture', () => {
  const tenantId = randomUUID(),
    customerId = randomUUID(),
    siteId = randomUUID(),
    branchId = randomUUID(),
    actorId = randomUUID();
  const manager = signTestAccessToken({
    role: 'SERVICE_MANAGER',
    tenantId,
    userId: actorId,
  });
  const foreign = signTestAccessToken({
    role: 'SERVICE_MANAGER',
    tenantId: randomUUID(),
  });
  const otherBranchUser = randomUUID(),
    otherBranch = signTestAccessToken({
      role: 'SERVICE_MANAGER',
      tenantId,
      userId: otherBranchUser,
    });
  let app: INestApplication,
    db: PrismaService,
    modelId: string,
    equipmentId: string,
    token: string;
  const headers = (token = manager) => ({ authorization: `Bearer ${token}` });
  const batch = () => ({
    customerId,
    customerSiteId: siteId,
    deliveryMethod: 'CUSTOMER_SITE',
    defaultModelId: modelId,
    csv: `assetCode,serialNumber\n${randomUUID()},${randomUUID()}\n${randomUUID()},${randomUUID()}`,
  });
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EventsService)
      .useValue({})
      .overrideProvider(BranchAccessClient)
      .useValue({
        context: async (
          p: Parameters<ReturnType<typeof fixtureBranchContext>['context']>[0],
        ) =>
          fixtureBranchContext(
            p.userId === otherBranchUser ? randomUUID() : branchId,
          ).context(p),
      })
      .overrideProvider(ORGANIZATION_CLIENT)
      .useValue({
        getCustomer: async (id: string, p: { tenantId: string }) =>
          id === customerId && p.tenantId === tenantId
            ? { id, status: 'ACTIVE', code: 'TEST', name: 'Test customer' }
            : null,
        getSite: async (
          c: string,
          s: string,
          _l: unknown,
          p: { tenantId: string },
        ) =>
          c === customerId && s === siteId && p.tenantId === tenantId
            ? {
                customerId,
                siteId,
                siteStatus: 'ACTIVE',
                locationId: null,
                defaultServicingBranchId: branchId,
              }
            : null,
      })
      .compile();
    app = module.createNestApplication({ logger: false });
    configureApp(app);
    await app.init();
    db = app.get(PrismaService);
    modelId = (
      await db.equipmentModel.create({
        data: {
          tenantId,
          manufacturer: 'Test',
          modelCode: randomUUID(),
          name: 'Public model',
        },
      })
    ).id;
    equipmentId = (
      await db.equipment.create({
        data: {
          tenantId,
          modelId,
          customerId,
          customerSiteId: siteId,
          assetCode: randomUUID(),
          serialNumber: 'PRIVATE-SERIAL',
          displayName: 'PRIVATE-LOCATION-NAME',
        },
      })
    ).id;
    token = randomBytes(32).toString('base64url');
    await db.equipmentQrCode.create({ data: { tenantId, equipmentId, token } });
  });
  afterAll(async () => {
    await app?.close();
  });
  it('previews without writes and imports an atomic batch of drafts with replay', async () => {
    const input = batch(),
      key = randomUUID(),
      before = await db.equipment.count({ where: { tenantId } });
    const preview = await request(app.getHttpServer())
      .post('/bulk-handovers/preview')
      .set(headers())
      .send(input)
      .expect(201);
    expect(preview.body.valid).toBe(true);
    expect(await db.equipment.count({ where: { tenantId } })).toBe(before);
    const created = await request(app.getHttpServer())
      .post('/bulk-handovers')
      .set(headers())
      .set('Idempotency-Key', key)
      .send(input)
      .expect(201);
    expect(created.body.registrations).toHaveLength(2);
    expect(
      created.body.registrations.every(
        (r: { status: string }) => r.status === 'DRAFT',
      ),
    ).toBe(true);
    const replay = await request(app.getHttpServer())
      .post('/bulk-handovers')
      .set(headers())
      .set('Idempotency-Key', key)
      .send(input)
      .expect(201);
    expect(replay.body).toEqual(created.body);
    expect(await db.warranty.count({ where: { tenantId } })).toBe(0);
    await request(app.getHttpServer())
      .post('/bulk-handovers')
      .set(headers())
      .set('Idempotency-Key', key)
      .send(batch())
      .expect(409);
    await request(app.getHttpServer())
      .get(`/bulk-handovers/${key}`)
      .set(headers(foreign))
      .expect(404);
  });
  it('rolls back every row when a later registration fails', async () => {
    const registrations = app.get(RegistrationService),
      original = registrations.create.bind(registrations);
    const before = await db.equipment.count({ where: { tenantId } });
    const spy = jest
      .spyOn(registrations, 'create')
      .mockImplementationOnce(original)
      .mockRejectedValueOnce(new Error('fixture failure in second row'));
    await request(app.getHttpServer())
      .post('/bulk-handovers')
      .set(headers())
      .set('Idempotency-Key', randomUUID())
      .send(batch())
      .expect(500);
    spy.mockRestore();
    expect(await db.equipment.count({ where: { tenantId } })).toBe(before);
  });
  it('serializes simultaneous retries of the same batch without creating extra machines', async () => {
    const input = batch(),
      key = randomUUID();
    const before = await db.equipment.count({ where: { tenantId } });
    const values = await Promise.all(
      [1, 2].map(() =>
        request(app.getHttpServer())
          .post('/bulk-handovers')
          .set(headers())
          .set('Idempotency-Key', key)
          .send(input)
          .expect(201),
      ),
    );
    expect(values[0].body).toEqual(values[1].body);
    expect(await db.equipment.count({ where: { tenantId } })).toBe(before + 2);
  });
  it('rejects invalid ownership, duplicate rows and future actual dates before writes', async () => {
    const input = batch();
    const invalid = await request(app.getHttpServer())
      .post('/bulk-handovers/preview')
      .set(headers())
      .send({ ...input, customerId: randomUUID() })
      .expect(201);
    expect(invalid.body.valid).toBe(false);
    await request(app.getHttpServer())
      .post('/bulk-handovers')
      .set(headers())
      .set('Idempotency-Key', randomUUID())
      .send({ ...input, csv: 'assetCode,serialNumber\nA,S\nA,S' })
      .expect(400);
    const future = await request(app.getHttpServer())
      .post('/bulk-handovers/preview')
      .set(headers())
      .send({
        ...input,
        csv: 'assetCode,serialNumber,handoverDate\nA,S,2999-01-01',
      })
      .expect(201);
    expect(future.body.valid).toBe(false);
  });
  it('keeps existing codes private until authorized staff enable the public projection', async () => {
    await request(app.getHttpServer())
      .get(`/public/equipment-by-qr/${token}`)
      .expect(404);
    await request(app.getHttpServer())
      .put(`/equipment/${equipmentId}/qr-codes/public`)
      .set(headers(foreign))
      .send({ enabled: true })
      .expect(404);
    await request(app.getHttpServer())
      .put(`/equipment/${equipmentId}/qr-codes/public`)
      .set(headers(otherBranch))
      .send({ enabled: true })
      .expect(404);
    await request(app.getHttpServer())
      .put(`/equipment/${equipmentId}/qr-codes/public`)
      .set(headers())
      .send({ enabled: true })
      .expect(200);
    const publicResult = await request(app.getHttpServer())
      .get(`/public/equipment-by-qr/${token}`)
      .expect(200);
    expect(Object.keys(publicResult.body).sort()).toEqual(
      [
        'formExpiresAt',
        'formToken',
        'model',
        'name',
        'notice',
        'warrantyStatus',
      ].sort(),
    );
    expect(JSON.stringify(publicResult.body)).not.toContain('PRIVATE');
    await request(app.getHttpServer()).get(`/qr/${token}`).expect(401);
  });
  it('records a pending inquiry once; protects contact details, branch access and the form capability', async () => {
    const landing = await request(app.getHttpServer())
      .get(`/public/equipment-by-qr/${token}`)
      .expect(200);
    const body = {
      formToken: landing.body.formToken,
      contactName: 'Customer',
      contactPhone: '0901234567',
      description: 'Equipment has stopped operating',
      consent: true,
    };
    await request(app.getHttpServer())
      .post(`/public/equipment-by-qr/${token}/inquiries`)
      .send({ ...body, consent: false })
      .expect(400);
    const responses = await Promise.all(
      [1, 2].map(() =>
        request(app.getHttpServer())
          .post(`/public/equipment-by-qr/${token}/inquiries`)
          .send(body)
          .expect(201),
      ),
    );
    expect(responses[0].body).toEqual(responses[1].body);
    expect(Object.keys(responses[0].body).sort()).toEqual([
      'reference',
      'status',
    ]);
    const id = responses[0].body.reference;
    await request(app.getHttpServer())
      .post(`/public/equipment-by-qr/${token}/inquiries`)
      .send({ ...body, description: 'Different report under same token' })
      .expect(409);
    await request(app.getHttpServer()).get('/public-qr-inquiries').expect(401);
    const listed = await request(app.getHttpServer())
      .get('/public-qr-inquiries')
      .set(headers())
      .expect(200);
    expect(listed.body.items.some((r: { id: string }) => r.id === id)).toBe(
      true,
    );
    expect(JSON.stringify(listed.body)).not.toContain('tokenHash');
    expect(
      (
        await request(app.getHttpServer())
          .get('/public-qr-inquiries')
          .set(headers(otherBranch))
          .expect(200)
      ).body.total,
    ).toBe(0);
    await request(app.getHttpServer())
      .post(`/public-qr-inquiries/${id}/decision`)
      .set(headers())
      .send({
        status: 'ACKNOWLEDGED',
        note: 'Called contact and verified machine',
      })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/public-qr-inquiries/${id}/decision`)
      .set(headers())
      .send({ status: 'REJECTED', note: 'Cannot overwrite prior decision' })
      .expect(409);
  });
  it('invalidates public access on equipment movement and QR revocation', async () => {
    await db.equipment.update({
      where: { id: equipmentId },
      data: { snapshotVersion: { increment: 1 } },
    });
    await request(app.getHttpServer())
      .get(`/public/equipment-by-qr/${token}`)
      .expect(404);
    await request(app.getHttpServer())
      .put(`/equipment/${equipmentId}/qr-codes/public`)
      .set(headers())
      .send({ enabled: true })
      .expect(200);
    const landing = await request(app.getHttpServer())
      .get(`/public/equipment-by-qr/${token}`)
      .expect(200);
    await request(app.getHttpServer())
      .delete(`/equipment/${equipmentId}/qr-codes`)
      .set(headers())
      .expect(204);
    await request(app.getHttpServer())
      .post(`/public/equipment-by-qr/${token}/inquiries`)
      .send({
        formToken: landing.body.formToken,
        contactName: 'Customer',
        contactPhone: '0901234567',
        description: 'Equipment stopped',
        consent: true,
      })
      .expect(404);
  });
  it('rejects malformed and expired form capabilities; suspension closes public access idempotently', async () => {
    const testToken = randomBytes(32).toString('base64url');
    await db.equipmentQrCode.create({
      data: {
        tenantId,
        equipmentId,
        token: testToken,
        publicEnabled: true,
        publicEquipmentVersion: 1,
        publicBranchId: branchId,
      },
    });
    const landing = await request(app.getHttpServer())
      .get(`/public/equipment-by-qr/${testToken}`)
      .expect(200);
    const body = {
      contactName: 'Customer',
      contactPhone: '0901234567',
      description: 'Please inspect equipment',
      consent: true,
    };
    for (const formToken of [
      'x.' + 'é'.repeat(43),
      landing.body.formToken.slice(0, -2) + '**',
    ]) {
      await request(app.getHttpServer())
        .post(`/public/equipment-by-qr/${testToken}/inquiries`)
        .send({ ...body, formToken })
        .expect(404);
    }
    const expired = Buffer.from(
      JSON.stringify({
        qrId: (
          await db.equipmentQrCode.findUniqueOrThrow({
            where: { token: testToken },
          })
        ).id,
        exp: 1,
        nonce: 'expired',
      }),
    ).toString('base64url');
    const signature = createHmac(
      'sha256',
      app.get(ConfigService).getOrThrow<string>('JWT_ACCESS_SECRET'),
    )
      .update(`pbl6.public-qr-intake.v1:${expired}`)
      .digest('base64url');
    await request(app.getHttpServer())
      .post(`/public/equipment-by-qr/${testToken}/inquiries`)
      .send({ ...body, formToken: `${expired}.${signature}` })
      .expect(404);
    const e = {
      eventId: randomUUID(),
      eventType: 'TenantStatusChanged',
      eventVersion: 1,
      producer: 'organization-service',
      tenantId,
      aggregateType: 'Tenant',
      aggregateId: tenantId,
      occurredAt: new Date().toISOString(),
      correlationId: null,
      payload: {
        tenantId,
        code: 'TEST',
        status: 'SUSPENDED',
        previousStatus: 'ACTIVE',
        changedAt: new Date().toISOString(),
      },
    };
    await app.get(PublicQrTenantConsumer).handle(e);
    await app.get(PublicQrTenantConsumer).handle(e);
    await request(app.getHttpServer())
      .get(`/public/equipment-by-qr/${testToken}`)
      .expect(404);
  });
});

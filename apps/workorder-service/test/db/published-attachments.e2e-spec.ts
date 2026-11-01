import { createHash, randomUUID } from 'node:crypto';
import {
  INestApplication,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import {
  configureApp,
  runWithCorrelationId,
  ServiceHttpClient,
  UpstreamError,
} from '@pbl6/service-kit';
import { signTestAccessToken } from '@pbl6/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { Prisma } from '../../src/generated/prisma/client.js';
import { ATTACHMENT_STORAGE } from '../../src/attachments/attachment-storage';
import { PublishedAttachmentsRepository } from '../../src/attachments/published-attachments.repository';
import { AttachmentTestStorage } from './support/attachment-storage';
import { validateEnv } from '../../src/config/env.validation';

const real = process.env.WORKORDER_ATTACHMENT_STORAGE_TEST === 'true';
const bytes = Buffer.from(
  '%PDF-1.7\nA4 publication integration fixture\n%%EOF',
);
const checksum = createHash('sha256').update(bytes).digest('hex');

describe(`M3-A4 published SR file projection (${real ? 'real MinIO' : 'storage double'})`, () => {
  let app: INestApplication<App>,
    db: PrismaService,
    storage: AttachmentTestStorage,
    repo: PublishedAttachmentsRepository;
  const tenantId = randomUUID(),
    otherTenantId = randomUUID(),
    customerId = randomUUID(),
    otherCustomerId = randomUUID(),
    srId = randomUUID(),
    otherSrId = randomUUID();
  const userId = randomUUID(),
    technicianUserId = randomUUID();
  const manager = signTestAccessToken({
    role: 'SERVICE_MANAGER',
    tenantId,
    userId,
  });
  const customer = signTestAccessToken({
    role: 'CUSTOMER_USER',
    tenantId,
    customerId,
  });
  const customerAdmin = signTestAccessToken({
    role: 'CUSTOMER_ADMIN',
    tenantId,
    customerId,
  });
  const wrongCustomer = signTestAccessToken({
    role: 'CUSTOMER_USER',
    tenantId,
    customerId: otherCustomerId,
  });
  const wrongTenant = signTestAccessToken({
    role: 'CUSTOMER_USER',
    tenantId: otherTenantId,
    customerId,
  });
  const technician = signTestAccessToken({
    role: 'TECHNICIAN',
    tenantId,
    userId: technicianUserId,
  });
  let orderId: string,
    reportOrderId: string,
    reportId: string,
    otherOrderId: string,
    maintenanceOrderId: string,
    foreignOrderId: string,
    technicianId: string;
  let woFile: string,
    reportFile: string,
    internalFile: string,
    deletedFile: string,
    legacyFile: string,
    maintenanceFile: string;
  const date = (index: number) => new Date(Date.UTC(2026, 10, 1, 0, 0, index));

  beforeAll(async () => {
    storage = new AttachmentTestStorage(
      real,
      new ConfigService(validateEnv(process.env)),
    );
    await storage.initialize();
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ATTACHMENT_STORAGE)
      .useValue(storage)
      .compile();
    app = module.createNestApplication({ logger: false });
    configureApp(app, { logger: new Logger('published-attachment-db') });
    await app.listen(0, '127.0.0.1');
    db = app.get(PrismaService);
    repo = app.get(PublishedAttachmentsRepository);
  });
  async function cleanDB() {
    const where = { tenantId: { in: [tenantId, otherTenantId] } };
    await db.attachmentCleanupJob.deleteMany({ where });
    await db.attachmentIdempotency.deleteMany({ where });
    await db.attachmentUploadIntent.deleteMany({ where });
    await db.reportAttachment.deleteMany({ where });
    await db.workOrderAttachment.deleteMany({ where });
    await db.serviceReport.deleteMany({ where });
    await db.workLog.deleteMany({ where });
    await db.workOrderAssignment.deleteMany({ where });
    await db.workOrderStatusHistory.deleteMany({ where });
    await db.workOrder.deleteMany({ where });
    await db.technician.deleteMany({ where });
  }
  const createOrder = (
    overrides: Partial<Prisma.WorkOrderUncheckedCreateInput> = {},
  ) =>
    db.workOrder.create({
      data: {
        tenantId,
        customerId,
        serviceRequestId: srId,
        equipmentId: randomUUID(),
        workOrderNo: `WO-A4-${randomUUID()}`,
        type: 'REPAIR',
        title: 'Private WO title',
        description: 'Private diagnosis',
        status: 'COMPLETED',
        completedAt: date(0),
        ...overrides,
      },
    });
  const file = (
    id: string,
    overrides: Partial<Prisma.WorkOrderAttachmentUncheckedCreateInput> = {},
  ) =>
    db.workOrderAttachment.create({
      data: {
        tenantId,
        workOrderId: id,
        uploadedBy: userId,
        storageKey: `a4-fixture/${randomUUID()}`,
        fileName: 'published-wo.pdf',
        mimeType: 'application/pdf',
        sizeBytes: bytes.length,
        checksumSha256: checksum,
        verifiedAt: date(0),
        visibility: 'CUSTOMER',
        createdAt: date(1),
        ...overrides,
      },
    });
  const reportAttachment = (
    overrides: Partial<Prisma.ReportAttachmentUncheckedCreateInput> = {},
  ) =>
    db.reportAttachment.create({
      data: {
        tenantId,
        serviceReportId: reportId,
        uploadedBy: userId,
        storageKey: `a4-fixture/${randomUUID()}`,
        fileName: 'published-report.pdf',
        mimeType: 'application/pdf',
        sizeBytes: bytes.length,
        checksumSha256: checksum,
        verifiedAt: date(0),
        visibility: 'CUSTOMER',
        createdAt: date(2),
        ...overrides,
      },
    });
  beforeEach(async () => {
    storage.resetFaults();
    await cleanDB();
    orderId = (await createOrder({ status: 'CANCELLED' })).id;
    reportOrderId = (await createOrder()).id;
    otherOrderId = (
      await createOrder({
        serviceRequestId: otherSrId,
        customerId: otherCustomerId,
      })
    ).id;
    maintenanceOrderId = (
      await createOrder({
        serviceRequestId: null,
        maintenanceTaskId: randomUUID(),
        type: 'MAINTENANCE',
      })
    ).id;
    foreignOrderId = (
      await createOrder({
        tenantId: otherTenantId,
        serviceRequestId: randomUUID(),
      })
    ).id;
    const tech = await db.technician.create({
      data: {
        tenantId,
        userId: technicianUserId,
        branchId: randomUUID(),
        employeeCode: 'A4-TECH',
      },
    });
    technicianId = tech.id;
    await db.workOrderAssignment.create({
      data: {
        tenantId,
        workOrderId: orderId,
        technicianId,
        assignedBy: userId,
        status: 'REMOVED',
      },
    });
    reportId = (
      await db.serviceReport.create({
        data: {
          tenantId,
          workOrderId: reportOrderId,
          technicianId,
          problemDescription: 'Private report diagnosis',
          solution: 'Private repair notes',
          result: 'RESOLVED',
        },
      })
    ).id;
    woFile = (await file(orderId)).id;
    reportFile = (await reportAttachment()).id;
    internalFile = (
      await file(orderId, {
        fileName: 'internal-secret.pdf',
        visibility: 'INTERNAL',
        createdAt: date(0),
      })
    ).id;
    deletedFile = (
      await reportAttachment({
        fileName: 'deleted.pdf',
        deletedAt: date(3),
        deletedBy: userId,
      })
    ).id;
    legacyFile = (
      await file(orderId, {
        fileName: 'legacy-unverified.pdf',
        sizeBytes: null,
        checksumSha256: null,
        verifiedAt: null,
      })
    ).id;
    maintenanceFile = (await file(maintenanceOrderId)).id;
    await file(otherOrderId, { fileName: 'other-customer.pdf' });
    await file(foreignOrderId, {
      tenantId: otherTenantId,
      fileName: 'other-tenant.pdf',
    });
  });
  afterAll(async () => {
    if (db) await cleanDB();
    await app?.close();
    await storage?.close();
  });
  const list = (token = customer, sourceId: string = srId, query = '') =>
    request(app.getHttpServer())
      .get(`/internal/service-request-attachments/${sourceId}${query}`)
      .auth(token, { type: 'bearer' });
  const download = (id: string, token = customer, sourceId: string = srId) =>
    request(app.getHttpServer())
      .get(`/internal/service-request-attachments/${sourceId}/${id}/download`)
      .auth(token, { type: 'bearer' });
  async function uploaded() {
    const ticket = await request(app.getHttpServer())
      .post(`/work-orders/${reportOrderId}/service-report/attachment-uploads`)
      .auth(manager, { type: 'bearer' })
      .set('Idempotency-Key', randomUUID())
      .send({
        fileName: 'customer-result.pdf',
        mimeType: 'application/pdf',
        sizeBytes: bytes.length,
        checksumSha256: checksum,
      })
      .expect(201);
    await storage.put(ticket.body, bytes);
    const complete = await request(app.getHttpServer())
      .post(`/attachment-uploads/${ticket.body.uploadId}/complete`)
      .auth(manager, { type: 'bearer' })
      .set('Idempotency-Key', randomUUID())
      .send({})
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/attachments/${complete.body.id}`)
      .auth(manager, { type: 'bearer' })
      .send({ visibility: 'CUSTOMER' })
      .expect(200);
    return complete.body.id as string;
  }

  it('unions WO/report files across the same SR and exposes only the five published fields', async () => {
    for (const token of [customer, customerAdmin, manager]) {
      const response = await list(token).expect(200);
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.body.total).toBe(2);
      expect(response.body.items.map((row: { id: string }) => row.id)).toEqual([
        woFile,
        reportFile,
      ]);
      for (const row of response.body.items)
        expect(Object.keys(row).sort()).toEqual([
          'createdAt',
          'fileName',
          'id',
          'mimeType',
          'sizeBytes',
        ]);
      expect(JSON.stringify(response.body)).not.toMatch(
        /internal-secret|Private|storageKey|uploadedBy|workOrderId|serviceReportId|visibility|checksum|downloadUrl/,
      );
    }
  });
  it('filters before global pagination/count, with stable order for equal timestamps', async () => {
    await db.workOrderAttachment.deleteMany({ where: { tenantId } });
    await db.reportAttachment.deleteMany({ where: { tenantId } });
    const expected: string[] = [];
    for (let index = 0; index < 25; index++)
      expected.push(
        (index % 2
          ? await file(orderId, { createdAt: date(1) })
          : await reportAttachment({ createdAt: date(1) })
        ).id,
      );
    for (let index = 0; index < 5; index++)
      await file(orderId, { visibility: 'INTERNAL', createdAt: date(0) });
    expected.sort();
    const found: string[] = [];
    for (const page of [1, 2, 3, 4]) {
      const response = await list(
        customer,
        srId,
        `?page=${page}&pageSize=10`,
      ).expect(200);
      expect(response.body.total).toBe(25);
      expect(response.body.page).toBe(page);
      found.push(...response.body.items.map((row: { id: string }) => row.id));
    }
    expect(found).toEqual(expected);
    expect(new Set(found).size).toBe(25);
  });
  it('returns source 404 without a scoped WO, but 200/zero when scoped WOs have no published files', async () => {
    expect((await list(customer, randomUUID()).expect(404)).body.code).toBe(
      'WORK_ORDER_NOT_FOUND',
    );
    await db.workOrderAttachment.updateMany({
      where: { tenantId },
      data: { visibility: 'INTERNAL' },
    });
    await db.reportAttachment.updateMany({
      where: { tenantId },
      data: { visibility: 'INTERNAL' },
    });
    expect((await list().expect(200)).body).toEqual({
      items: [],
      total: 0,
      page: 1,
      pageSize: 20,
    });
  });
  it('isolates tenant/customer claims and ignores forged tenant headers', async () => {
    await list(wrongCustomer).expect(404);
    await list(wrongTenant).expect(404);
    await list().set('x-tenant-id', otherTenantId).expect(200);
    expect((await list(wrongCustomer, otherSrId).expect(200)).body.total).toBe(
      1,
    );
    await download(woFile, wrongCustomer).expect(404);
    await download(reportFile, wrongTenant).expect(404);
    // Even colliding logical SR/customer IDs in another tenant cannot affect this count.
    const foreign = await createOrder({ tenantId: otherTenantId });
    await file(foreign.id, { tenantId: otherTenantId });
    expect((await list().expect(200)).body.total).toBe(2);
  });
  it('preserves historical technician scope and the wider scope of an additional staff role', async () => {
    const own = await list(technician).expect(200);
    expect(own.body.total).toBe(1);
    expect(own.body.items[0].id).toBe(woFile);
    await download(reportFile, technician).expect(404);
    const unassigned = signTestAccessToken({ role: 'TECHNICIAN', tenantId });
    await list(unassigned).expect(404);
    const mixed = signTestAccessToken({
      role: ['TECHNICIAN', 'SERVICE_MANAGER'],
      tenantId,
      userId: technicianUserId,
    });
    expect((await list(mixed).expect(200)).body.total).toBe(2);
  });
  it('requires verified token, allowed account and service_request:read', async () => {
    await request(app.getHttpServer())
      .get(`/internal/service-request-attachments/${srId}`)
      .expect(401);
    await list(
      signTestAccessToken({
        role: 'CUSTOMER_USER',
        tenantId,
        customerId,
        expiresIn: -1,
      }),
    ).expect(401);
    await list(
      signTestAccessToken({
        role: 'CUSTOMER_USER',
        tenantId,
        customerId,
        secret: 'not-the-test-secret',
      }),
    ).expect(401);
    await list(signTestAccessToken({ role: 'PLATFORM_ADMIN' })).expect(403);
    await list(
      signTestAccessToken({ role: 'INVENTORY_STAFF', tenantId }),
    ).expect(403);
    expect(
      (
        await list(
          signTestAccessToken({ role: 'CUSTOMER_USER', tenantId }),
        ).expect(403)
      ).body.code,
    ).toBe('CUSTOMER_SCOPE_MISSING');
  });
  it('validates UUID/pagination/query fields and never accepts caller-selected scope', async () => {
    await list(customer, 'not-a-uuid').expect(400);
    for (const query of [
      '?page=0',
      '?pageSize=101',
      '?customerId=' + otherCustomerId,
      '?tenantId=' + otherTenantId,
      '?visibility=INTERNAL',
    ])
      await list(customer, srId, query).expect(400);
    await download('not-a-uuid').expect(400);
    await request(app.getHttpServer())
      .get(
        `/internal/service-request-attachments/${srId}/${woFile}/download?customerId=${otherCustomerId}`,
      )
      .auth(customer, { type: 'bearer' })
      .expect(400);
  });
  it('denies INTERNAL/deleted/unverified/maintenance/wrong-SR IDs before signing', async () => {
    const sign = jest.spyOn(storage, 'download');
    for (const id of [
      internalFile,
      deletedFile,
      legacyFile,
      maintenanceFile,
      randomUUID(),
    ])
      expect((await download(id).expect(404)).body.code).toBe(
        'ATTACHMENT_NOT_FOUND',
      );
    await download(woFile, manager, otherSrId).expect(404);
    await download(reportFile, manager, otherSrId).expect(404);
    expect(sign).not.toHaveBeenCalled();
    sign.mockRestore();
  });
  it('downloads an actual published report file with a fresh no-store ticket', async () => {
    const id = await uploaded();
    const original = storage.download.bind(storage);
    const sign = jest
      .spyOn(storage, 'download')
      .mockImplementationOnce(async (key, name) => ({
        ...(await original(key, name)),
        storageKey: 'adapter-private-diagnostic',
      }));
    const response = await download(id)
      .set('x-correlation-id', 'a4-client-correlation')
      .expect(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['x-correlation-id']).toBe('a4-client-correlation');
    expect(Object.keys(response.body).sort()).toEqual([
      'downloadUrl',
      'expiresAt',
    ]);
    expect(await storage.downloaded(response.body.downloadUrl)).toEqual(bytes);
    expect(
      new Date(response.body.expiresAt).getTime() - Date.now(),
    ).toBeLessThanOrEqual(60_000);
    expect(new Date(response.body.expiresAt).getTime()).toBeGreaterThan(
      Date.now(),
    );
    sign.mockRestore();
  });
  it('hiding and deleting immediately filter list/count/new downloads; CUSTOMER still cannot use staff APIs', async () => {
    const id = await uploaded();
    expect((await list().expect(200)).body.total).toBe(3);
    for (const path of [
      `/attachments/${id}/download`,
      `/work-orders/${reportOrderId}/service-report/attachments`,
      `/work-orders/${reportOrderId}/attachments`,
    ])
      await request(app.getHttpServer())
        .get(path)
        .auth(customer, { type: 'bearer' })
        .expect(403);
    await request(app.getHttpServer())
      .patch(`/attachments/${id}`)
      .auth(manager, { type: 'bearer' })
      .send({ visibility: 'INTERNAL' })
      .expect(200);
    expect((await list().expect(200)).body.total).toBe(2);
    await download(id).expect(404);
    await request(app.getHttpServer())
      .patch(`/attachments/${id}`)
      .auth(manager, { type: 'bearer' })
      .send({ visibility: 'CUSTOMER' })
      .expect(200);
    await request(app.getHttpServer())
      .delete(`/attachments/${id}`)
      .auth(manager, { type: 'bearer' })
      .expect(204);
    expect((await list().expect(200)).body.total).toBe(2);
    await download(id).expect(404);
  });
  it('rechecks visibility after storage signing before releasing the ticket', async () => {
    const id = await uploaded();
    const original = storage.download.bind(storage);
    const sign = jest
      .spyOn(storage, 'download')
      .mockImplementationOnce(async (key, name) => {
        const ticket = await original(key, name);
        await db.reportAttachment.update({
          where: { id },
          data: { visibility: 'INTERNAL' },
        });
        return ticket;
      });
    const response = await download(id).expect(404);
    expect(response.body).not.toHaveProperty('downloadUrl');
    sign.mockRestore();
  });
  it('rechecks technician assignment after signing and refuses a removed read scope', async () => {
    const id = await uploaded();
    await db.workOrderAssignment.create({
      data: {
        tenantId,
        workOrderId: reportOrderId,
        technicianId,
        assignedBy: userId,
        status: 'COMPLETED',
      },
    });
    const original = storage.download.bind(storage);
    const sign = jest
      .spyOn(storage, 'download')
      .mockImplementationOnce(async (key, name) => {
        const ticket = await original(key, name);
        await db.workOrderAssignment.deleteMany({
          where: { tenantId, workOrderId: reportOrderId, technicianId },
        });
        return ticket;
      });
    await download(id, technician).expect(404);
    sign.mockRestore();
  });
  it('never changes database/storage failures into an empty page or a leaked diagnostic', async () => {
    const listing = jest
      .spyOn(repo, 'list')
      .mockRejectedValueOnce(
        new Error('SQL and object keys must stay private'),
      );
    const unavailable = await list().expect(503);
    expect(unavailable.body.code).toBe('ATTACHMENT_SOURCE_UNAVAILABLE');
    expect(JSON.stringify(unavailable.body)).not.toMatch(/SQL|object keys/);
    listing.mockRestore();
    const id = await uploaded();
    const signing = jest.spyOn(storage, 'download').mockRejectedValueOnce(
      new ServiceUnavailableException({
        code: 'ATTACHMENT_STORAGE_UNAVAILABLE',
        message: 'Storage unavailable',
      }),
    );
    expect((await download(id).expect(503)).body.code).toBe(
      'ATTACHMENT_STORAGE_UNAVAILABLE',
    );
    signing.mockRestore();
  });
  it('fails closed on ambiguous attachment UUIDs across the two legacy tables', async () => {
    await reportAttachment({ id: woFile });
    await download(woFile).expect(404);
  });
  it('supports the shared SR caller client with the original token/correlation and typed source failures', async () => {
    let forwarded = false,
      echoed = false;
    const client = new ServiceHttpClient({
      name: 'workorder-service',
      baseUrl: await app.getUrl(),
      fetch: async (url, options) => {
        const headers = new Headers(options?.headers);
        forwarded = headers.get('authorization') === `Bearer ${customer}`;
        const response = await fetch(url, options);
        echoed =
          response.headers.get('x-correlation-id') === 'a4-sr-composition';
        return response;
      },
    });
    const response = await runWithCorrelationId('a4-sr-composition', () =>
      client.get<{ total: number }>(
        `/internal/service-request-attachments/${srId}`,
        { accessToken: customer },
      ),
    );
    expect(forwarded).toBe(true);
    expect(echoed).toBe(true);
    expect(response.total).toBe(2);
    await expect(
      client.get(`/internal/service-request-attachments/${randomUUID()}`, {
        accessToken: customer,
      }),
    ).rejects.toMatchObject({ status: 404, code: 'WORK_ORDER_NOT_FOUND' });
    const failed = jest
      .spyOn(repo, 'list')
      .mockRejectedValueOnce(new Error('Injected DB outage'));
    await expect(
      client.get(`/internal/service-request-attachments/${srId}`, {
        accessToken: customer,
      }),
    ).rejects.toBeInstanceOf(UpstreamError);
    failed.mockRestore();
  });
  it('withholds a signed ticket if deletion or a source failure occurs during storage I/O', async () => {
    const id = await uploaded();
    const original = storage.download.bind(storage);
    const sign = jest
      .spyOn(storage, 'download')
      .mockImplementationOnce(async (key, name) => {
        const ticket = await original(key, name);
        await db.reportAttachment.update({
          where: { id },
          data: { deletedAt: new Date(), deletedBy: userId },
        });
        return ticket;
      });
    await download(id).expect(404);
    sign.mockRestore();
    const second = await uploaded();
    const signAgain = jest
      .spyOn(storage, 'download')
      .mockImplementationOnce(async (key, name) => {
        const ticket = await original(key, name);
        jest
          .spyOn(repo, 'download')
          .mockRejectedValueOnce(new Error('Injected post-signing DB outage'));
        return ticket;
      });
    const response = await download(second).expect(503);
    expect(response.body.code).toBe('ATTACHMENT_SOURCE_UNAVAILABLE');
    expect(response.body).not.toHaveProperty('downloadUrl');
    signAgain.mockRestore();
    jest.restoreAllMocks();
  });
  it('returns storage unavailable when a published object is missing instead of inventing an empty result', async () => {
    const id = await uploaded();
    const row = await db.reportAttachment.findUniqueOrThrow({ where: { id } });
    await storage.inner.remove(row.storageKey);
    expect((await download(id).expect(503)).body.code).toBe(
      'ATTACHMENT_STORAGE_UNAVAILABLE',
    );
    expect((await list().expect(200)).body.total).toBe(3);
  });
});

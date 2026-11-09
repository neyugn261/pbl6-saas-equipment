import { BranchAccessClient } from '@pbl6/auth';
import { FIXTURE_BRANCH, fixtureBranchContext } from '@pbl6/testing';
import { createHash, randomUUID } from 'node:crypto';
import { INestApplication, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { configureApp } from '@pbl6/service-kit';
import { signTestAccessToken } from '@pbl6/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { ATTACHMENT_STORAGE } from '../../src/attachments/attachment-storage';
import { AttachmentsRepository } from '../../src/attachments/attachments.repository';
import { AttachmentCleanupRepository } from '../../src/attachments/attachment-cleanup.repository';
import { AttachmentCleanupService } from '../../src/attachments/attachment-cleanup.service';
import { AttachmentTestStorage } from './support/attachment-storage';
import { validateEnv } from '../../src/config/env.validation';

const real = process.env.WORKORDER_ATTACHMENT_STORAGE_TEST === 'true';
const bytes = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg==',
  'base64',
);
const metadata = {
  fileName: 'repair.png',
  mimeType: 'image/png',
  sizeBytes: bytes.length,
  checksumSha256: createHash('sha256').update(bytes).digest('hex'),
};

describe(`M3 A2/A3 attachment HTTP + PostgreSQL (${real ? 'REAL MinIO' : 'explicit storage double'})`, () => {
  let app: INestApplication<App>,
    db: PrismaService,
    storage: AttachmentTestStorage,
    repo: AttachmentsRepository,
    cleanup: AttachmentCleanupRepository;
  const tenantId = randomUUID(),
    otherTenantId = randomUUID(),
    actorId = randomUUID(),
    techUserId = randomUUID(),
    pastUserId = randomUUID();
  const manager = signTestAccessToken({
    role: 'SERVICE_MANAGER',
    tenantId,
    userId: actorId,
  });
  const technician = signTestAccessToken({
    role: 'TECHNICIAN',
    tenantId,
    userId: techUserId,
  });
  const past = signTestAccessToken({
    role: 'TECHNICIAN',
    tenantId,
    userId: pastUserId,
  });
  const otherManager = signTestAccessToken({
    role: 'SERVICE_MANAGER',
    tenantId: otherTenantId,
  });
  const customer = signTestAccessToken({
    role: 'CUSTOMER_USER',
    tenantId,
    customerId: randomUUID(),
  });
  const admin = signTestAccessToken({ role: 'TENANT_ADMIN', tenantId });
  let orderId: string, secondOrderId: string, techId: string;
  beforeAll(async () => {
    storage = new AttachmentTestStorage(
      real,
      new ConfigService(validateEnv(process.env)),
    );
    await storage.initialize();
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(BranchAccessClient)
      .useValue(fixtureBranchContext(FIXTURE_BRANCH))
      .overrideProvider(ATTACHMENT_STORAGE)
      .useValue(storage)
      .compile();
    app = module.createNestApplication({ logger: false });
    configureApp(app, { logger: new Logger('attachment-db') });
    await app.init();
    db = app.get(PrismaService);
    repo = app.get(AttachmentsRepository);
    cleanup = app.get(AttachmentCleanupRepository);
  });
  const cleanDB = async () => {
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
  };
  beforeEach(async () => {
    storage.resetFaults();
    await cleanDB();
    const create = () =>
      db.workOrder.create({
        data: {
          branchId: FIXTURE_BRANCH,
          tenantId,
          workOrderNo: `WO-A2-${randomUUID()}`,
          serviceRequestId: randomUUID(),
          equipmentId: randomUUID(),
          customerId: randomUUID(),
          type: 'REPAIR',
          title: 'Attachment test fixture',
          status: 'IN_PROGRESS',
        },
      });
    orderId = (await create()).id;
    secondOrderId = (await create()).id;
    const tech = await db.technician.create({
      data: {
        tenantId,
        userId: techUserId,
        branchId: FIXTURE_BRANCH,
        employeeCode: 'A2-CURRENT',
      },
    });
    techId = tech.id;
    const former = await db.technician.create({
      data: {
        tenantId,
        userId: pastUserId,
        branchId: FIXTURE_BRANCH,
        employeeCode: 'A2-PAST',
      },
    });
    await db.workOrderAssignment.createMany({
      data: [
        {
          tenantId,
          workOrderId: orderId,
          technicianId: tech.id,
          assignedBy: actorId,
          status: 'ACCEPTED',
        },
        {
          tenantId,
          workOrderId: orderId,
          technicianId: former.id,
          assignedBy: actorId,
          status: 'REMOVED',
        },
      ],
    });
  });
  afterAll(async () => {
    if (db) await cleanDB();
    await app?.close();
    await storage?.close();
  });
  const prepare = (
    options: {
      token?: string;
      id?: string;
      key?: string;
      body?: object;
      report?: boolean;
    } = {},
  ) =>
    request(app.getHttpServer())
      .post(
        `/work-orders/${options.id ?? orderId}/${options.report ? 'service-report/' : ''}attachment-uploads`,
      )
      .auth(options.token ?? manager, { type: 'bearer' })
      .set('Idempotency-Key', options.key ?? randomUUID())
      .send(options.body ?? metadata);
  const complete = (id: string, token = manager, key = randomUUID()) =>
    request(app.getHttpServer())
      .post(`/attachment-uploads/${id}/complete`)
      .auth(token, { type: 'bearer' })
      .set('Idempotency-Key', key)
      .send({});
  const list = (token = manager, report = false) =>
    request(app.getHttpServer())
      .get(
        `/work-orders/${orderId}/${report ? 'service-report/' : ''}attachments`,
      )
      .auth(token, { type: 'bearer' });
  async function attached(token = manager, report = false) {
    const ticket = await prepare({ token, report }).expect(201);
    await storage.put(ticket.body, bytes);
    return (await complete(ticket.body.uploadId, token).expect(200)).body;
  }
  async function submittedReport() {
    await db.workOrder.update({
      where: { id: orderId },
      data: { status: 'COMPLETED', completedAt: new Date() },
    });
    await db.workOrderAssignment.updateMany({
      where: { workOrderId: orderId, status: 'ACCEPTED' },
      data: { status: 'COMPLETED' },
    });
    return db.serviceReport.create({
      data: {
        tenantId,
        workOrderId: orderId,
        technicianId: techId,
        problemDescription: 'Fixture',
        solution: 'Fixture',
        result: 'RESOLVED',
      },
    });
  }
  async function makeStagingDue(uploadId: string) {
    const now = Date.now();
    await db.attachmentUploadIntent.update({
      where: { id: uploadId },
      data: {
        createdAt: new Date(now - 600_000),
        expiresAt: new Date(now - 120_000),
      },
    });
    await db.attachmentCleanupJob.updateMany({
      where: { uploadId, kind: 'STAGING' },
      data: { notBefore: new Date(0) },
    });
  }

  it('reserves/replays one intent, verifies file, and signs a private download without leaking keys', async () => {
    const key = randomUUID();
    const ticket = await prepare({ key }).expect(201);
    const replay = await prepare({ key }).expect(201);
    expect(replay.body.uploadId).toBe(ticket.body.uploadId);
    expect(replay.body.expiresAt).toBe(ticket.body.expiresAt);
    expect(ticket.headers['cache-control']).toBe('no-store');
    expect((await list().expect(200)).body.total).toBe(0);
    await storage.put(ticket.body, bytes);
    const finalKey = randomUUID();
    const response = await complete(
      ticket.body.uploadId,
      manager,
      finalKey,
    ).expect(200);
    expect(response.body.visibility).toBe('INTERNAL');
    expect(response.body.sizeBytes).toBe(bytes.length);
    expect(response.body).not.toHaveProperty('storageKey');
    expect(response.body).not.toHaveProperty('uploadUrl');
    const again = await complete(
      ticket.body.uploadId,
      manager,
      finalKey,
    ).expect(200);
    expect(again.body.id).toBe(response.body.id);
    expect((await list().expect(200)).body.total).toBe(1);
    const download = await request(app.getHttpServer())
      .get(`/attachments/${response.body.id}/download`)
      .auth(manager, { type: 'bearer' })
      .expect(200);
    expect(download.headers['cache-control']).toBe('no-store');
    expect(await storage.downloaded(download.body.downloadUrl)).toEqual(bytes);
    if (real) {
      const preflight = await fetch(ticket.body.uploadUrl, {
        method: 'OPTIONS',
        headers: {
          Origin: 'http://localhost:5173',
          'Access-Control-Request-Method': 'PUT',
          'Access-Control-Request-Headers': 'content-type',
        },
      });
      expect([200, 204]).toContain(preflight.status);
      expect(preflight.headers.get('access-control-allow-origin')).toBe(
        'http://localhost:5173',
      );
      const unsigned = new URL(download.body.downloadUrl);
      unsigned.search = '';
      expect((await fetch(unsigned)).status).toBe(403);
    }
  });
  it('replaying staging PUT cannot alter final bytes; finalize replay uses current visibility after WO completes', async () => {
    const ticket = await prepare().expect(201);
    await storage.put(ticket.body, bytes);
    const file = await complete(ticket.body.uploadId).expect(200);
    await storage.put(ticket.body, Buffer.from('different bytes'));
    await db.workOrder.update({
      where: { id: orderId },
      data: { status: 'COMPLETED' },
    });
    await request(app.getHttpServer())
      .patch(`/attachments/${file.body.id}`)
      .auth(manager, { type: 'bearer' })
      .send({ visibility: 'CUSTOMER' })
      .expect(200);
    const replay = await complete(ticket.body.uploadId).expect(200);
    expect(replay.body.visibility).toBe('CUSTOMER');
    const download = await request(app.getHttpServer())
      .get(`/attachments/${file.body.id}/download`)
      .auth(manager, { type: 'bearer' })
      .expect(200);
    expect(await storage.downloaded(download.body.downloadUrl)).toEqual(bytes);
  });
  it('rejects key reuse across parent/payload and another upload for finalize', async () => {
    const key = randomUUID();
    const first = await prepare({ key }).expect(201);
    expect(
      (await prepare({ key, id: secondOrderId }).expect(409)).body.code,
    ).toBe('IDEMPOTENCY_KEY_REUSED');
    expect(
      (
        await prepare({
          key,
          body: { ...metadata, fileName: 'other.png' },
        }).expect(409)
      ).body.code,
    ).toBe('IDEMPOTENCY_KEY_REUSED');
    await storage.put(first.body, bytes);
    const completeKey = randomUUID();
    await complete(first.body.uploadId, manager, completeKey).expect(200);
    const second = await prepare().expect(201);
    expect(
      (await complete(second.body.uploadId, manager, completeKey).expect(409))
        .body.code,
    ).toBe('IDEMPOTENCY_KEY_REUSED');
  });
  it('atomically reserves only ten slots under concurrent prepare and reuses keys at full quota', async () => {
    const keys = Array.from({ length: 11 }, () => randomUUID());
    const responses = await Promise.all(keys.map((key) => prepare({ key })));
    expect(responses.filter((r) => r.status === 201)).toHaveLength(10);
    expect(responses.filter((r) => r.status === 409)).toHaveLength(1);
    const index = responses.findIndex((r) => r.status === 201);
    await prepare({ key: keys[index] }).expect(201);
    const row = await db.attachmentUploadIntent.findFirstOrThrow({
      where: { tenantId, id: responses[index].body.uploadId },
    });
    await request(app.getHttpServer())
      .delete(`/attachment-uploads/${row.id}`)
      .auth(manager, { type: 'bearer' })
      .expect(204);
    await prepare().expect(201);
  });
  it('concurrent finalize creates one attachment and one audit', async () => {
    const ticket = await prepare().expect(201);
    await storage.put(ticket.body, bytes);
    const key = randomUUID();
    const results = await Promise.all([
      complete(ticket.body.uploadId, manager, key),
      complete(ticket.body.uploadId, manager, key),
    ]);
    expect(results.some((r) => r.status === 200)).toBe(true);
    expect(results.every((r) => [200, 409].includes(r.status))).toBe(true);
    expect(await db.workOrderAttachment.count({ where: { tenantId } })).toBe(1);
    expect(
      await db.workLog.count({
        where: { tenantId, eventType: 'ATTACHMENT_ATTACHED' },
      }),
    ).toBe(1);
  });
  it('enforces token, account type, tenant, uploader and assignment scopes', async () => {
    await request(app.getHttpServer())
      .get(`/work-orders/${orderId}/attachments`)
      .expect(401);
    await list(customer).expect(403);
    await prepare({ token: customer }).expect(403);
    await prepare({ token: admin }).expect(403);
    await prepare({ token: otherManager }).expect(404);
    await prepare({ token: past }).expect(403);
    const ticket = await prepare({ token: technician }).expect(201);
    await storage.put(ticket.body, bytes);
    await complete(ticket.body.uploadId, manager).expect(404);
    const file = await complete(ticket.body.uploadId, technician).expect(200);
    await request(app.getHttpServer())
      .get(`/attachments/${file.body.id}/download`)
      .auth(otherManager, { type: 'bearer' })
      .expect(404);
    await request(app.getHttpServer())
      .patch(`/attachments/${file.body.id}`)
      .auth(technician, { type: 'bearer' })
      .send({ visibility: 'CUSTOMER' })
      .expect(403);
    await list(past).expect(200); // historical read is not mutation permission
  });
  it('rechecks assignment and parent state after storage verification, before commit', async () => {
    const ticket = await prepare({ token: technician }).expect(201);
    await storage.put(ticket.body, bytes);
    storage.afterRead = async () => {
      await db.workOrderAssignment.updateMany({
        where: { workOrderId: orderId, status: 'ACCEPTED' },
        data: { status: 'REMOVED' },
      });
    };
    await complete(ticket.body.uploadId, technician).expect(403);
    expect((await list().expect(200)).body.total).toBe(0);
    storage.afterRead = undefined;
    const next = await prepare().expect(201);
    await storage.put(next.body, bytes);
    storage.afterWrite = async () => {
      await db.workOrder.update({
        where: { id: orderId },
        data: { status: 'CANCELLED' },
      });
    };
    expect((await complete(next.body.uploadId).expect(409)).body.code).toBe(
      'ATTACHMENT_PARENT_STATE_CONFLICT',
    );
    expect((await list().expect(200)).body.total).toBe(0);
  });
  it('does not publish missing or mismatched bytes/type/hash', async () => {
    const missing = await prepare().expect(201);
    expect((await complete(missing.body.uploadId).expect(409)).body.code).toBe(
      'UPLOAD_NOT_READY',
    );
    for (const body of [
      { ...metadata, checksumSha256: 'a'.repeat(64) },
      { ...metadata, mimeType: 'application/pdf' },
      { ...metadata, sizeBytes: bytes.length + 1 },
    ]) {
      const ticket = await prepare({ body }).expect(201);
      await storage.put(ticket.body, bytes);
      expect((await complete(ticket.body.uploadId).expect(422)).body.code).toBe(
        'UPLOAD_VERIFICATION_FAILED',
      );
    }
    expect((await list().expect(200)).body.total).toBe(0);
  });
  it('validates headers/DTO/filename/type/size and prevents technician publication at prepare', async () => {
    await request(app.getHttpServer())
      .post(`/work-orders/${orderId}/attachment-uploads`)
      .auth(manager, { type: 'bearer' })
      .send(metadata)
      .expect(400);
    await prepare({ body: { ...metadata, tenantId } }).expect(400);
    await prepare({ body: { ...metadata, fileName: '../x.png' } }).expect(400);
    await prepare({ body: { ...metadata, sizeBytes: 0 } }).expect(400);
    expect(
      (
        await prepare({ body: { ...metadata, mimeType: 'text/html' } }).expect(
          415,
        )
      ).body.code,
    ).toBe('ATTACHMENT_TYPE_UNSUPPORTED');
    await prepare({ body: { ...metadata, sizeBytes: 10_485_761 } }).expect(413);
    await prepare({
      token: technician,
      body: { ...metadata, visibility: 'CUSTOMER' },
    }).expect(403);
    const ticket = await prepare().expect(201);
    await request(app.getHttpServer())
      .post(`/attachment-uploads/${ticket.body.uploadId}/complete`)
      .auth(manager, { type: 'bearer' })
      .set('Idempotency-Key', randomUUID())
      .send({ storageKey: 'forged' })
      .expect(400);
  });
  it('uploads report only after report exists, permits author and denies nonauthor historical technician', async () => {
    await prepare({ report: true }).expect(404);
    await submittedReport();
    await prepare({ report: true, token: past }).expect(403);
    const result = await attached(technician, true);
    expect(result.visibility).toBe('INTERNAL');
    expect((await list(technician, true).expect(200)).body.total).toBe(1);
    expect(await db.outboxEvent.count({ where: { tenantId } })).toBe(0);
  });
  it('maintains independent WO/report quotas and historical terminal reads', async () => {
    for (let i = 0; i < 10; i++) await prepare().expect(201);
    await submittedReport();
    await prepare({ token: technician, report: true }).expect(201);
    await list(technician).expect(200);
  });
  it('publishes/hides with audit; delete tombstone makes finalize replay 404 and delete replay safe', async () => {
    const ticket = await prepare().expect(201);
    await storage.put(ticket.body, bytes);
    const file = await complete(ticket.body.uploadId).expect(200);
    for (const visibility of ['CUSTOMER', 'INTERNAL'])
      await request(app.getHttpServer())
        .patch(`/attachments/${file.body.id}`)
        .auth(manager, { type: 'bearer' })
        .send({ visibility })
        .expect(200);
    await request(app.getHttpServer())
      .delete(`/attachments/${file.body.id}`)
      .auth(manager, { type: 'bearer' })
      .expect(204);
    await db.workOrder.update({
      where: { id: orderId },
      data: { status: 'COMPLETED' },
    });
    await request(app.getHttpServer())
      .delete(`/attachments/${file.body.id}`)
      .auth(manager, { type: 'bearer' })
      .expect(204);
    expect((await complete(ticket.body.uploadId).expect(404)).body.code).toBe(
      'ATTACHMENT_NOT_FOUND',
    );
    expect((await list().expect(200)).body.total).toBe(0);
    const logs = await db.workLog.findMany({ where: { tenantId } });
    expect(logs).toHaveLength(4);
    expect(
      logs.every(
        (row) => !/storageKey|https?:|repair\.png/.test(row.note ?? ''),
      ),
    ).toBe(true);
  });
  it('blocks first WO delete after terminal, while report author can delete completed report files', async () => {
    const file = await attached();
    await submittedReport();
    await request(app.getHttpServer())
      .delete(`/attachments/${file.id}`)
      .auth(manager, { type: 'bearer' })
      .expect(409);
    const reportFile = await attached(technician, true);
    await request(app.getHttpServer())
      .delete(`/attachments/${reportFile.id}`)
      .auth(technician, { type: 'bearer' })
      .expect(204);
  });
  it('aborts durably and rejects late PUT finalization without renewing intent TTL', async () => {
    const key = randomUUID();
    const ticket = await prepare({ key }).expect(201);
    for (let i = 0; i < 2; i++)
      await request(app.getHttpServer())
        .delete(`/attachment-uploads/${ticket.body.uploadId}`)
        .auth(manager, { type: 'bearer' })
        .expect(204);
    await storage.put(ticket.body, bytes);
    expect((await complete(ticket.body.uploadId).expect(409)).body.code).toBe(
      'UPLOAD_ABORTED',
    );
    expect((await prepare({ key }).expect(409)).body.code).toBe(
      'UPLOAD_ABORTED',
    );
    await makeStagingDue(ticket.body.uploadId);
    const job = await cleanup.claim();
    expect(job).not.toBeNull();
    expect(await cleanup.authorizeRemoval(job!)).toBe(true);
    await storage.remove(job!.objectKey);
    await cleanup.done(job!);
    await expect(storage.inner.read(job!.objectKey)).rejects.toThrow();
  });
  it('expires intents and frees reservations, while preserving expired replay identity', async () => {
    const key = randomUUID();
    const ticket = await prepare({ key }).expect(201);
    await makeStagingDue(ticket.body.uploadId);
    await cleanup.expireBatch();
    expect((await prepare({ key }).expect(409)).body.code).toBe(
      'UPLOAD_EXPIRED',
    );
    expect((await complete(ticket.body.uploadId).expect(409)).body.code).toBe(
      'UPLOAD_EXPIRED',
    );
    await prepare().expect(201);
  });
  it('storage outage keeps intent retryable with the same key', async () => {
    const ticket = await prepare().expect(201);
    await storage.put(ticket.body, bytes);
    const key = randomUUID();
    storage.failRead = true;
    expect(
      (await complete(ticket.body.uploadId, manager, key).expect(503)).body
        .code,
    ).toBe('ATTACHMENT_STORAGE_UNAVAILABLE');
    storage.failRead = false;
    const file = await complete(ticket.body.uploadId, manager, key).expect(200);
    const row = await db.workOrderAttachment.findUniqueOrThrow({
      where: { id: file.body.id },
    });
    await storage.inner.remove(row.storageKey);
    expect(
      (
        await request(app.getHttpServer())
          .get(`/attachments/${file.body.id}/download`)
          .auth(manager, { type: 'bearer' })
          .expect(503)
      ).body.code,
    ).toBe('ATTACHMENT_STORAGE_UNAVAILABLE');
    expect((await list().expect(200)).body.total).toBe(1);
  });
  it('retains cleanup work when DB commit fails after final object write and converges on retry', async () => {
    const ticket = await prepare().expect(201);
    await storage.put(ticket.body, bytes);
    const failing = jest
      .spyOn(repo, 'commit')
      .mockRejectedValueOnce(new Error('Injected DB commit outage'));
    await complete(ticket.body.uploadId).expect(500);
    failing.mockRestore();
    expect(
      await db.attachmentCleanupJob.count({
        where: { tenantId, kind: 'FINAL', status: 'PENDING' },
      }),
    ).toBe(1);
    expect((await list().expect(200)).body.total).toBe(0);
    await complete(ticket.body.uploadId).expect(200);
  });
  it('cleanup reclaims an expired claim after restart and ignores a stale acknowledgment', async () => {
    const ticket = await prepare().expect(201);
    await storage.put(ticket.body, bytes);
    await makeStagingDue(ticket.body.uploadId);
    const first = (await cleanup.claim())!;
    await db.attachmentCleanupJob.update({
      where: { id: first.id },
      data: { leaseExpiresAt: new Date(0) },
    });
    const restarted = new AttachmentCleanupRepository(repo);
    const second = (await restarted.claim())!;
    expect(second.claimId).not.toBe(first.claimId);
    await cleanup.done(first);
    expect(
      (
        await db.attachmentCleanupJob.findUniqueOrThrow({
          where: { id: second.id },
        })
      ).status,
    ).toBe('CLAIMED');
    expect(await restarted.authorizeRemoval(second)).toBe(true);
    await storage.remove(second.objectKey);
    await restarted.done(second);
  });
  it('cleanup failure survives worker restart; retry eventually removes deleted final bytes', async () => {
    const file = await attached();
    const final = await db.workOrderAttachment.findUniqueOrThrow({
      where: { id: file.id },
    });
    await request(app.getHttpServer())
      .delete(`/attachments/${file.id}`)
      .auth(manager, { type: 'bearer' })
      .expect(204);
    storage.failRemove = true;
    await app.get(AttachmentCleanupService).tick();
    const pending = await db.attachmentCleanupJob.findUniqueOrThrow({
      where: { objectKey: final.storageKey },
    });
    expect(pending.status).toBe('PENDING');
    expect(pending.attemptCount).toBe(1);
    storage.failRemove = false;
    await db.attachmentCleanupJob.update({
      where: { id: pending.id },
      data: { notBefore: new Date(0) },
    });
    const restarted = new AttachmentCleanupService(
      new AttachmentCleanupRepository(repo),
      storage,
      app.get(ConfigService),
    );
    await restarted.tick();
    expect(
      (
        await db.attachmentCleanupJob.findUniqueOrThrow({
          where: { id: pending.id },
        })
      ).status,
    ).toBe('DONE');
    await expect(storage.inner.read(final.storageKey)).rejects.toThrow();
  });
  it('cleanup never deletes a live final file even when a job is incorrectly requeued', async () => {
    const file = await attached();
    const final = await db.workOrderAttachment.findUniqueOrThrow({
      where: { id: file.id },
    });
    await db.attachmentCleanupJob.update({
      where: { objectKey: final.storageKey },
      data: { status: 'PENDING', completedAt: null, notBefore: new Date(0) },
    });
    const job = (await cleanup.claim())!;
    expect(await cleanup.authorizeRemoval(job)).toBe(false);
    expect(await storage.inner.read(final.storageKey)).toEqual(bytes);
  });
  it('cleanup fences abandoned attempt; delayed finalizer cannot commit or delete a later successful attempt', async () => {
    const ticket = await prepare().expect(201);
    await storage.put(ticket.body, bytes);
    let oldAttempt:
      Awaited<ReturnType<typeof repo.begin>>['upload'] | undefined;
    const begin = jest.spyOn(repo, 'begin');
    storage.afterWrite = async () => {
      oldAttempt = await db.attachmentUploadIntent.findUniqueOrThrow({
        where: { id: ticket.body.uploadId },
      });
      await db.attachmentUploadIntent.update({
        where: { id: ticket.body.uploadId },
        data: { leaseExpiresAt: new Date(0) },
      });
      await db.attachmentCleanupJob.update({
        where: { objectKey: oldAttempt.attemptFinalKey! },
        data: { notBefore: new Date(0) },
      });
      const job = (await cleanup.claim())!;
      expect(await cleanup.authorizeRemoval(job)).toBe(true);
      await storage.remove(job.objectKey);
      await cleanup.done(job);
    };
    await complete(ticket.body.uploadId).expect(409);
    begin.mockRestore();
    storage.afterWrite = undefined;
    const final = await complete(ticket.body.uploadId).expect(200);
    expect(await db.workOrderAttachment.count({ where: { tenantId } })).toBe(1);
    expect(
      (
        await db.workOrderAttachment.findUniqueOrThrow({
          where: { id: final.body.id },
        })
      ).storageKey,
    ).not.toBe(oldAttempt!.attemptFinalKey);
  });
  it('counts attached files and pending slots together while finalize preserves a full quota', async () => {
    const first = await prepare().expect(201);
    for (let i = 1; i < 10; i++) await prepare().expect(201);
    await storage.put(first.body, bytes);
    await complete(first.body.uploadId).expect(200);
    expect((await prepare().expect(409)).body.code).toBe(
      'ATTACHMENT_LIMIT_REACHED',
    );
    expect(
      await db.attachmentUploadIntent.count({
        where: { tenantId, status: 'INITIATED' },
      }),
    ).toBe(9);
    expect(await db.workOrderAttachment.count({ where: { tenantId } })).toBe(1);
  });
  it('scopes PREPARE identity across WO and report targets, not separately per endpoint', async () => {
    const key = randomUUID();
    await prepare({ key }).expect(201);
    await submittedReport();
    expect((await prepare({ key, report: true }).expect(409)).body.code).toBe(
      'IDEMPOTENCY_KEY_REUSED',
    );
  });
  it('rejects an oversized actual object even if declared size is small', async () => {
    const ticket = await prepare().expect(201);
    const oversized = Buffer.alloc(10_485_761);
    bytes.copy(oversized);
    await storage.put(ticket.body, oversized);
    expect((await complete(ticket.body.uploadId).expect(422)).body.code).toBe(
      'UPLOAD_VERIFICATION_FAILED',
    );
    expect((await list().expect(200)).body.total).toBe(0);
  });
  it('defers cleanup of a final key owned by a live finalize lease', async () => {
    const ticket = await prepare().expect(201);
    await storage.put(ticket.body, bytes);
    storage.afterWrite = async () => {
      const upload = await db.attachmentUploadIntent.findUniqueOrThrow({
        where: { id: ticket.body.uploadId },
      });
      await db.attachmentCleanupJob.update({
        where: { objectKey: upload.attemptFinalKey! },
        data: { notBefore: new Date(0) },
      });
      const job = (await cleanup.claim())!;
      expect(await cleanup.authorizeRemoval(job)).toBe(false);
      expect(await storage.inner.read(upload.attemptFinalKey!)).toEqual(bytes);
    };
    await complete(ticket.body.uploadId).expect(200);
  });
  it('keeps unverified legacy rows out of list/count/download without inventing metadata', async () => {
    const legacy = await db.workOrderAttachment.create({
      data: {
        tenantId,
        workOrderId: orderId,
        uploadedBy: actorId,
        storageKey: 'legacy-fixture-only',
        fileName: 'legacy.png',
        mimeType: 'image/png',
      },
    });
    expect((await list().expect(200)).body.total).toBe(0);
    await request(app.getHttpServer())
      .get(`/attachments/${legacy.id}/download`)
      .auth(manager, { type: 'bearer' })
      .expect(404);
    expect(
      (
        await db.workOrderAttachment.findUniqueOrThrow({
          where: { id: legacy.id },
        })
      ).sizeBytes,
    ).toBeNull();
  });
  it('does not acknowledge deletion of verified legacy metadata without durable cleanup ownership', async () => {
    const legacy = await db.workOrderAttachment.create({
      data: {
        tenantId,
        workOrderId: orderId,
        uploadedBy: actorId,
        storageKey: 'legacy-no-cleanup-fixture',
        fileName: 'legacy.png',
        mimeType: 'image/png',
        sizeBytes: bytes.length,
        checksumSha256: metadata.checksumSha256,
        verifiedAt: new Date(),
      },
    });
    expect(
      (
        await request(app.getHttpServer())
          .delete(`/attachments/${legacy.id}`)
          .auth(manager, { type: 'bearer' })
          .expect(503)
      ).body.code,
    ).toBe('ATTACHMENT_STORAGE_UNAVAILABLE');
    expect(
      (
        await db.workOrderAttachment.findUniqueOrThrow({
          where: { id: legacy.id },
        })
      ).deletedAt,
    ).toBeNull();
  });
  it('reconciliation requeues a late PUT after an earlier DONE cleanup without touching unknown objects', async () => {
    const ticket = await prepare().expect(201);
    await makeStagingDue(ticket.body.uploadId);
    const job = (await cleanup.claim())!;
    expect(await cleanup.authorizeRemoval(job)).toBe(true);
    await storage.remove(job.objectKey);
    await cleanup.done(job);
    await storage.put(ticket.body, bytes);
    expect(await cleanup.reconcile(job.objectKey)).toBe(true);
    const replay = (await cleanup.claim())!;
    expect(await cleanup.authorizeRemoval(replay)).toBe(true);
    await storage.remove(replay.objectKey);
    await cleanup.done(replay);
    expect(await cleanup.reconcile('workorder-attachments/unknown')).toBe(
      false,
    );
  });
});

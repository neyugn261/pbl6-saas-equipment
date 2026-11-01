import { randomUUID } from 'node:crypto';
import { createPrismaAdapter } from '@pbl6/service-kit/prisma';
import { PrismaClient, Prisma } from '../../src/generated/prisma/client.js';
import { testDatabaseUrl } from './support/test-env';

// Persistence only: real PostgreSQL constraints, no claimed HTTP/storage coverage.
describe('M3-A1 attachment persistence constraints', () => {
  const db = new PrismaClient({
    adapter: createPrismaAdapter(testDatabaseUrl()),
  });
  const tenantId = randomUUID();
  const actorId = randomUUID();
  const hash = 'a'.repeat(64);
  let orderId: string;
  let otherOrderId: string;
  let reportId: string;

  beforeAll(async () => {
    await db.$connect();
  });
  afterAll(async () => {
    // Remove only this suite's fixtures, in FK order. Other suites keep their
    // existing dedicated-test-DB truncation behavior.
    await db.attachmentCleanupJob.deleteMany({ where: { tenantId } });
    await db.attachmentIdempotency.deleteMany({ where: { tenantId } });
    await db.attachmentUploadIntent.deleteMany({ where: { tenantId } });
    await db.reportAttachment.deleteMany({ where: { tenantId } });
    await db.workOrderAttachment.deleteMany({ where: { tenantId } });
    await db.serviceReport.deleteMany({ where: { tenantId } });
    await db.workOrder.deleteMany({ where: { tenantId } });
    await db.technician.deleteMany({ where: { tenantId } });
    await db.$disconnect();
  });
  beforeEach(async () => {
    const createOrder = () =>
      db.workOrder.create({
        data: {
          tenantId,
          workOrderNo: `WO-A1-${randomUUID()}`,
          serviceRequestId: randomUUID(),
          equipmentId: randomUUID(),
          customerId: randomUUID(),
          type: 'REPAIR',
          title: 'A1 SQL fixture',
          status: 'COMPLETED',
        },
      });
    orderId = (await createOrder()).id;
    otherOrderId = (await createOrder()).id;
    const technician = await db.technician.create({
      data: {
        tenantId,
        userId: randomUUID(),
        branchId: randomUUID(),
        employeeCode: `A1-${randomUUID()}`,
      },
    });
    reportId = (
      await db.serviceReport.create({
        data: {
          tenantId,
          workOrderId: orderId,
          technicianId: technician.id,
          problemDescription: 'Fixture',
          solution: 'Fixture',
          result: 'RESOLVED',
        },
      })
    ).id;
  });

  const attachment = (
    data: Partial<Prisma.WorkOrderAttachmentUncheckedCreateInput> = {},
  ) =>
    db.workOrderAttachment.create({
      data: {
        tenantId,
        workOrderId: orderId,
        uploadedBy: actorId,
        storageKey: `a1/final/${randomUUID()}`,
        fileName: 'evidence.jpg',
        mimeType: 'image/jpeg',
        ...data,
      },
    });
  const intent = (
    data: Partial<Prisma.AttachmentUploadIntentUncheckedCreateInput> = {},
  ) =>
    db.attachmentUploadIntent.create({
      data: {
        tenantId,
        uploadedBy: actorId,
        targetType: 'WORK_ORDER',
        workOrderId: orderId,
        fileName: 'evidence.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 4096,
        checksumSha256: hash,
        stagingKey: `a1/staging/${randomUUID()}`,
        expiresAt: new Date(Date.now() + 300_000),
        ...data,
      },
    });
  const expectConstraint = async (
    operation: Promise<unknown>,
    name: string,
  ) => {
    await expect(operation).rejects.toThrow(name);
  };

  it('preserves legacy metadata as a NULL tuple and INTERNAL default', async () => {
    expect(await attachment()).toMatchObject({
      sizeBytes: null,
      checksumSha256: null,
      verifiedAt: null,
      deletedAt: null,
      visibility: 'INTERNAL',
    });
  });
  it.each([0, 10_485_761])(
    'rejects verified attachment size %i',
    async (sizeBytes) => {
      await expectConstraint(
        attachment({ sizeBytes, checksumSha256: hash, verifiedAt: new Date() }),
        'wo_attachment_verified_check',
      );
    },
  );
  it('rejects partial verification metadata rather than fabricating legacy values', async () => {
    await expectConstraint(
      attachment({ sizeBytes: 1 }),
      'wo_attachment_verified_check',
    );
    await expectConstraint(
      attachment({
        sizeBytes: 1,
        checksumSha256: 'A'.repeat(64),
        verifiedAt: new Date(),
      }),
      'wo_attachment_verified_check',
    );
  });
  it('enforces deletion and visibility actor/time pairs', async () => {
    await expectConstraint(
      attachment({ deletedAt: new Date() }),
      'wo_attachment_deleted_check',
    );
    await expectConstraint(
      attachment({ visibilityChangedBy: actorId }),
      'wo_attachment_visibility_audit_check',
    );
  });
  it('applies verification checks to report attachments too', async () => {
    await expectConstraint(
      db.reportAttachment.create({
        data: {
          tenantId,
          serviceReportId: reportId,
          uploadedBy: actorId,
          storageKey: `a1/final/${randomUUID()}`,
          fileName: 'report.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 0,
          checksumSha256: hash,
          verifiedAt: new Date(),
        },
      }),
      'report_attachment_verified_check',
    );
  });
  it('rejects another tenant parent and cleanup references', async () => {
    await expect(intent({ tenantId: randomUUID() })).rejects.toMatchObject({
      code: 'P2003',
    });
    const upload = await intent();
    await expect(
      db.attachmentCleanupJob.create({
        data: {
          tenantId: randomUUID(),
          uploadId: upload.id,
          kind: 'STAGING',
          objectKey: `a1/staging/${randomUUID()}`,
          notBefore: upload.expiresAt,
        },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
  });
  it('requires exactly the target shape and a report from the same WO', async () => {
    await expectConstraint(
      intent({ targetType: 'REPORT' }),
      'attachment_upload_target_check',
    );
    await expectConstraint(
      intent({ serviceReportId: reportId }),
      'attachment_upload_target_check',
    );
    await expect(
      intent({
        targetType: 'REPORT',
        serviceReportId: reportId,
        workOrderId: otherOrderId,
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
    expect(
      await intent({ targetType: 'REPORT', serviceReportId: reportId }),
    ).toMatchObject({ reportAttachmentId: null });
  });
  it.each([
    { sizeBytes: 0 },
    { sizeBytes: 10_485_761 },
    { checksumSha256: 'x'.repeat(64) },
    { mimeType: 'text/html' },
    { visibility: 'PUBLIC' },
    { expiresAt: new Date(0) },
  ])('rejects invalid intent metadata %j', async (data) => {
    await expectConstraint(intent(data), 'attachment_upload_file_check');
  });
  it('requires a result only in ATTACHED and ties it to the exact parent', async () => {
    await expectConstraint(
      intent({ status: 'ATTACHED', attachedAt: new Date() }),
      'attachment_upload_phase_check',
    );
    const other = await attachment({ workOrderId: otherOrderId });
    await expect(
      intent({
        status: 'ATTACHED',
        attachedAt: new Date(),
        workOrderAttachmentId: other.id,
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
    const row = await attachment({
      sizeBytes: 4096,
      checksumSha256: hash,
      verifiedAt: new Date(),
    });
    await expectConstraint(
      intent({ workOrderAttachmentId: row.id }),
      'attachment_upload_phase_check',
    );
    expect(
      await intent({
        status: 'ATTACHED',
        attachedAt: new Date(),
        workOrderAttachmentId: row.id,
      }),
    ).toMatchObject({
      status: 'ATTACHED',
      workOrderAttachmentId: row.id,
    });
  });
  it('does not permit a partial lease or a lease on an expired intent', async () => {
    await expectConstraint(
      intent({ attemptId: randomUUID() }),
      'attachment_upload_attempt_check',
    );
    await expectConstraint(
      intent({
        status: 'EXPIRED',
        attemptId: randomUUID(),
        attemptFinalKey: `a1/final/${randomUUID()}`,
        leaseExpiresAt: new Date(Date.now() + 120_000),
      }),
      'attachment_upload_attempt_check',
    );
  });
  it('binds key scope across parents but permits independent operations', async () => {
    const first = await intent();
    const second = await intent({ workOrderId: otherOrderId });
    const data = {
      tenantId,
      userId: actorId,
      operation: 'PREPARE',
      key: randomUUID(),
      fingerprint: hash,
    };
    const outcomes = await Promise.allSettled([
      db.attachmentIdempotency.create({
        data: { ...data, uploadId: first.id },
      }),
      db.attachmentIdempotency.create({
        data: { ...data, uploadId: second.id },
      }),
    ]);
    expect(
      outcomes.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    const failure = outcomes.find((result) => result.status === 'rejected');
    expect(failure).toMatchObject({
      status: 'rejected',
      reason: { code: 'P2002' },
    });
    await expect(
      db.attachmentIdempotency.create({
        data: { ...data, operation: 'FINALIZE', uploadId: first.id },
      }),
    ).resolves.toMatchObject({ operation: 'FINALIZE' });
  });
  it('prevents another actor from owning a key binding to the uploader intent', async () => {
    const upload = await intent();
    await expect(
      db.attachmentIdempotency.create({
        data: {
          tenantId,
          userId: randomUUID(),
          operation: 'PREPARE',
          key: randomUUID(),
          fingerprint: hash,
          uploadId: upload.id,
        },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
    await expectConstraint(
      db.attachmentIdempotency.create({
        data: {
          tenantId,
          userId: actorId,
          operation: 'DELETE',
          key: randomUUID(),
          fingerprint: hash,
          uploadId: upload.id,
        },
      }),
      'attachment_idempotency_operation_check',
    );
  });
  it('requires cleanup kind/attempt and claim-token/lease pairs; DONE can be requeued', async () => {
    const upload = await intent();
    const data = {
      tenantId,
      uploadId: upload.id,
      objectKey: `a1/final/${randomUUID()}`,
      notBefore: upload.expiresAt,
    };
    await expectConstraint(
      db.attachmentCleanupJob.create({ data: { ...data, kind: 'FINAL' } }),
      'attachment_cleanup_kind_check',
    );
    const job = await db.attachmentCleanupJob.create({
      data: { ...data, kind: 'FINAL', attemptId: randomUUID() },
    });
    await expectConstraint(
      db.attachmentCleanupJob.update({
        where: { id: job.id },
        data: { status: 'CLAIMED', claimId: randomUUID() },
      }),
      'attachment_cleanup_phase_check',
    );
    await db.attachmentCleanupJob.update({
      where: { id: job.id },
      data: {
        status: 'CLAIMED',
        claimId: randomUUID(),
        leaseExpiresAt: new Date(),
      },
    });
    await db.attachmentCleanupJob.update({
      where: { id: job.id },
      data: {
        status: 'DONE',
        claimId: null,
        leaseExpiresAt: null,
        completedAt: new Date(),
      },
    });
    expect(
      await db.attachmentCleanupJob.update({
        where: { id: job.id },
        data: { status: 'PENDING', completedAt: null },
      }),
    ).toMatchObject({ status: 'PENDING' });
  });
});

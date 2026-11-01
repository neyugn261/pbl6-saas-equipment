import { randomUUID } from 'node:crypto';
import { ConflictException, Injectable } from '@nestjs/common';
import { requireTenantId, type Principal } from '@pbl6/auth';
import { toPage, type PaginationQueryDto } from '@pbl6/service-kit';
import { PrismaService } from '../prisma/prisma.service';
import {
  Prisma,
  type AttachmentUploadIntent,
  type WorkOrderAttachment,
} from '../generated/prisma/client.js';
import {
  lockServiceRequest,
  workOrderInclude,
  workOrderScope,
} from '../work-orders/work-orders.repository';
import { lockMaintenanceTask } from '../common/maintenance-source';
import { conflict, missing } from '../common/errors';
import { sameUuid } from '../common/uuid';
import type { PrepareAttachmentDto } from './attachment.dto';
import { storageUnavailable } from './attachment-storage';
import {
  assertMutation,
  assertVisibility,
  ATTEMPT_LEASE_MS,
  CLEANUP_GRACE_MS,
  fingerprint,
  forbidden,
  MANAGED_PREFIX,
  UPLOAD_TTL_MS,
  type AttachmentParent,
  type AttachmentTarget,
} from './attachment.policy';

export type AttachmentTx = Prisma.TransactionClient;
export type AttachmentRecord = Omit<WorkOrderAttachment, 'workOrderId'> & {
  workOrderId: string;
  serviceReportId: string | null;
  targetType: AttachmentTarget;
};
export type FinalizeStart = {
  upload: AttachmentUploadIntent;
  attachment?: AttachmentRecord;
};
export const attachmentView = (row: AttachmentRecord) => ({
  id: row.id,
  fileName: row.fileName,
  mimeType: row.mimeType,
  sizeBytes: row.sizeBytes!,
  visibility: row.visibility,
  uploadedBy: row.uploadedBy,
  createdAt: row.createdAt,
});
const activeMetadata = { deletedAt: null, verifiedAt: { not: null } };
const clearAttempt = {
  attemptId: null,
  attemptFinalKey: null,
  leaseExpiresAt: null,
};

@Injectable()
export class AttachmentsRepository {
  constructor(readonly db: PrismaService) {}

  async withParent<T>(
    p: Principal | undefined,
    tenantId: string,
    orderId: string,
    type: AttachmentTarget,
    callback: (
      tx: AttachmentTx,
      parent: AttachmentParent,
      now: Date,
    ) => Promise<T>,
  ): Promise<T> {
    return this.db.$transaction(
      async (tx) => {
        const scope = p ? workOrderScope(p) : { tenantId };
        const source = await tx.workOrder.findFirst({
          where: { ...scope, id: orderId },
        });
        if (!source) throw missing('WORK_ORDER_NOT_FOUND');
        if (source.serviceRequestId)
          await lockServiceRequest(tx, tenantId, source.serviceRequestId);
        if (source.maintenanceTaskId)
          await lockMaintenanceTask(tx, source.maintenanceTaskId);
        await tx.$queryRaw`SELECT id FROM work_orders WHERE tenant_id = ${tenantId}::uuid AND id = ${orderId}::uuid FOR UPDATE`;
        const order = await tx.workOrder.findFirst({
          where: { ...scope, id: orderId },
          include: workOrderInclude,
        });
        if (!order) throw missing('WORK_ORDER_NOT_FOUND');
        const report =
          type === 'REPORT'
            ? await tx.serviceReport.findFirst({
                where: { tenantId, workOrderId: orderId },
                include: { technician: { select: { userId: true } } },
              })
            : null;
        if (type === 'REPORT' && !report)
          throw missing('SERVICE_REPORT_NOT_FOUND');
        return callback(tx, { order, report, type }, new Date());
      },
      { timeout: 20_000, maxWait: 5_000 },
    );
  }

  private async retryKeyRace<T>(action: () => Promise<T>) {
    try {
      return await action();
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
        return action();
      throw error;
    }
  }
  private async binding(
    tx: AttachmentTx,
    p: Principal,
    operation: string,
    key: string,
    hash: string,
    uploadId?: string,
  ) {
    const scope = {
      tenantId: requireTenantId(p),
      userId: p.userId,
      operation,
      key,
    };
    const existing = await tx.attachmentIdempotency.findUnique({
      where: { tenantId_userId_operation_key: scope },
    });
    if (existing && existing.fingerprint !== hash)
      throw conflict(
        'IDEMPOTENCY_KEY_REUSED',
        'Key belongs to a different target or payload',
      );
    if (!existing && uploadId)
      await tx.attachmentIdempotency.create({
        data: { ...scope, fingerprint: hash, uploadId },
      });
    return existing;
  }
  private assertIntentOpen(upload: AttachmentUploadIntent, now: Date) {
    if (upload.status === 'ABORTED')
      throw conflict('UPLOAD_ABORTED', 'Upload was aborted');
    if (upload.status === 'EXPIRED' || upload.expiresAt <= now)
      throw conflict('UPLOAD_EXPIRED', 'Upload intent expired');
  }
  private async result(tx: AttachmentTx, upload: AttachmentUploadIntent) {
    const row = await this.record(
      tx,
      upload.tenantId,
      upload.workOrderAttachmentId ??
        upload.reportAttachmentId ??
        '00000000-0000-4000-8000-000000000000',
    );
    this.assertLive(row);
    return row;
  }

  prepare(
    p: Principal,
    orderId: string,
    type: AttachmentTarget,
    input: PrepareAttachmentDto,
    key: string,
  ) {
    const tenantId = requireTenantId(p);
    return this.retryKeyRace(() =>
      this.withParent(p, tenantId, orderId, type, async (tx, parent, now) => {
        const hash = fingerprint([
          'v1',
          type,
          orderId,
          parent.report?.id ?? null,
          input.fileName,
          input.mimeType,
          input.sizeBytes,
          input.checksumSha256,
          input.visibility ?? 'INTERNAL',
        ]);
        const prior = await this.binding(tx, p, 'PREPARE', key, hash);
        if (prior) {
          const upload = await tx.attachmentUploadIntent.findUniqueOrThrow({
            where: { id: prior.uploadId },
          });
          if (upload.status === 'ATTACHED') {
            const row = await this.result(tx, upload);
            throw new ConflictException({
              code: 'UPLOAD_ALREADY_ATTACHED',
              message: 'Upload already attached',
              details: { attachmentId: row.id },
            });
          }
          this.assertIntentOpen(upload, now);
          assertMutation(p, parent);
          assertVisibility(p, input.visibility ?? 'INTERNAL');
          return upload;
        }
        assertMutation(p, parent);
        assertVisibility(p, input.visibility ?? 'INTERNAL');
        const attached =
          type === 'WORK_ORDER'
            ? await tx.workOrderAttachment.count({
                where: { tenantId, workOrderId: orderId, deletedAt: null },
              })
            : await tx.reportAttachment.count({
                where: {
                  tenantId,
                  serviceReportId: parent.report!.id,
                  deletedAt: null,
                },
              });
        const pending = await tx.attachmentUploadIntent.count({
          where: {
            tenantId,
            workOrderId: orderId,
            targetType: type,
            status: 'INITIATED',
            expiresAt: { gt: now },
          },
        });
        if (attached + pending >= 10)
          throw conflict(
            'ATTACHMENT_LIMIT_REACHED',
            'Parent already has ten attachment slots',
          );
        const id = randomUUID();
        const upload = await tx.attachmentUploadIntent.create({
          data: {
            id,
            tenantId,
            uploadedBy: p.userId,
            targetType: type,
            workOrderId: orderId,
            serviceReportId: parent.report?.id ?? null,
            fileName: input.fileName,
            mimeType: input.mimeType,
            sizeBytes: input.sizeBytes,
            checksumSha256: input.checksumSha256,
            visibility: input.visibility ?? 'INTERNAL',
            stagingKey: `${MANAGED_PREFIX}${tenantId}/staging/${id}`,
            expiresAt: new Date(now.getTime() + UPLOAD_TTL_MS),
            createdAt: now,
          },
        });
        await this.binding(tx, p, 'PREPARE', key, hash, upload.id);
        await tx.attachmentCleanupJob.create({
          data: {
            tenantId,
            uploadId: id,
            kind: 'STAGING',
            objectKey: upload.stagingKey,
            notBefore: new Date(upload.expiresAt.getTime() + CLEANUP_GRACE_MS),
          },
        });
        return upload;
      }),
    );
  }

  private async ownedUpload(p: Principal, id: string, managerAllowed = false) {
    const row = await this.db.attachmentUploadIntent.findFirst({
      where: {
        id,
        tenantId: requireTenantId(p),
        ...(managerAllowed && p.permissions.has('work_order:manage')
          ? {}
          : { uploadedBy: p.userId }),
      },
    });
    if (!row) throw missing('UPLOAD_NOT_FOUND');
    return row;
  }
  private async lockUpload(tx: AttachmentTx, id: string) {
    await tx.$queryRaw`SELECT id FROM attachment_upload_intents WHERE id = ${id}::uuid FOR UPDATE`;
    return tx.attachmentUploadIntent.findUniqueOrThrow({ where: { id } });
  }
  async begin(p: Principal, id: string, key: string): Promise<FinalizeStart> {
    const source = await this.ownedUpload(p, id);
    return this.retryKeyRace(() =>
      this.withParent(
        p,
        source.tenantId,
        source.workOrderId,
        source.targetType as AttachmentTarget,
        async (tx, parent, now) => {
          const upload = await this.lockUpload(tx, id);
          await this.binding(
            tx,
            p,
            'FINALIZE',
            key,
            fingerprint(['v1', id]),
            id,
          );
          if (upload.status === 'ATTACHED')
            return { upload, attachment: await this.result(tx, upload) };
          this.assertIntentOpen(upload, now);
          assertMutation(p, parent);
          assertVisibility(p, upload.visibility);
          if (upload.leaseExpiresAt && upload.leaseExpiresAt > now)
            throw conflict(
              'UPLOAD_IN_PROGRESS',
              'Another finalize attempt is active',
            );
          const attemptId = randomUUID();
          const finalKey = `${MANAGED_PREFIX}${upload.tenantId}/final/${upload.id}/${attemptId}`;
          const lease = new Date(now.getTime() + ATTEMPT_LEASE_MS);
          await tx.attachmentCleanupJob.create({
            data: {
              tenantId: upload.tenantId,
              uploadId: id,
              kind: 'FINAL',
              objectKey: finalKey,
              attemptId,
              notBefore: new Date(lease.getTime() + CLEANUP_GRACE_MS),
            },
          });
          return {
            upload: await tx.attachmentUploadIntent.update({
              where: { id },
              data: {
                attemptId,
                attemptFinalKey: finalKey,
                leaseExpiresAt: lease,
              },
            }),
          };
        },
      ),
    );
  }

  async commit(p: Principal, attempt: AttachmentUploadIntent) {
    return this.withParent(
      p,
      attempt.tenantId,
      attempt.workOrderId,
      attempt.targetType as AttachmentTarget,
      async (tx, parent, now) => {
        const upload = await this.lockUpload(tx, attempt.id);
        if (upload.status === 'ATTACHED') return this.result(tx, upload);
        this.assertIntentOpen(upload, now);
        assertMutation(p, parent);
        assertVisibility(p, upload.visibility);
        if (
          !sameUuid(upload.uploadedBy, p.userId) ||
          upload.attemptId !== attempt.attemptId ||
          !upload.leaseExpiresAt ||
          upload.leaseExpiresAt <= now
        )
          throw conflict(
            'UPLOAD_IN_PROGRESS',
            'Finalize lease no longer belongs to this attempt',
          );
        const common = {
          tenantId: upload.tenantId,
          uploadedBy: p.userId,
          storageKey: upload.attemptFinalKey!,
          fileName: upload.fileName,
          mimeType: upload.mimeType,
          sizeBytes: upload.sizeBytes,
          checksumSha256: upload.checksumSha256,
          verifiedAt: now,
          visibility: upload.visibility,
        };
        const row =
          upload.targetType === 'WORK_ORDER'
            ? await tx.workOrderAttachment.create({
                data: { ...common, workOrderId: upload.workOrderId },
              })
            : await tx.reportAttachment.create({
                data: { ...common, serviceReportId: upload.serviceReportId! },
              });
        await tx.attachmentUploadIntent.update({
          where: { id: upload.id },
          data: {
            status: 'ATTACHED',
            attachedAt: now,
            ...clearAttempt,
            ...(upload.targetType === 'WORK_ORDER'
              ? { workOrderAttachmentId: row.id }
              : { reportAttachmentId: row.id }),
          },
        });
        await tx.attachmentCleanupJob.update({
          where: { objectKey: upload.attemptFinalKey! },
          data: {
            status: 'DONE',
            completedAt: now,
            claimId: null,
            leaseExpiresAt: null,
          },
        });
        await this.audit(tx, p, parent, row.id, 'ATTACHMENT_ATTACHED', {
          visibility: row.visibility,
        });
        return this.record(tx, upload.tenantId, row.id);
      },
    );
  }
  async release(attempt: AttachmentUploadIntent) {
    await this.withParent(
      undefined,
      attempt.tenantId,
      attempt.workOrderId,
      attempt.targetType as AttachmentTarget,
      async (tx) => {
        await tx.attachmentUploadIntent.updateMany({
          where: {
            id: attempt.id,
            status: 'INITIATED',
            attemptId: attempt.attemptId,
          },
          data: clearAttempt,
        });
      },
    );
  }

  async record(
    tx: AttachmentTx,
    tenantId: string,
    id: string,
  ): Promise<AttachmentRecord> {
    const [wo, report] = await Promise.all([
      tx.workOrderAttachment.findFirst({ where: { tenantId, id } }),
      tx.reportAttachment.findFirst({
        where: { tenantId, id },
        include: { serviceReport: { select: { workOrderId: true } } },
      }),
    ]);
    if ((!wo && !report) || (wo && report))
      throw missing('ATTACHMENT_NOT_FOUND');
    if (wo) return { ...wo, targetType: 'WORK_ORDER', serviceReportId: null };
    return {
      ...report!,
      workOrderId: report!.serviceReport.workOrderId,
      targetType: 'REPORT',
    };
  }
  assertLive(row: AttachmentRecord) {
    if (
      row.deletedAt ||
      !row.verifiedAt ||
      row.sizeBytes === null ||
      !row.checksumSha256
    )
      throw missing('ATTACHMENT_NOT_FOUND');
  }
  async withFile<T>(
    p: Principal,
    id: string,
    callback: (
      tx: AttachmentTx,
      parent: AttachmentParent,
      row: AttachmentRecord,
      now: Date,
    ) => Promise<T>,
  ) {
    const source = await this.record(this.db, requireTenantId(p), id);
    return this.withParent(
      p,
      source.tenantId,
      source.workOrderId,
      source.targetType,
      async (tx, parent, now) =>
        callback(tx, parent, await this.record(tx, source.tenantId, id), now),
    );
  }
  read(p: Principal, id: string) {
    return this.withFile(p, id, async (_tx, _parent, row) => {
      this.assertLive(row);
      return row;
    });
  }
  list(
    p: Principal,
    orderId: string,
    type: AttachmentTarget,
    query: PaginationQueryDto,
  ) {
    return this.withParent(
      p,
      requireTenantId(p),
      orderId,
      type,
      async (tx, parent) => {
        const where = { tenantId: requireTenantId(p), ...activeMetadata };
        const pagination = {
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
          orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }],
        };
        if (type === 'WORK_ORDER') {
          const filter = { ...where, workOrderId: orderId };
          const rows = await tx.workOrderAttachment.findMany({
            where: filter,
            ...pagination,
          });
          return toPage(
            rows.map((r) =>
              attachmentView({ ...r, serviceReportId: null, targetType: type }),
            ),
            await tx.workOrderAttachment.count({ where: filter }),
            query,
          );
        }
        const filter = { ...where, serviceReportId: parent.report!.id };
        const rows = await tx.reportAttachment.findMany({
          where: filter,
          ...pagination,
        });
        return toPage(
          rows.map((r) =>
            attachmentView({ ...r, workOrderId: orderId, targetType: type }),
          ),
          await tx.reportAttachment.count({ where: filter }),
          query,
        );
      },
    );
  }
  async visibility(
    p: Principal,
    id: string,
    visibility: 'INTERNAL' | 'CUSTOMER',
  ) {
    if (!p.permissions.has('work_order:manage')) throw forbidden();
    return this.withFile(p, id, async (tx, parent, row, now) => {
      this.assertLive(row);
      if (row.visibility === visibility) return row;
      const data = {
        visibility,
        visibilityChangedAt: now,
        visibilityChangedBy: p.userId,
      };
      if (row.targetType === 'WORK_ORDER')
        await tx.workOrderAttachment.update({ where: { id }, data });
      else await tx.reportAttachment.update({ where: { id }, data });
      await this.audit(tx, p, parent, id, 'ATTACHMENT_VISIBILITY', {
        previousVisibility: row.visibility,
        visibility,
      });
      return this.record(tx, row.tenantId, id);
    });
  }
  async delete(p: Principal, id: string) {
    return this.withFile(p, id, async (tx, parent, row, now) => {
      if (
        !p.permissions.has('work_order:manage') &&
        !sameUuid(p.userId, row.uploadedBy)
      )
        throw forbidden();
      if (row.deletedAt) return;
      this.assertLive(row);
      assertMutation(p, parent);
      const cleanupOwner = await tx.attachmentCleanupJob.findUnique({
        where: { objectKey: row.storageKey },
      });
      if (!cleanupOwner || cleanupOwner.tenantId !== row.tenantId)
        throw storageUnavailable();
      const data = { deletedAt: now, deletedBy: p.userId };
      if (row.targetType === 'WORK_ORDER')
        await tx.workOrderAttachment.update({ where: { id }, data });
      else await tx.reportAttachment.update({ where: { id }, data });
      await tx.attachmentCleanupJob.updateMany({
        where: { tenantId: row.tenantId, objectKey: row.storageKey },
        data: {
          status: 'PENDING',
          claimId: null,
          leaseExpiresAt: null,
          completedAt: null,
          notBefore: now,
        },
      });
      await this.audit(tx, p, parent, id, 'ATTACHMENT_DELETED', {});
    });
  }
  async abort(p: Principal, id: string) {
    const source = await this.ownedUpload(p, id, true);
    return this.withParent(
      p,
      source.tenantId,
      source.workOrderId,
      source.targetType as AttachmentTarget,
      async (tx, parent, now) => {
        const upload = await this.lockUpload(tx, id);
        if (upload.status === 'ATTACHED')
          throw conflict(
            'UPLOAD_ALREADY_ATTACHED',
            'Delete the attachment instead',
          );
        if (['ABORTED', 'EXPIRED'].includes(upload.status)) return;
        assertMutation(p, parent);
        await tx.attachmentUploadIntent.update({
          where: { id },
          data: {
            status: upload.expiresAt <= now ? 'EXPIRED' : 'ABORTED',
            ...clearAttempt,
          },
        });
      },
    );
  }
  private audit(
    tx: AttachmentTx,
    p: Principal,
    parent: AttachmentParent,
    id: string,
    eventType: string,
    detail: Record<string, string>,
  ) {
    return tx.workLog.create({
      data: {
        tenantId: requireTenantId(p),
        workOrderId: parent.order.id,
        actorUserId: p.userId,
        eventType,
        note: JSON.stringify({
          attachmentId: id,
          targetType: parent.type,
          ...detail,
        }),
      },
    });
  }
}

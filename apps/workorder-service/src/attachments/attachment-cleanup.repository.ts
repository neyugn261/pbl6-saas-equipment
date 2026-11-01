import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { AttachmentCleanupJob } from '../generated/prisma/client.js';
import {
  AttachmentsRepository,
  type AttachmentTx,
} from './attachments.repository';
import {
  ATTEMPT_LEASE_MS,
  MANAGED_PREFIX,
  type AttachmentTarget,
} from './attachment.policy';

@Injectable()
export class AttachmentCleanupRepository {
  constructor(private readonly repo: AttachmentsRepository) {}
  async expireBatch() {
    const rows = await this.repo.db.attachmentUploadIntent.findMany({
      where: { status: 'INITIATED', expiresAt: { lte: new Date() } },
      take: 100,
      orderBy: { expiresAt: 'asc' },
    });
    for (const row of rows)
      await this.repo.withParent(
        undefined,
        row.tenantId,
        row.workOrderId,
        row.targetType as AttachmentTarget,
        async (tx, _parent, now) => {
          await tx.attachmentUploadIntent.updateMany({
            where: { id: row.id, status: 'INITIATED', expiresAt: { lte: now } },
            data: {
              status: 'EXPIRED',
              attemptId: null,
              attemptFinalKey: null,
              leaseExpiresAt: null,
            },
          });
        },
      );
  }
  async claim() {
    return this.repo.db.$transaction(async (tx) => {
      const now = new Date();
      const rows = await tx.$queryRaw<
        { id: string }[]
      >`SELECT id FROM attachment_cleanup_jobs WHERE (status = 'PENDING' AND not_before <= ${now}) OR (status = 'CLAIMED' AND lease_expires_at <= ${now}) ORDER BY not_before, id FOR UPDATE SKIP LOCKED LIMIT 1`;
      if (!rows[0]) return null;
      return tx.attachmentCleanupJob.update({
        where: { id: rows[0].id },
        data: {
          status: 'CLAIMED',
          claimId: randomUUID(),
          leaseExpiresAt: new Date(now.getTime() + ATTEMPT_LEASE_MS),
          completedAt: null,
          attemptCount: { increment: 1 },
        },
      });
    });
  }
  private async live(tx: AttachmentTx, key: string) {
    return !!(
      (await tx.workOrderAttachment.findFirst({
        where: { storageKey: key, deletedAt: null },
        select: { id: true },
      })) ||
      (await tx.reportAttachment.findFirst({
        where: { storageKey: key, deletedAt: null },
        select: { id: true },
      }))
    );
  }
  async authorizeRemoval(job: AttachmentCleanupJob) {
    const source = await this.repo.db.attachmentUploadIntent.findUniqueOrThrow({
      where: { id: job.uploadId },
    });
    return this.repo.withParent(
      undefined,
      source.tenantId,
      source.workOrderId,
      source.targetType as AttachmentTarget,
      async (tx, _parent, now) => {
        await tx.$queryRaw`SELECT id FROM attachment_upload_intents WHERE id = ${source.id}::uuid FOR UPDATE`;
        const upload = await tx.attachmentUploadIntent.findUniqueOrThrow({
          where: { id: source.id },
        });
        await tx.$queryRaw`SELECT id FROM attachment_cleanup_jobs WHERE id = ${job.id}::uuid FOR UPDATE`;
        const current = await tx.attachmentCleanupJob.findUniqueOrThrow({
          where: { id: job.id },
        });
        if (
          current.status !== 'CLAIMED' ||
          current.claimId !== job.claimId ||
          !current.leaseExpiresAt ||
          current.leaseExpiresAt <= now
        )
          return false;
        if (await this.live(tx, job.objectKey)) {
          await tx.attachmentCleanupJob.update({
            where: { id: job.id },
            data: {
              status: 'DONE',
              completedAt: now,
              claimId: null,
              leaseExpiresAt: null,
              lastErrorCode: null,
            },
          });
          return false;
        }
        if (job.kind === 'STAGING') {
          if (job.objectKey !== upload.stagingKey)
            return this.defer(tx, job, now, 'OWNERSHIP_MISMATCH');
          const earliest = new Date(upload.expiresAt.getTime() + 60_000);
          if (earliest > now)
            return this.defer(tx, job, earliest, 'UPLOAD_URL_ACTIVE');
        } else {
          const expectedKey = `${MANAGED_PREFIX}${upload.tenantId}/final/${upload.id}/${job.attemptId}`;
          if (job.objectKey !== expectedKey)
            return this.defer(tx, job, now, 'OWNERSHIP_MISMATCH');
          if (
            upload.attemptFinalKey === job.objectKey &&
            upload.attemptId === job.attemptId
          ) {
            if (upload.leaseExpiresAt && upload.leaseExpiresAt > now)
              return this.defer(
                tx,
                job,
                new Date(upload.leaseExpiresAt.getTime() + 60_000),
                'FINALIZE_ACTIVE',
              );
            // Fence BEFORE DELETE; paused finalizers cannot commit this key later.
            await tx.attachmentUploadIntent.update({
              where: { id: upload.id },
              data: {
                attemptId: null,
                attemptFinalKey: null,
                leaseExpiresAt: null,
              },
            });
          }
        }
        return true;
      },
    );
  }
  private async defer(
    tx: AttachmentTx,
    job: AttachmentCleanupJob,
    until: Date,
    code: string,
  ) {
    await tx.attachmentCleanupJob.update({
      where: { id: job.id },
      data: {
        status: 'PENDING',
        claimId: null,
        leaseExpiresAt: null,
        notBefore: new Date(Math.max(until.getTime(), Date.now() + 5_000)),
        lastErrorCode: code,
      },
    });
    return false;
  }
  async done(job: AttachmentCleanupJob) {
    await this.repo.db.attachmentCleanupJob.updateMany({
      where: { id: job.id, status: 'CLAIMED', claimId: job.claimId },
      data: {
        status: 'DONE',
        claimId: null,
        leaseExpiresAt: null,
        completedAt: new Date(),
        lastErrorCode: null,
      },
    });
  }
  async failed(job: AttachmentCleanupJob) {
    const delay = Math.min(
      3_600_000,
      5_000 * 2 ** Math.min(10, Math.max(0, job.attemptCount - 1)),
    );
    await this.repo.db.attachmentCleanupJob.updateMany({
      where: { id: job.id, status: 'CLAIMED', claimId: job.claimId },
      data: {
        status: 'PENDING',
        claimId: null,
        leaseExpiresAt: null,
        notBefore: new Date(Date.now() + delay),
        lastErrorCode: 'ATTACHMENT_STORAGE_UNAVAILABLE',
      },
    });
  }
  async reconcile(key: string) {
    const job = await this.repo.db.attachmentCleanupJob.findUnique({
      where: { objectKey: key },
      include: { upload: true },
    });
    if (!job) return false; // Unknown objects need owner investigation, never guessed ownership.
    await this.repo.withParent(
      undefined,
      job.tenantId,
      job.upload.workOrderId,
      job.upload.targetType as AttachmentTarget,
      async (tx, _parent, now) => {
        if (await this.live(tx, key)) return;
        await tx.attachmentCleanupJob.updateMany({
          where: { id: job.id, status: 'DONE' },
          data: { status: 'PENDING', completedAt: null, notBefore: now },
        });
      },
    );
    return true;
  }
}

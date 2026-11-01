import { Inject, Injectable } from '@nestjs/common';
import type { Principal } from '@pbl6/auth';
import { createLogger, type PaginationQueryDto } from '@pbl6/service-kit';
import {
  ATTACHMENT_STORAGE,
  type AttachmentStorage,
  storageUnavailable,
} from './attachment-storage';
import {
  AttachmentsRepository,
  attachmentView,
} from './attachments.repository';
import type { PrepareAttachmentDto } from './attachment.dto';
import {
  validatePrepare,
  verifyBytes,
  type AttachmentTarget,
} from './attachment.policy';

@Injectable()
export class AttachmentsService {
  private readonly logger = createLogger('workorder-service');
  constructor(
    private readonly repo: AttachmentsRepository,
    @Inject(ATTACHMENT_STORAGE) private readonly storage: AttachmentStorage,
  ) {}
  async prepare(
    p: Principal,
    orderId: string,
    type: AttachmentTarget,
    input: PrepareAttachmentDto,
    key: string,
  ) {
    validatePrepare(input);
    if (!this.storage.enabled) throw storageUnavailable();
    const upload = await this.repo.prepare(
      p,
      orderId.toLowerCase(),
      type,
      input,
      key,
    );
    const ticket = await this.storage.ticket(
      upload.stagingKey,
      upload.mimeType,
      upload.expiresAt,
    );
    return {
      uploadId: upload.id,
      method: 'PUT',
      ...ticket,
      expiresAt: upload.expiresAt.toISOString(),
    };
  }
  async complete(p: Principal, id: string, key: string) {
    const started = await this.repo.begin(p, id.toLowerCase(), key);
    if (started.attachment) return attachmentView(started.attachment);
    try {
      const bytes = await this.storage.read(started.upload.stagingKey);
      verifyBytes(bytes, started.upload);
      await this.storage.write(
        started.upload.attemptFinalKey!,
        bytes,
        started.upload.mimeType,
      );
      return attachmentView(await this.repo.commit(p, started.upload));
    } catch (error) {
      // Cleanup was registered before I/O. Release is best effort; a DB outage
      // leaves the durable lease/job for the worker to recover after restart.
      await this.repo.release(started.upload).catch(() => {
        this.logger.warn({
          msg: 'Attachment attempt release deferred to lease recovery',
          code: 'ATTACHMENT_RELEASE_DEFERRED',
        });
      });
      throw error;
    }
  }
  list(
    p: Principal,
    id: string,
    type: AttachmentTarget,
    query: PaginationQueryDto,
  ) {
    return this.repo.list(p, id.toLowerCase(), type, query);
  }
  async download(p: Principal, id: string) {
    const row = await this.repo.read(p, id.toLowerCase());
    return this.storage.download(row.storageKey, row.fileName);
  }
  async visibility(
    p: Principal,
    id: string,
    visibility: 'INTERNAL' | 'CUSTOMER',
  ) {
    return attachmentView(
      await this.repo.visibility(p, id.toLowerCase(), visibility),
    );
  }
  abort(p: Principal, id: string) {
    return this.repo.abort(p, id.toLowerCase());
  }
  delete(p: Principal, id: string) {
    return this.repo.delete(p, id.toLowerCase());
  }
}

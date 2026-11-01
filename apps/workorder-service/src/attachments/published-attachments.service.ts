import {
  HttpException,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Principal } from '@pbl6/auth';
import type { PaginationQueryDto } from '@pbl6/service-kit';
import { missing } from '../common/errors';
import {
  ATTACHMENT_STORAGE,
  type AttachmentStorage,
} from './attachment-storage';
import { PublishedAttachmentsRepository } from './published-attachments.repository';

@Injectable()
export class PublishedAttachmentsService {
  constructor(
    private readonly repo: PublishedAttachmentsRepository,
    @Inject(ATTACHMENT_STORAGE) private readonly storage: AttachmentStorage,
  ) {}

  private async read<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof HttpException) throw error;
      // No false empty page or Prisma/SQL details in the upstream error/logs.
      throw new ServiceUnavailableException({
        code: 'ATTACHMENT_SOURCE_UNAVAILABLE',
        message: 'Published attachments are unavailable',
      });
    }
  }
  list(p: Principal, serviceRequestId: string, query: PaginationQueryDto) {
    return this.read(() =>
      this.repo.list(p, serviceRequestId.toLowerCase(), query),
    );
  }
  async download(p: Principal, serviceRequestId: string, attachmentId: string) {
    const srId = serviceRequestId.toLowerCase(),
      id = attachmentId.toLowerCase();
    const file = await this.read(() => this.repo.download(p, srId, id));
    const ticket = await this.storage.download(file.storageKey, file.fileName);
    // Storage HEAD/signing happens outside DB transactions. A hide/delete or
    // assignment change during I/O must not release the newly signed ticket.
    const current = await this.read(() => this.repo.download(p, srId, id));
    if (
      current.storageKey !== file.storageKey ||
      current.fileName !== file.fileName
    )
      throw missing('ATTACHMENT_NOT_FOUND');
    return { downloadUrl: ticket.downloadUrl, expiresAt: ticket.expiresAt };
  }
}

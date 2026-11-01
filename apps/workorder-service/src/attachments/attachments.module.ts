import { Module } from '@nestjs/common';
import { AttachmentsController } from './attachments.controller';
import { AttachmentsService } from './attachments.service';
import { AttachmentsRepository } from './attachments.repository';
import { ATTACHMENT_STORAGE } from './attachment-storage';
import { S3AttachmentStorage } from './s3-attachment.storage';
import { AttachmentCleanupRepository } from './attachment-cleanup.repository';
import { AttachmentCleanupService } from './attachment-cleanup.service';
import { AttachmentErrorInterceptor } from './attachment-error.interceptor';
import { PublishedAttachmentsController } from './published-attachments.controller';
import { PublishedAttachmentsRepository } from './published-attachments.repository';
import { PublishedAttachmentsService } from './published-attachments.service';

@Module({
  controllers: [AttachmentsController, PublishedAttachmentsController],
  providers: [
    AttachmentErrorInterceptor,
    PublishedAttachmentsRepository,
    PublishedAttachmentsService,
    AttachmentsService,
    AttachmentsRepository,
    S3AttachmentStorage,
    { provide: ATTACHMENT_STORAGE, useExisting: S3AttachmentStorage },
    AttachmentCleanupRepository,
    AttachmentCleanupService,
  ],
})
export class AttachmentsModule {}

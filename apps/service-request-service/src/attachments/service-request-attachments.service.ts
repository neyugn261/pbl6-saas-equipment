import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  UpstreamError,
  type Page,
  type PaginationQueryDto,
} from '@pbl6/service-kit';
import type { Principal } from '@pbl6/auth';
import { ServiceRequestsService } from '../service-requests/service-requests.service';
import {
  WORKORDER_ATTACHMENTS_CLIENT,
  type AttachmentDownloadTicket,
  type PublishedAttachment,
  type WorkOrderAttachmentsClient,
} from './workorder-attachments.client';

@Injectable()
export class ServiceRequestAttachmentsService {
  constructor(
    private readonly requests: ServiceRequestsService,
    @Inject(WORKORDER_ATTACHMENTS_CLIENT)
    private readonly workOrders: WorkOrderAttachmentsClient,
  ) {}

  async list(
    principal: Principal,
    requestId: string,
    query: PaginationQueryDto,
  ): Promise<Page<PublishedAttachment>> {
    await this.requests.authorizeResultAttachments(principal, requestId);
    try {
      return await this.workOrders.listPublished(
        requestId,
        principal.accessToken,
        query.page,
        query.pageSize,
      );
    } catch (error) {
      if (
        error instanceof UpstreamError &&
        error.status === 404 &&
        error.code === 'WORK_ORDER_NOT_FOUND'
      ) {
        return {
          items: [],
          page: query.page,
          pageSize: query.pageSize,
          total: 0,
        };
      }
      if (error instanceof UpstreamError && error.status === 503) {
        throw this.unavailable();
      }
      if (error instanceof UpstreamError && error.status === 403) {
        throw this.forbidden();
      }
      throw error;
    }
  }

  async download(
    principal: Principal,
    requestId: string,
    attachmentId: string,
  ): Promise<AttachmentDownloadTicket> {
    await this.requests.authorizeResultAttachments(principal, requestId);
    try {
      return await this.workOrders.downloadPublished(
        requestId,
        attachmentId,
        principal.accessToken,
      );
    } catch (error) {
      if (
        error instanceof UpstreamError &&
        error.status === 404 &&
        error.code === 'ATTACHMENT_NOT_FOUND'
      ) {
        throw new NotFoundException({
          code: 'ATTACHMENT_NOT_FOUND',
          message: 'Attachment not found',
        });
      }
      if (error instanceof UpstreamError && error.status === 503) {
        throw this.unavailable();
      }
      if (error instanceof UpstreamError && error.status === 403) {
        throw this.forbidden();
      }
      throw error;
    }
  }

  private unavailable(): ServiceUnavailableException {
    return new ServiceUnavailableException({
      code: 'UPSTREAM_UNAVAILABLE',
      message: 'Published files are unavailable',
    });
  }

  private forbidden(): ForbiddenException {
    return new ForbiddenException({
      code: 'FORBIDDEN',
      message: 'Forbidden',
    });
  }
}

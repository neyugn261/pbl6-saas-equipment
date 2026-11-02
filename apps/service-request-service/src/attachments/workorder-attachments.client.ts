import { BadGatewayException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isISO8601, isUUID } from 'class-validator';
import {
  ServiceHttpClient,
  UpstreamError,
  UpstreamUnavailableError,
  type Page,
} from '@pbl6/service-kit';
import type { AppEnv } from '../config/env.validation';

export const WORKORDER_ATTACHMENTS_CLIENT = Symbol(
  'WORKORDER_ATTACHMENTS_CLIENT',
);

export interface PublishedAttachment {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

export type PublishedAttachmentsPage = Page<PublishedAttachment>;

export interface AttachmentDownloadTicket {
  downloadUrl: string;
  expiresAt: string;
}

export interface WorkOrderAttachmentsClient {
  listPublished(
    serviceRequestId: string,
    accessToken: string,
    page: number,
    pageSize: number,
  ): Promise<PublishedAttachmentsPage>;
  downloadPublished(
    serviceRequestId: string,
    attachmentId: string,
    accessToken: string,
  ): Promise<AttachmentDownloadTicket>;
}

@Injectable()
export class HttpWorkOrderAttachmentsClient implements WorkOrderAttachmentsClient {
  private readonly http: ServiceHttpClient;

  constructor(config: ConfigService<AppEnv, true>) {
    this.http = new ServiceHttpClient({
      name: 'workorder-service',
      baseUrl: config.get('WORKORDER_SERVICE_URL', { infer: true }),
    });
  }

  async listPublished(
    serviceRequestId: string,
    accessToken: string,
    page: number,
    pageSize: number,
  ): Promise<PublishedAttachmentsPage> {
    const result = await this.read(
      `/internal/service-request-attachments/${serviceRequestId}`,
      { accessToken, query: { page, pageSize } },
    );
    if (
      !record(result) ||
      !Array.isArray(result.items) ||
      result.page !== page ||
      result.pageSize !== pageSize ||
      !integer(result.total, 0) ||
      result.items.length > pageSize ||
      result.total < result.items.length
    )
      throw invalidResponse();
    const items = result.items.map((item: unknown): PublishedAttachment => {
      if (
        !record(item) ||
        typeof item.id !== 'string' ||
        !isUUID(item.id) ||
        typeof item.fileName !== 'string' ||
        !item.fileName ||
        typeof item.mimeType !== 'string' ||
        !['image/jpeg', 'image/png', 'application/pdf'].includes(
          item.mimeType,
        ) ||
        !integer(item.sizeBytes, 1) ||
        item.sizeBytes > 10485760 ||
        !timestamp(item.createdAt)
      )
        throw invalidResponse();
      return {
        id: item.id,
        fileName: item.fileName,
        mimeType: item.mimeType,
        sizeBytes: item.sizeBytes,
        createdAt: item.createdAt,
      };
    });
    return { items, page, pageSize, total: result.total };
  }

  async downloadPublished(
    serviceRequestId: string,
    attachmentId: string,
    accessToken: string,
  ): Promise<AttachmentDownloadTicket> {
    const result = await this.read(
      `/internal/service-request-attachments/${serviceRequestId}/${attachmentId}/download`,
      { accessToken },
    );
    if (
      !record(result) ||
      typeof result.downloadUrl !== 'string' ||
      !timestamp(result.expiresAt) ||
      Date.parse(result.expiresAt) <= Date.now()
    )
      throw invalidResponse();
    let url: URL;
    try {
      url = new URL(result.downloadUrl);
    } catch {
      throw invalidResponse();
    }
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password
    )
      throw invalidResponse();
    return { downloadUrl: result.downloadUrl, expiresAt: result.expiresAt };
  }

  private async read(
    path: string,
    options: { accessToken: string; query?: Record<string, number> },
  ): Promise<unknown> {
    try {
      return await this.http.get<unknown>(path, options);
    } catch (error) {
      if (error instanceof UpstreamError) {
        // Only these codes affect the composition's 404 policy. Raw codes and
        // bodies must not enter the shared filter's exception-stack logging.
        const code =
          error.status === 404 &&
          ['WORK_ORDER_NOT_FOUND', 'ATTACHMENT_NOT_FOUND'].includes(
            error.code ?? '',
          )
            ? error.code
            : undefined;
        throw new UpstreamError(
          'workorder-service',
          error.status,
          code,
          undefined,
        );
      }
      // The shared client wraps fetch failures, but response.text() can also
      // fail after headers arrive. Keep both transport phases unavailable and
      // discard raw causes that could contain a signed URL.
      throw new UpstreamUnavailableError('workorder-service', undefined);
    }
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function integer(value: unknown, minimum: number): value is number {
  return (
    typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum
  );
}

function timestamp(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.includes('T') &&
    isISO8601(value, { strict: true })
  );
}

function invalidResponse(): BadGatewayException {
  // Never include the upstream payload: it may contain storage keys or signed URLs.
  return new BadGatewayException({
    code: 'UPSTREAM_ERROR',
    message: 'Published files source returned an invalid response',
  });
}

import {
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { UpstreamError } from '@pbl6/service-kit';
import type { Principal } from '@pbl6/auth';
import type { ServiceRequestsService } from '../service-requests/service-requests.service';
import { ServiceRequestAttachmentsService } from './service-request-attachments.service';
import type {
  PublishedAttachmentsPage,
  WorkOrderAttachmentsClient,
} from './workorder-attachments.client';

const REQUEST_ID = '00000000-0000-4000-8000-000000002001';
const ATTACHMENT_ID = '00000000-0000-4000-8000-000000002101';
const CUSTOMER_ID = '00000000-0000-4000-8000-000000000101';
const TENANT_ID = '00000000-0000-4000-8000-000000000001';

const customer: Principal = {
  userId: '00000000-0000-4000-8000-000000000301',
  sessionId: '00000000-0000-4000-8000-000000000401',
  tenantId: TENANT_ID,
  userType: 'CUSTOMER',
  roles: ['CUSTOMER_USER'],
  permissions: new Set(['service_request:read']),
  customerId: CUSTOMER_ID,
  accessToken: 'caller-token',
  expiresAt: new Date(Date.now() + 60_000),
};

const page: PublishedAttachmentsPage = {
  items: [
    {
      id: ATTACHMENT_ID,
      fileName: 'service-report.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 1024,
      createdAt: '2026-11-01T10:00:00.000Z',
    },
  ],
  page: 1,
  pageSize: 20,
  total: 1,
};

describe('ServiceRequestAttachmentsService', () => {
  let authorize: jest.Mock;
  let listPublished: jest.Mock;
  let downloadPublished: jest.Mock;
  let service: ServiceRequestAttachmentsService;

  beforeEach(() => {
    authorize = jest.fn().mockResolvedValue(undefined);
    listPublished = jest.fn().mockResolvedValue(page);
    downloadPublished = jest.fn().mockResolvedValue({
      downloadUrl: 'https://storage.example/file?sig=fixture',
      expiresAt: '2026-11-01T10:01:00.000Z',
    });
    const requests = {
      authorizeResultAttachments: authorize,
    } as unknown as ServiceRequestsService;
    const workOrders = {
      listPublished,
      downloadPublished,
    } as unknown as WorkOrderAttachmentsClient;
    service = new ServiceRequestAttachmentsService(requests, workOrders);
  });

  it('authorizes the SR before forwarding the caller token to the projection', async () => {
    await expect(
      service.list(customer, REQUEST_ID, { page: 2, pageSize: 10 }),
    ).resolves.toEqual(page);
    expect(authorize).toHaveBeenCalledWith(customer, REQUEST_ID);
    expect(listPublished).toHaveBeenCalledWith(
      REQUEST_ID,
      customer.accessToken,
      2,
      10,
    );
    expect(authorize.mock.invocationCallOrder[0]).toBeLessThan(
      listPublished.mock.invocationCallOrder[0],
    );
  });

  it('does not call Work Order when the caller cannot access the SR', async () => {
    authorize.mockRejectedValueOnce(new NotFoundException());

    await expect(
      service.list(customer, REQUEST_ID, { page: 1, pageSize: 20 }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(listPublished).not.toHaveBeenCalled();
  });

  it('maps only the authorized missing-WO list response to an empty page', async () => {
    listPublished.mockRejectedValueOnce(
      new UpstreamError('workorder-service', 404, 'WORK_ORDER_NOT_FOUND', {
        code: 'WORK_ORDER_NOT_FOUND',
      }),
    );

    await expect(
      service.list(customer, REQUEST_ID, { page: 2, pageSize: 10 }),
    ).resolves.toEqual({ items: [], page: 2, pageSize: 10, total: 0 });
  });

  it('does not turn a generic source 404 into an empty page', async () => {
    const error = new UpstreamError('workorder-service', 404, 'NOT_FOUND', {});
    listPublished.mockRejectedValueOnce(error);

    await expect(
      service.list(customer, REQUEST_ID, { page: 1, pageSize: 20 }),
    ).rejects.toBe(error);
  });

  it('returns unavailable instead of hiding a source outage as an empty page', async () => {
    listPublished.mockRejectedValueOnce(
      new UpstreamError(
        'workorder-service',
        503,
        'ATTACHMENT_SOURCE_UNAVAILABLE',
        {},
      ),
    );

    await expect(
      service.list(customer, REQUEST_ID, { page: 1, pageSize: 20 }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('keeps hidden or deleted attachment downloads as 404', async () => {
    downloadPublished.mockRejectedValueOnce(
      new UpstreamError('workorder-service', 404, 'ATTACHMENT_NOT_FOUND', {}),
    );

    await expect(
      service.download(customer, REQUEST_ID, ATTACHMENT_ID),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('preserves upstream authorization denial without revealing source details', async () => {
    downloadPublished.mockRejectedValueOnce(
      new UpstreamError('workorder-service', 403, 'FORBIDDEN', {
        secret: true,
      }),
    );

    await expect(
      service.download(customer, REQUEST_ID, ATTACHMENT_ID),
    ).rejects.toMatchObject({
      response: { code: 'FORBIDDEN', message: 'Forbidden' },
    });
  });

  it('keeps download source outages as unavailable', async () => {
    downloadPublished.mockRejectedValueOnce(
      new UpstreamError(
        'workorder-service',
        503,
        'ATTACHMENT_STORAGE_UNAVAILABLE',
        {},
      ),
    );

    await expect(
      service.download(customer, REQUEST_ID, ATTACHMENT_ID),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});

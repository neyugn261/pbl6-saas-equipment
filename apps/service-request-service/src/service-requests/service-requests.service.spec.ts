import { ConflictException, NotFoundException } from '@nestjs/common';
import type { PermissionCode, Principal } from '@pbl6/auth';
import type { ServiceRequest } from '../generated/prisma/client.js';
import type { PrismaService } from '../prisma/prisma.service';
import { FakeAssetClient } from '../asset/fake-asset.client';
import { ServiceRequestsService } from './service-requests.service';

const TENANT_ID = '00000000-0000-4000-8000-000000000001';
const CUSTOMER_ID = '00000000-0000-4000-8000-000000000101';
const USER_ID = '00000000-0000-4000-8000-000000000301';
const REQUEST_ID = '00000000-0000-4000-8000-000000002001';
const EQUIPMENT_ID = '00000000-0000-4000-8000-000000001101';

function principal(
  userType: 'TENANT_STAFF' | 'CUSTOMER' = 'TENANT_STAFF',
): Principal {
  return {
    userId: USER_ID,
    sessionId: '00000000-0000-4000-8000-000000000401',
    tenantId: TENANT_ID,
    userType,
    roles: [],
    permissions: new Set(['service_request:create', 'service_request:review']),
    customerId: userType === 'CUSTOMER' ? CUSTOMER_ID : null,
    accessToken: 'test-token',
    expiresAt: new Date(Date.now() + 60_000),
  };
}

function serviceRequest(
  overrides: Partial<ServiceRequest> = {},
): ServiceRequest {
  return {
    id: REQUEST_ID,
    tenantId: TENANT_ID,
    requestNo: 'SR-2026-0001',
    customerId: CUSTOMER_ID,
    equipmentId: EQUIPMENT_ID,
    requesterId: USER_ID,
    type: 'REPAIR',
    priority: 'NORMAL',
    title: 'Equipment stopped',
    description: 'The equipment no longer starts.',
    status: 'NEW',
    resolutionResult: null,
    resolutionSummary: null,
    resolvedWorkOrderNo: null,
    resolutionCompletedAt: null,
    activeWorkOrderId: null,
    warrantyCheckResult: null,
    warrantyId: null,
    warrantyEndDate: null,
    warrantyCheckedBy: null,
    warrantyCheckedAt: null,
    reviewStartedAt: null,
    resolvedAt: null,
    confirmedBy: null,
    confirmedAt: null,
    closedAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('ServiceRequestsService', () => {
  it('rejects invalid transitions without writing history or events', async () => {
    const row = serviceRequest({ status: 'CLOSED' });
    const tx = {
      $queryRawUnsafe: jest.fn().mockResolvedValue([{ id: REQUEST_ID }]),
      $executeRawUnsafe: jest.fn().mockResolvedValue(1),
      serviceRequest: {
        findFirst: jest.fn().mockResolvedValue(row),
        update: jest.fn(),
      },
      requestStatusHistory: { create: jest.fn() },
    };
    const prisma = {
      serviceRequest: { findFirst: jest.fn().mockResolvedValue(row) },
      $transaction: jest.fn(
        (work: (transaction: typeof tx) => Promise<unknown>) => work(tx),
      ),
    } as unknown as PrismaService;
    const service = new ServiceRequestsService(prisma, new FakeAssetClient());

    await expect(
      service.review(principal(), REQUEST_ID),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.serviceRequest.update).not.toHaveBeenCalled();
    expect(tx.requestStatusHistory.create).not.toHaveBeenCalled();
    expect(tx.$executeRawUnsafe).not.toHaveBeenCalled();
  });

  it('hides another customer request as not found', async () => {
    const tx = {
      $queryRawUnsafe: jest.fn().mockResolvedValue([]),
      serviceRequest: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const prisma = {
      serviceRequest: { findFirst: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn(
        (work: (transaction: typeof tx) => Promise<unknown>) => work(tx),
      ),
    } as unknown as PrismaService;
    const service = new ServiceRequestsService(prisma, new FakeAssetClient());

    await expect(
      service.internalReference(principal('CUSTOMER'), REQUEST_ID),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('derives the staff customer from equipment and defers warranty snapshot until review', async () => {
    const row = serviceRequest({ requestNo: 'SR-2026-0007' });
    const tx = {
      $queryRawUnsafe: jest.fn().mockResolvedValue([{ last_value: 7n }]),
      $executeRawUnsafe: jest.fn().mockResolvedValue(1),
      serviceRequest: {
        create: jest.fn().mockResolvedValue(row),
      },
      requestStatusHistory: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      $transaction: jest.fn(
        (work: (transaction: typeof tx) => Promise<unknown>) => work(tx),
      ),
      serviceRequest: { findFirst: jest.fn().mockResolvedValue(row) },
      costEstimate: { findFirst: jest.fn().mockResolvedValue(null) },
    } as unknown as PrismaService;
    const assets = new FakeAssetClient();
    assets.equipment.set(EQUIPMENT_ID, {
      id: EQUIPMENT_ID,
      customerId: CUSTOMER_ID,
      customerSiteId: '00000000-0000-4000-8000-000000000411',
      locationId: null,
      assetCode: 'DEMO-EQUIPMENT',
      status: 'ACTIVE',
    });
    assets.warranties.set(EQUIPMENT_ID, {
      equipmentId: EQUIPMENT_ID,
      date: '2026-10-21',
      result: 'IN_WARRANTY',
      warrantyId: '00000000-0000-4000-8000-000000001201',
      endDate: '2027-01-01',
    });
    const service = new ServiceRequestsService(prisma, assets);
    const warrantyLookup = jest.spyOn(assets, 'getWarrantyStatus');

    const result = await service.create(principal(), {
      equipmentId: EQUIPMENT_ID,
      type: 'REPAIR',
      title: 'Equipment stopped',
      description: 'The equipment no longer starts.',
    });

    expect(result.requestNo).toMatch(/^SR-\d{4}-0007$/);
    expect(result.warrantyCheck).toBeNull();
    expect(warrantyLookup).not.toHaveBeenCalled();
    expect(tx.serviceRequest.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: TENANT_ID,
        customerId: CUSTOMER_ID,
        equipmentId: EQUIPMENT_ID,
        requesterId: USER_ID,
      }),
    });
    expect(tx.serviceRequest.create.mock.calls[0][0].data).not.toHaveProperty(
      'warrantyCheckedBy',
    );
    expect(tx.$executeRawUnsafe.mock.calls.map((call) => call[5])).toEqual([
      'ServiceRequestCreated',
      'ServiceRequestStatusChanged',
    ]);
  });

  it('does not accept an out-of-warranty request before an estimate is approved', async () => {
    const row = serviceRequest({
      status: 'REVIEWING',
      warrantyCheckResult: 'OUT_OF_WARRANTY',
    });
    const tx = {
      $queryRawUnsafe: jest.fn().mockResolvedValue([{ id: REQUEST_ID }]),
      $executeRawUnsafe: jest.fn().mockResolvedValue(1),
      serviceRequest: {
        findFirst: jest.fn().mockResolvedValue(row),
        update: jest.fn(),
      },
      requestStatusHistory: { create: jest.fn() },
    };
    const prisma = {
      $transaction: jest.fn(
        (work: (transaction: typeof tx) => Promise<unknown>) => work(tx),
      ),
    } as unknown as PrismaService;
    const service = new ServiceRequestsService(prisma, new FakeAssetClient());

    await expect(service.accept(principal(), REQUEST_ID)).rejects.toMatchObject(
      {
        response: expect.objectContaining({ code: 'ESTIMATE_REQUIRED' }),
      },
    );
    expect(tx.serviceRequest.update).not.toHaveBeenCalled();
    expect(tx.requestStatusHistory.create).not.toHaveBeenCalled();
  });

  it('reviews and snapshots warranty atomically with the transition event', async () => {
    const initial = serviceRequest();
    const reviewing = serviceRequest({
      status: 'REVIEWING',
      warrantyCheckResult: 'OUT_OF_WARRANTY',
      warrantyId: '00000000-0000-4000-8000-000000001201',
      warrantyEndDate: new Date('2026-09-01T00:00:00.000Z'),
      warrantyCheckedBy: USER_ID,
      warrantyCheckedAt: new Date('2026-10-21T00:00:00.000Z'),
      reviewStartedAt: new Date('2026-10-21T00:00:00.000Z'),
    });
    const tx = {
      $queryRawUnsafe: jest.fn().mockResolvedValue([{ id: REQUEST_ID }]),
      $executeRawUnsafe: jest.fn().mockResolvedValue(1),
      serviceRequest: {
        findFirst: jest.fn().mockResolvedValue(initial),
        update: jest.fn().mockResolvedValue(reviewing),
      },
      requestStatusHistory: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      serviceRequest: { findFirst: jest.fn().mockResolvedValue(initial) },
      $transaction: jest.fn(
        (work: (transaction: typeof tx) => Promise<unknown>) => work(tx),
      ),
    } as unknown as PrismaService;
    const assets = new FakeAssetClient();
    assets.warranties.set(EQUIPMENT_ID, {
      equipmentId: EQUIPMENT_ID,
      date: '2026-10-21',
      result: 'OUT_OF_WARRANTY',
      warrantyId: '00000000-0000-4000-8000-000000001201',
      endDate: '2026-09-01',
    });
    const service = new ServiceRequestsService(prisma, assets);

    const result = await service.review(principal(), REQUEST_ID);

    expect(result.status).toBe('REVIEWING');
    expect(tx.serviceRequest.update).toHaveBeenCalledWith({
      where: { id: REQUEST_ID },
      data: expect.objectContaining({
        status: 'REVIEWING',
        warrantyCheckResult: 'OUT_OF_WARRANTY',
        warrantyId: '00000000-0000-4000-8000-000000001201',
        warrantyCheckedBy: USER_ID,
      }),
    });
    expect(tx.requestStatusHistory.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        oldStatus: 'NEW',
        newStatus: 'REVIEWING',
      }),
    });
    expect(tx.$executeRawUnsafe).toHaveBeenCalledTimes(1);
  });

  it('returns only the minimal scoped reference for internal callers', async () => {
    const request = serviceRequest();
    const prisma = {
      serviceRequest: { findFirst: jest.fn().mockResolvedValue(request) },
    } as unknown as PrismaService;
    const service = new ServiceRequestsService(prisma, new FakeAssetClient());

    await expect(
      service.internalReference(principal(), REQUEST_ID),
    ).resolves.toEqual({
      id: REQUEST_ID,
      requestNo: request.requestNo,
      status: request.status,
      title: request.title,
      customerId: CUSTOMER_ID,
      equipmentId: EQUIPMENT_ID,
      type: request.type,
      priority: request.priority,
    });
  });

  it('allows staff to cancel an ACCEPTED request', async () => {
    const accepted = serviceRequest({ status: 'ACCEPTED' });
    const cancelled = serviceRequest({ status: 'CANCELLED' });
    const tx = {
      $queryRawUnsafe: jest.fn().mockResolvedValue([{ id: REQUEST_ID }]),
      $executeRawUnsafe: jest.fn().mockResolvedValue(1),
      serviceRequest: {
        findFirst: jest.fn().mockResolvedValue(accepted),
        update: jest.fn().mockResolvedValue(cancelled),
      },
      requestStatusHistory: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      $transaction: jest.fn(
        (work: (transaction: typeof tx) => Promise<unknown>) => work(tx),
      ),
    } as unknown as PrismaService;
    const service = new ServiceRequestsService(prisma, new FakeAssetClient());

    await expect(
      service.cancel(principal(), REQUEST_ID),
    ).resolves.toMatchObject({ status: 'CANCELLED' });
    expect(tx.requestStatusHistory.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        oldStatus: 'ACCEPTED',
        newStatus: 'CANCELLED',
      }),
    });
  });

  it('requires cancelling the active work order before a PROCESSING request', async () => {
    const processing = serviceRequest({ status: 'PROCESSING' });
    const tx = {
      $queryRawUnsafe: jest.fn().mockResolvedValue([{ id: REQUEST_ID }]),
      serviceRequest: {
        findFirst: jest.fn().mockResolvedValue(processing),
        update: jest.fn(),
      },
      requestStatusHistory: { create: jest.fn() },
      $executeRawUnsafe: jest.fn(),
    };
    const prisma = {
      $transaction: jest.fn(
        (work: (transaction: typeof tx) => Promise<unknown>) => work(tx),
      ),
    } as unknown as PrismaService;
    const service = new ServiceRequestsService(prisma, new FakeAssetClient());

    await expect(service.cancel(principal(), REQUEST_ID)).rejects.toMatchObject(
      {
        response: expect.objectContaining({
          code: 'WORK_ORDER_CANCELLATION_REQUIRED',
          message: expect.stringContaining('active work order'),
        }),
      },
    );
    expect(tx.serviceRequest.update).not.toHaveBeenCalled();
    expect(tx.requestStatusHistory.create).not.toHaveBeenCalled();
    expect(tx.$executeRawUnsafe).not.toHaveBeenCalled();
  });

  it('never includes internal comments for CUSTOMER accounts', async () => {
    const customer = {
      ...principal('CUSTOMER'),
      permissions: new Set<PermissionCode>([
        'service_request:read',
        'service_request:comment_internal',
      ]),
    };
    const findMany = jest.fn().mockResolvedValue([]);
    const prisma = {
      serviceRequest: {
        findFirst: jest.fn().mockResolvedValue(serviceRequest()),
      },
      requestComment: { findMany },
    } as unknown as PrismaService;
    const service = new ServiceRequestsService(prisma, new FakeAssetClient());

    await service.comments(customer, REQUEST_ID);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ visibility: 'CUSTOMER' }),
      }),
    );
  });

  it('returns a chronological timeline and excludes internal activities for customers', async () => {
    const customer = {
      ...principal('CUSTOMER'),
      permissions: new Set<PermissionCode>([
        'service_request:read',
        'service_request:comment_internal',
      ]),
    };
    const statusChanges = [
      {
        id: '00000000-0000-4000-8000-000000000501',
        oldStatus: null,
        newStatus: 'NEW',
        changedBy: USER_ID,
        reason: null,
        changedAt: new Date('2026-10-20T10:00:00.000Z'),
      },
    ];
    const comments = [
      {
        id: '00000000-0000-4000-8000-000000000502',
        authorUserId: USER_ID,
        visibility: 'CUSTOMER',
        content: 'More information provided.',
        createdAt: new Date('2026-10-20T11:00:00.000Z'),
      },
    ];
    const findManyComments = jest.fn().mockResolvedValue(comments);
    const prisma = {
      serviceRequest: {
        findFirst: jest.fn().mockResolvedValue(serviceRequest()),
      },
      requestStatusHistory: {
        findMany: jest.fn().mockResolvedValue(statusChanges),
      },
      requestComment: { findMany: findManyComments },
    } as unknown as PrismaService;
    const service = new ServiceRequestsService(prisma, new FakeAssetClient());

    const history = await service.history(customer, REQUEST_ID);

    expect(history.map((item) => item.kind)).toEqual([
      'STATUS_CHANGED',
      'COMMENT_ADDED',
    ]);
    expect(findManyComments).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ visibility: 'CUSTOMER' }),
      }),
    );
  });
});

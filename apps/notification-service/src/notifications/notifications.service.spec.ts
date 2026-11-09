import {
  ForbiddenException,
  NotFoundException } from '@nestjs/common';
import type { Principal } from '@pbl6/auth';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationReadStatus } from './notification-query.dto';
import { NotificationsService } from './notifications.service';

const TENANT = '10000000-0000-4000-8000-000000000001';
const CUSTOMER = '10000000-0000-4000-8000-000000000002';
const USER = '10000000-0000-4000-8000-000000000003';
const NOTIFICATION = '10000000-0000-4000-8000-000000000004';
const CREATED_AT = new Date('2026-11-02T00:00:00.000Z');

function principal(
  userType: 'TENANT_STAFF' | 'CUSTOMER' = 'TENANT_STAFF',
): Principal {
  return {
    userId: USER,
    branchId: USER,
    sessionId: '10000000-0000-4000-8000-000000000005',
    tenantId: TENANT,
    userType,
    roles: [userType === 'CUSTOMER' ? 'CUSTOMER_USER' : 'SERVICE_MANAGER'],
    permissions: new Set(['notification:read']),
    customerId: userType === 'CUSTOMER' ? CUSTOMER : null,
    accessToken: 'test-token',
    expiresAt: new Date(Date.now() + 60_000),
  };
}

function snapshot(overrides: Record<string, unknown> = {}) {
  return {
    userId: USER,
    tenantId: TENANT,
    userType: 'TENANT_STAFF',
    accountStatus: 'ACTIVE',
    roleCodes: ['SERVICE_MANAGER'],
    membershipId: null,
    customerId: null,
    membershipStatus: null,
    membershipSourceChangedAt: null,
    revision: 1n,
    bootstrapRunId: null,
    sourceOccurredAt: CREATED_AT,
    updatedAt: CREATED_AT,
    ...overrides,
  };
}

function notification(overrides: Record<string, unknown> = {}) {
  return {
    id: NOTIFICATION,
    tenantId: TENANT,
    userId: USER,
    customerId: null,
    sourceEventId: '10000000-0000-4000-8000-000000000006',
    type: 'ServiceRequestStatusChanged.v1',
    title: 'Request updated',
    content: 'Your request status changed',
    payload: {
      resourceType: 'SERVICE_REQUEST',
      resourceId: '10000000-0000-4000-8000-000000000007',
      internalNotes: 'must not be returned',
    },
    channel: 'IN_APP',
    status: 'SENT',
    createdAt: CREATED_AT,
    sentAt: CREATED_AT,
    readAt: null,
    ...overrides,
  };
}

function setup() {
  const db = {
    recipientSnapshot: {
      findUnique: jest.fn().mockResolvedValue(snapshot()),
    },
    notification: {
      findMany: jest.fn().mockResolvedValue([notification()]),
      count: jest.fn().mockResolvedValue(1),
      findFirst: jest.fn().mockResolvedValue(notification()),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    $transaction: jest.fn(),
  };
  db.$transaction.mockImplementation((input: unknown) => {
    if (Array.isArray(input)) return Promise.all(input);
    if (typeof input === 'function') return input(db);
    throw new Error('Unsupported transaction shape in test');
  });
  return {
    db,
    service: new NotificationsService(db as unknown as PrismaService),
  };
}

describe('NotificationsService', () => {
  it('lists only the authenticated staff user scope and maps allowlisted fields', async () => {
    const { db, service } = setup();

    const result = await service.list(principal(), {
      page: 1,
      pageSize: 20,
      readStatus: NotificationReadStatus.ALL,
    });

    expect(db.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId: TENANT,
          userId: USER,
          channel: 'IN_APP',
          customerId: null,
          OR: [
            { branchId: USER },
            { type: { startsWith: 'EquipmentHandoverChanged.' } },
          ],
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: 0,
        take: 20,
      }),
    );
    expect(result.items[0]).toEqual({
      id: NOTIFICATION,
      eventType: 'ServiceRequestStatusChanged.v1',
      title: 'Request updated',
      body: 'Your request status changed',
      resourceType: 'SERVICE_REQUEST',
      resourceId: '10000000-0000-4000-8000-000000000007',
      createdAt: CREATED_AT,
      readAt: null,
    });
    expect(result.items[0]).not.toHaveProperty('payload');
  });

  it('uses the same scope for unread count and unread list filters', async () => {
    const { db, service } = setup();

    await service.list(principal(), {
      page: 2,
      pageSize: 10,
      readStatus: NotificationReadStatus.UNREAD,
    });
    await service.unreadCount(principal());

    expect(db.notification.findMany.mock.calls[0][0].where).toEqual({
      tenantId: TENANT,
      userId: USER,
      channel: 'IN_APP',
      customerId: null,
      OR: [
        { branchId: USER },
        { type: { startsWith: 'EquipmentHandoverChanged.' } },
      ],
      readAt: null,
    });
    expect(db.notification.count.mock.calls[0][0].where).toEqual({
      tenantId: TENANT,
      userId: USER,
      channel: 'IN_APP',
      customerId: null,
      OR: [
        { branchId: USER },
        { type: { startsWith: 'EquipmentHandoverChanged.' } },
      ],
      readAt: null,
    });
    expect(db.notification.findMany.mock.calls[0][0].skip).toBe(10);
  });

  it('requires an active customer membership matching the verified principal', async () => {
    const { db, service } = setup();
    db.recipientSnapshot.findUnique.mockResolvedValue(
      snapshot({
        userType: 'CUSTOMER',
        roleCodes: ['CUSTOMER_USER'],
        membershipId: '10000000-0000-4000-8000-000000000008',
        customerId: CUSTOMER,
        membershipStatus: 'ACTIVE',
        membershipSourceChangedAt: CREATED_AT,
      }),
    );

    await service.list(principal('CUSTOMER'), {
      page: 1,
      pageSize: 20,
      readStatus: NotificationReadStatus.ALL,
    });

    expect(db.notification.findMany.mock.calls[0][0].where.customerId).toBe(
      CUSTOMER,
    );
  });

  it.each([
    ['missing snapshot', null],
    ['inactive account', snapshot({ accountStatus: 'DISABLED' })],
    [
      'revoked membership',
      snapshot({
        userType: 'CUSTOMER',
        roleCodes: ['CUSTOMER_USER'],
        membershipId: '10000000-0000-4000-8000-000000000008',
        customerId: CUSTOMER,
        membershipStatus: 'INACTIVE',
        membershipSourceChangedAt: CREATED_AT,
      }),
    ],
    [
      'membership moved',
      snapshot({
        userType: 'CUSTOMER',
        roleCodes: ['CUSTOMER_USER'],
        membershipId: '10000000-0000-4000-8000-000000000008',
        customerId: '10000000-0000-4000-8000-000000000009',
        membershipStatus: 'ACTIVE',
        membershipSourceChangedAt: CREATED_AT,
      }),
    ],
    ['wrong tenant projection', snapshot({ tenantId: '10000000-0000-4000-8000-000000000010' }),
    ],
  ])('fails closed for %s', async (_label, projected) => {
    const { db, service } = setup();
    db.recipientSnapshot.findUnique.mockResolvedValue(projected);

    await expect(
      service.unreadCount(principal(_label === 'revoked membership' || _label === 'membership moved' ? 'CUSTOMER' : 'TENANT_STAFF',
        ),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(db.notification.count).not.toHaveBeenCalled();
  });

  it('returns a scoped 404 and does not update an unknown notification', async () => {
    const { db, service } = setup();
    db.notification.findFirst.mockResolvedValue(null);

    await expect(service.markRead(principal(), NOTIFICATION),
    ).rejects.toBeInstanceOf(
      NotFoundException);
    expect(db.notification.updateMany).not.toHaveBeenCalled();
  });

  it('keeps the existing read timestamp on an idempotent mark-read', async () => {
    const { db, service } = setup();
    const readAt = new Date('2026-11-02T01:00:00.000Z');
    db.notification.findFirst
      .mockResolvedValueOnce(notification({ readAt }))
      .mockResolvedValueOnce(notification({ readAt }));

    const result = await service.markRead(principal(), NOTIFICATION);

    expect(result.readAt).toBe(readAt);
    expect(db.notification.updateMany).not.toHaveBeenCalled();
  });

  it('rejects invalid date ranges', async () => {
    const { service } = setup();
    await expect(
      service.list(principal(), {
        page: 1,
        pageSize: 20,
        readStatus: NotificationReadStatus.ALL,
        createdFrom: '2026-11-03T00:00:00.000Z',
        createdTo: '2026-11-02T00:00:00.000Z',
      }),
    ).rejects.toMatchObject({ status: 400 });
  });
});

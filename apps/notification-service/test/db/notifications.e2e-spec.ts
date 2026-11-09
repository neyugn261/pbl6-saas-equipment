import { FIXTURE_BRANCH } from '@pbl6/testing';
import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import type { Principal } from '@pbl6/auth';
import { Prisma, PrismaClient } from '../../src/generated/prisma/client.js';
import { NotificationsService } from '../../src/notifications/notifications.service';
import { NotificationReadStatus } from '../../src/notifications/notification-query.dto';
import { PrismaService } from '../../src/prisma/prisma.service';
import { testDatabaseUrl } from './support/test-env';

describe('Notification API persistence (notification_test_db)', () => {
  let db: PrismaClient;
  let verified = false;
  const tenantIds = [randomUUID(), randomUUID()];
  const userIds = [randomUUID(), randomUUID(), randomUUID()];
  const customerIds = [randomUUID(), randomUUID()];
  const notificationIds: string[] = [];
  const consumers: string[] = [];
  let service: NotificationsService;

  const principal = (
    userIndex: number,
    userType: 'TENANT_STAFF' | 'CUSTOMER',
    customerId: string | null,
    role: 'SERVICE_MANAGER' | 'CUSTOMER_USER',
    tenantIndex = 0,
  ): Principal => ({
    userId: userIds[userIndex],
    branchId: FIXTURE_BRANCH,
    sessionId: randomUUID(),
    tenantId: tenantIds[tenantIndex],
    userType,
    roles: [role],
    permissions: new Set(['notification:read']),
    customerId,
    accessToken: 'test-only',
    expiresAt: new Date(Date.now() + 60_000),
  });

  beforeAll(async () => {
    db = new PrismaClient({
      adapter: new PrismaPg({ connectionString: testDatabaseUrl() }),
    });
    await db.$connect();
    const [actual] = await db.$queryRawUnsafe<Array<{ name: string }>>(
      'SELECT current_database() AS name',
    );
    if (actual?.name !== 'notification_test_db') {
      throw new Error('Unsafe database');
    }
    verified = true;
    service = new NotificationsService(db as PrismaService);
    await db.recipientSnapshot.createMany({
      data: [
        {
          userId: userIds[0],
          tenantId: tenantIds[0],
          userType: 'TENANT_STAFF',
          accountStatus: 'ACTIVE',
          roleCodes: ['SERVICE_MANAGER'],
          revision: 1n,
          sourceOccurredAt: new Date(),
        },
        {
          userId: userIds[1],
          tenantId: tenantIds[0],
          userType: 'CUSTOMER',
          accountStatus: 'ACTIVE',
          roleCodes: ['CUSTOMER_USER'],
          membershipId: randomUUID(),
          customerId: customerIds[0],
          membershipStatus: 'ACTIVE',
          membershipSourceChangedAt: new Date(),
          revision: 3n,
          sourceOccurredAt: new Date(),
        },
        {
          userId: userIds[2],
          tenantId: tenantIds[0],
          userType: 'CUSTOMER',
          accountStatus: 'ACTIVE',
          roleCodes: ['CUSTOMER_USER'],
          membershipId: randomUUID(),
          customerId: customerIds[1],
          membershipStatus: 'ACTIVE',
          membershipSourceChangedAt: new Date(),
          revision: 2n,
          sourceOccurredAt: new Date(),
        },
      ],
    });
    const rows = await Promise.all([
      db.notification.create({
        data: {
          branchId: FIXTURE_BRANCH,
          tenantId: tenantIds[0],
          userId: userIds[0],
          type: 'ServiceRequestStatusChanged.v1',
          title: 'Staff',
          content: 'Staff notification',
          channel: 'IN_APP',
          status: 'SENT',
        },
      }),
      db.notification.create({
        data: {
          branchId: FIXTURE_BRANCH,
          tenantId: tenantIds[0],
          userId: userIds[1],
          customerId: customerIds[0],
          type: 'ServiceRequestStatusChanged.v1',
          title: 'Customer A',
          content: 'Customer A notification',
          channel: 'IN_APP',
          status: 'SENT',
        },
      }),
      db.notification.create({
        data: {
          branchId: FIXTURE_BRANCH,
          tenantId: tenantIds[0],
          userId: userIds[1],
          customerId: customerIds[1],
          type: 'ServiceRequestStatusChanged.v1',
          title: 'Customer B context',
          content: 'Must not be visible to current membership',
          channel: 'IN_APP',
          status: 'SENT',
        },
      }),
    ]);
    notificationIds.push(...rows.map((row) => row.id));
  });

  afterAll(async () => {
    if (!db) return;
    try {
      if (verified) {
        await db.notification.deleteMany({
          where: {
            OR: [
              { tenantId: { in: tenantIds } },
              { id: { in: notificationIds } },
            ],
          },
        });
        await db.recipientSnapshot.deleteMany({
          where: { userId: { in: userIds } },
        });
        await db.pendingNotificationEvent.deleteMany({
          where: { consumer: { in: consumers } },
        });
      }
    } finally {
      await db.$disconnect();
    }
  });

  it('keeps tenant staff and each customer context isolated in list and count', async () => {
    const staff = await service.list(
      principal(0, 'TENANT_STAFF', null, 'SERVICE_MANAGER'),
      {
        page: 1,
        pageSize: 20,
        readStatus: NotificationReadStatus.ALL,
      },
    );
    const customerPrincipal = principal(
      1,
      'CUSTOMER',
      customerIds[0],
      'CUSTOMER_USER',
    );
    const customer = await service.list(customerPrincipal, {
      page: 1,
      pageSize: 20,
      readStatus: NotificationReadStatus.ALL,
    });

    expect(staff.items.map((item) => item.title)).toEqual(['Staff']);
    expect(customer.items.map((item) => item.title)).toEqual(['Customer A']);
    expect(await service.unreadCount(customerPrincipal)).toEqual({
      unreadCount: 1,
    });
  });

  it('marks read idempotently and does not change another customer context', async () => {
    const customerPrincipal = principal(
      1,
      'CUSTOMER',
      customerIds[0],
      'CUSTOMER_USER',
    );
    const first = await service.markRead(customerPrincipal, notificationIds[1]);
    const second = await service.markRead(
      customerPrincipal,
      notificationIds[1],
    );

    expect(first.readAt).not.toBeNull();
    expect(second.readAt).toEqual(first.readAt);
    const hidden = await db.notification.findUnique({
      where: { id: notificationIds[2] },
    });
    expect(hidden?.readAt).toBeNull();
  });

  it('preserves the approved source/user/channel uniqueness after adding scope', async () => {
    const eventId = randomUUID();
    const data: Prisma.NotificationCreateInput = {
      tenantId: tenantIds[0],
      userId: userIds[0],
      sourceEventId: eventId,
      type: 'ServiceRequestCreated.v1',
      title: 'Unique source',
      content: 'test',
      channel: 'IN_APP',
    };
    const created = await db.notification.create({ data });
    notificationIds.push(created.id);
    await expect(db.notification.create({ data })).rejects.toMatchObject({
      code: 'P2002',
    });
  });

  it('stores pending fan-out recipients idempotently per event, consumer, user, and channel', async () => {
    const sourceEventId = randomUUID();
    const consumer = `notification.test.${randomUUID()}`;
    consumers.push(consumer);
    await db.pendingNotificationEvent.create({
      data: {
        sourceEventId,
        consumer,
        tenantId: tenantIds[0],
        eventType: 'ServiceRequestStatusChanged',
        eventVersion: 1,
        payload: { status: 'IN_PROGRESS' },
        payloadSha256: 'a'.repeat(64),
        reason: 'WAITING_FOR_PROJECTION',
      },
    });
    const delivery = {
      sourceEventId,
      consumer,
      userId: userIds[1],
      customerId: customerIds[0],
      channel: 'IN_APP',
    };

    await db.pendingNotificationDelivery.create({ data: delivery });
    await expect(
      db.pendingNotificationDelivery.create({ data: delivery }),
    ).rejects.toMatchObject({ code: 'P2002' });
    expect(
      await db.pendingNotificationDelivery.count({
        where: { sourceEventId, consumer },
      }),
    ).toBe(1);
  });
});

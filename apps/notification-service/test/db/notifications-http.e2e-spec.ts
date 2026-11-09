import { BranchAccessClient } from '@pbl6/auth';
import { FIXTURE_BRANCH, fixtureBranchContext } from '@pbl6/testing';
import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { signTestAccessToken, testJwtEnv } from '@pbl6/testing';
import { configureApp } from '@pbl6/service-kit';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../src/generated/prisma/client.js';
import { AppModule } from '../../src/app.module';
import { testDatabaseUrl } from './support/test-env';
import request from 'supertest';

describe('Notification API with PostgreSQL (notification_test_db)', () => {
  let app: INestApplication;
  let db: PrismaClient;
  let verified = false;
  const tenants = [randomUUID(), randomUUID()];
  const users = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
  const customers = [randomUUID(), randomUUID()];
  const notificationIds: string[] = [];

  const token = (
    userId: string,
    role: 'SERVICE_MANAGER' | 'CUSTOMER_USER',
    tenantId: string,
    customerId: string | null = null,
  ) => signTestAccessToken({ userId, role, tenantId, customerId });

  beforeAll(async () => {
    const url = testDatabaseUrl();
    Object.assign(process.env, testJwtEnv(), {
      NODE_ENV: 'test',
      NOTIFICATION_DATABASE_URL: url,
    });
    db = new PrismaClient({
      adapter: new PrismaPg({ connectionString: url }),
    });
    await db.$connect();
    const [actual] = await db.$queryRawUnsafe<Array<{ name: string }>>(
      'SELECT current_database() AS name',
    );
    if (actual?.name !== 'notification_test_db') {
      throw new Error('Unsafe database');
    }
    verified = true;
    await db.recipientSnapshot.createMany({
      data: [
        {
          userId: users[0],
          tenantId: tenants[0],
          userType: 'TENANT_STAFF',
          accountStatus: 'ACTIVE',
          roleCodes: ['SERVICE_MANAGER'],
          revision: 1n,
          sourceOccurredAt: new Date(),
        },
        {
          userId: users[1],
          tenantId: tenants[0],
          userType: 'CUSTOMER',
          accountStatus: 'ACTIVE',
          roleCodes: ['CUSTOMER_USER'],
          membershipId: randomUUID(),
          customerId: customers[0],
          membershipStatus: 'ACTIVE',
          membershipSourceChangedAt: new Date(),
          revision: 2n,
          sourceOccurredAt: new Date(),
        },
        {
          userId: users[2],
          tenantId: tenants[0],
          userType: 'CUSTOMER',
          accountStatus: 'SUSPENDED',
          roleCodes: ['CUSTOMER_USER'],
          membershipId: randomUUID(),
          customerId: customers[0],
          membershipStatus: 'INACTIVE',
          membershipSourceChangedAt: new Date(),
          revision: 3n,
          sourceOccurredAt: new Date(),
        },
        {
          userId: users[3],
          tenantId: tenants[1],
          userType: 'TENANT_STAFF',
          accountStatus: 'ACTIVE',
          roleCodes: ['SERVICE_MANAGER'],
          revision: 1n,
          sourceOccurredAt: new Date(),
        },
      ],
    });
    const rows = await Promise.all([
      db.notification.create({
        data: {
          tenantId: tenants[0],
          userId: users[0],
          branchId: FIXTURE_BRANCH,
          type: 'ServiceRequestCreated.v1',
          title: 'Staff notice',
          content: 'Staff body',
          channel: 'IN_APP',
          status: 'SENT',
        },
      }),
      db.notification.create({
        data: {
          tenantId: tenants[0],
          userId: users[1],
          customerId: customers[0],
          branchId: FIXTURE_BRANCH,
          type: 'ServiceRequestCreated.v1',
          title: 'Customer notice',
          content: 'Customer body',
          channel: 'IN_APP',
          status: 'SENT',
          payload: { resourceType: 'SERVICE_REQUEST', resourceId: randomUUID(),
          },
        },
      }),
      db.notification.create({
        data: {
          tenantId: tenants[0],
          userId: users[1],
          customerId: customers[1],
          branchId: FIXTURE_BRANCH,
          type: 'ServiceRequestCreated.v1',
          title: 'Old customer context',
          content: 'Must not be visible',
          channel: 'IN_APP',
          status: 'SENT',
        },
      }),
      db.notification.create({
        data: {
          tenantId: tenants[1],
          userId: users[3],
          branchId: FIXTURE_BRANCH,
          type: 'ServiceRequestCreated.v1',
          title: 'Other tenant',
          content: 'Must not be visible',
          channel: 'IN_APP',
          status: 'SENT',
        },
      }),
    ]);
    notificationIds.push(...rows.map((row) => row.id));

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(BranchAccessClient)
      .useValue(fixtureBranchContext()).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    if (app) await app.close();
    if (!db) return;
    try {
      if (verified) {
        await db.notification.deleteMany({
          where: {
            OR: [
              { tenantId: { in: tenants } },
              { id: { in: notificationIds } },
            ],
          },
        });
        await db.recipientSnapshot.deleteMany({
          where: { userId: { in: users } },
        });
      }
    } finally {
      await db.$disconnect();
    }
  });

  it('authenticates, scopes customer/staff inboxes, and keeps unread count consistent', async () => {
    await request(app.getHttpServer())
      .get('/notifications')
      .expect(401);

    const customerToken = token(
      users[1],
      'CUSTOMER_USER',
      tenants[0],
      customers[0],
    );
    const customerList = await request(app.getHttpServer())
      .get('/notifications?page=1&pageSize=10')
      .set('authorization', `Bearer ${customerToken}`)
      .expect(200);
    expect(customerList.body.total).toBe(1);
    expect(customerList.body.items[0].title).toBe('Customer notice');
    expect(customerList.headers['cache-control']).toBe('no-store');
    await request(app.getHttpServer())
      .get('/notifications/unread-count')
      .set('authorization', `Bearer ${customerToken}`)
      .expect(200)
      .expect({ unreadCount: 1 });

    const staffToken = token(users[0], 'SERVICE_MANAGER', tenants[0]);
    const staffList = await request(app.getHttpServer())
      .get('/notifications')
      .set('authorization', `Bearer ${staffToken}`)
      .expect(200);
    expect(
      staffList.body.items.map((item: { title: string }) => item.title),
    ).toEqual(['Staff notice']);
  });

  it('fails closed for moved, inactive, missing, or cross-tenant recipient snapshots', async () => {
    await request(app.getHttpServer())
      .get('/notifications')
      .set(
        'authorization',
        `Bearer ${token(users[1], 'CUSTOMER_USER', tenants[0], customers[1])}`,
      )
      .expect(403);
    await request(app.getHttpServer())
      .get('/notifications')
      .set(
        'authorization',
        `Bearer ${token(users[2], 'CUSTOMER_USER', tenants[0], customers[0])}`,
      )
      .expect(403);
    await request(app.getHttpServer())
      .get('/notifications')
      .set(
        'authorization',
        `Bearer ${token(randomUUID(), 'SERVICE_MANAGER', tenants[0])}`,
      )
      .expect(403);
    await request(app.getHttpServer())
      .get('/notifications')
      .set(
        'authorization',
        `Bearer ${token(users[3], 'SERVICE_MANAGER', tenants[0])}`,
      )
      .expect(403);
  });

  it('does not disclose another user or customer-context notification on mark-read', async () => {
    const customerToken = token(
      users[1],
      'CUSTOMER_USER',
      tenants[0],
      customers[0],
    );
    await request(app.getHttpServer())
      .patch(`/notifications/${notificationIds[2]}/read`)
      .set('authorization', `Bearer ${customerToken}`)
      .expect(404);
    await request(app.getHttpServer())
      .patch(`/notifications/${notificationIds[0]}/read`)
      .set('authorization', `Bearer ${customerToken}`)
      .expect(404);
    const first = await request(app.getHttpServer())
      .patch(`/notifications/${notificationIds[1]}/read`)
      .set('authorization', `Bearer ${customerToken}`)
      .expect(200);
    const second = await request(app.getHttpServer())
      .patch(`/notifications/${notificationIds[1]}/read`)
      .set('authorization', `Bearer ${customerToken}`)
      .expect(200);
    expect(second.body.readAt).toBe(first.body.readAt);
    await request(app.getHttpServer())
      .get('/notifications?tenantId=' + tenants[0])
      .set('authorization', `Bearer ${customerToken}`)
      .expect(400);
  });
});

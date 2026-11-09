import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { BranchAccessClient } from '@pbl6/auth';
import { FIXTURE_BRANCH, fixtureBranchContext, signTestAccessToken, testJwtEnv } from '@pbl6/testing';
import { configureApp } from '@pbl6/service-kit';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';

const TENANT = '10000000-0000-4000-8000-000000000001';
const USER = '10000000-0000-4000-8000-000000000002';
const NOTIFICATION = '10000000-0000-4000-8000-000000000003';
const CREATED_AT = new Date('2026-11-02T00:00:00.000Z');

const row = {
  id: NOTIFICATION,
  tenantId: TENANT,
  userId: USER,
  customerId: null,
  branchId: FIXTURE_BRANCH,
  sourceEventId: '10000000-0000-4000-8000-000000000004',
  type: 'ServiceRequestStatusChanged.v1',
  title: 'Request updated',
  content: 'Your request status changed',
  payload: {
    resourceType: 'SERVICE_REQUEST',
    resourceId: '10000000-0000-4000-8000-000000000005',
    internalNotes: 'not public',
  },
  channel: 'IN_APP',
  status: 'SENT',
  createdAt: CREATED_AT,
  sentAt: CREATED_AT,
  readAt: null,
};

const prisma = {
  $connect: jest.fn(),
  $disconnect: jest.fn(),
  $queryRaw: jest.fn(),
  $transaction: jest.fn(),
  recipientSnapshot: {
    findUnique: jest.fn().mockResolvedValue({
      userId: USER,
      tenantId: TENANT,
      userType: 'TENANT_STAFF',
      accountStatus: 'ACTIVE',
      roleCodes: ['SERVICE_MANAGER'],
      membershipId: null,
      customerId: null,
      membershipStatus: null,
      membershipSourceChangedAt: null,
    }),
  },
  notification: {
    findMany: jest.fn().mockResolvedValue([row]),
    count: jest.fn().mockResolvedValue(1),
    findFirst: jest.fn().mockResolvedValue(row),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
  },
};
prisma.$transaction.mockImplementation((operation: unknown) =>
  Array.isArray(operation)
    ? Promise.all(operation)
    : typeof operation === 'function'
      ? operation(prisma)
      : Promise.reject(new Error('Unsupported transaction')),
);

describe('Notification API (e2e)', () => {
  let app: INestApplication<App>;
  let token: string;

  beforeAll(() => {
    Object.assign(process.env, testJwtEnv(), {
      NODE_ENV: 'test',
      NOTIFICATION_DATABASE_URL: 'postgresql://localhost/notification_test_db',
    });
    token = signTestAccessToken({
      role: 'SERVICE_MANAGER',
      tenantId: TENANT,
      userId: USER,
    });
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.recipientSnapshot.findUnique.mockResolvedValue({
      userId: USER,
      tenantId: TENANT,
      userType: 'TENANT_STAFF',
      accountStatus: 'ACTIVE',
      roleCodes: ['SERVICE_MANAGER'],
      membershipId: null,
      customerId: null,
      membershipStatus: null,
      membershipSourceChangedAt: null,
    });
    prisma.notification.findMany.mockResolvedValue([row]);
    prisma.notification.count.mockResolvedValue(1);
    prisma.notification.findFirst.mockResolvedValue(row);
    prisma.notification.updateMany.mockResolvedValue({ count: 1 });
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(BranchAccessClient)
      .useValue(fixtureBranchContext())
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
  });

  it('lists only own safe notification fields', async () => {
    await request(app.getHttpServer())
      .get('/notifications?page=1&pageSize=10&readStatus=UNREAD')
      .set('authorization', `Bearer ${token}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          page: 1,
          pageSize: 10,
          total: 1,
          items: [
            {
              id: NOTIFICATION,
              eventType: 'ServiceRequestStatusChanged.v1',
              body: 'Your request status changed',
              resourceType: 'SERVICE_REQUEST',
            },
          ],
        });
        expect(body.items[0]).not.toHaveProperty('payload');
        expect(body.items[0]).not.toHaveProperty('internalNotes');
      });
  });

  it('requires an authenticated caller', async () => {
    await request(app.getHttpServer()).get('/notifications').expect(401);
  });

  it('rejects caller-supplied ownership filters', async () => {
    await request(app.getHttpServer())
      .get(`/notifications?tenantId=${TENANT}`)
      .set('authorization', `Bearer ${token}`)
      .expect(400);
  });

  it('counts unread notifications in the same scope', async () => {
    await request(app.getHttpServer())
      .get('/notifications/unread-count')
      .set('authorization', `Bearer ${token}`)
      .expect(200)
      .expect({ unreadCount: 1 });
  });

  it('marks an owned notification as read idempotently', async () => {
    const readAt = new Date('2026-11-02T01:00:00.000Z');
    prisma.notification.findFirst
      .mockResolvedValueOnce(row)
      .mockResolvedValueOnce({ ...row, readAt });
    await request(app.getHttpServer())
      .patch(`/notifications/${NOTIFICATION}/read`)
      .set('authorization', `Bearer ${token}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.readAt).toBe(readAt.toISOString());
      });
  });

  it('keeps internal-only routes unavailable', async () => {
    await request(app.getHttpServer()).get('/internal/users').expect(404);
  });

  afterEach(async () => {
    await app.close();
  });
});

import { INestApplication, Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { BranchAccessClient } from '@pbl6/auth';
import { configureApp } from '@pbl6/service-kit';
import { FIXTURE_BRANCH, fixtureBranchContext, signTestAccessToken } from '@pbl6/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

const tenantId = '00000000-0000-4000-8000-000000000001';
const customerId = '00000000-0000-4000-8000-000000000101';
const requestId = '00000000-0000-4000-8000-000000002001';
const attachmentId = '00000000-0000-4000-8000-000000002101';
const otherId = '00000000-0000-4000-8000-000000009999';
const path = `/service-requests/${requestId}/result/attachments`;
const page = { items: [], page: 1, pageSize: 20, total: 0 };

// Real guards/service/client/error filter; DB lookup and HTTP transport are doubles.
// Visibility filtering/counts in Work Order require its own DB integration evidence.
describe('C4 HTTP security (fake database and upstream transport)', () => {
  let app: INestApplication;
  let fetchMock: jest.SpyInstance;
  const lookup = jest.fn();
  const token = signTestAccessToken({
    role: 'CUSTOMER_USER',
    tenantId,
    customerId,
  });

  beforeAll(async () => {
    fetchMock = jest.spyOn(global, 'fetch');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(BranchAccessClient)
      .useValue(fixtureBranchContext())
      .overrideProvider(PrismaService)
      .useValue({ serviceRequest: { findFirst: lookup } })
      .compile();
    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app, { logger: new Logger('c4-test') });
    await app.init();
  });
  beforeEach(() => {
    fetchMock
      .mockReset()
      .mockImplementation(async () => new Response(JSON.stringify(page)));
    lookup
      .mockReset()
      .mockImplementation(async ({ where }) =>
        where.id === requestId &&
        where.tenantId === tenantId &&
        (!where.customerId || where.customerId === customerId)
          ? { id: requestId, tenantId, customerId, branchId: FIXTURE_BRANCH }
          : null,
      );
  });
  afterAll(async () => {
    await app.close();
    jest.restoreAllMocks();
  });

  it.each(['', `/${attachmentId}/download`])(
    'blocks unauthenticated access before DB/upstream %s',
    async (suffix) => {
      await request(app.getHttpServer())
        .get(path + suffix)
        .expect(401);
      expect(lookup).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );
  it.each([
    {
      role: 'CUSTOMER_USER' as const,
      tenantId,
      customerId: otherId,
      status: 404,
    },
    {
      role: 'CUSTOMER_USER' as const,
      tenantId: otherId,
      customerId,
      status: 404,
    },
    { role: 'CUSTOMER_USER' as const, tenantId, customerId: null, status: 403 },
    { role: 'INVENTORY_STAFF' as const, tenantId, status: 403 },
  ])(
    'blocks out-of-scope or unauthorized caller %p',
    async ({ status, ...claims }) => {
      for (const suffix of ['', `/${attachmentId}/download`]) {
        await request(app.getHttpServer())
          .get(path + suffix)
          .set('authorization', `Bearer ${signTestAccessToken(claims)}`)
          .expect(status);
      }
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );
  it('blocks a missing SR without outbound calls', async () => {
    await request(app.getHttpServer())
      .get(path.replace(requestId, otherId))
      .set('authorization', `Bearer ${token}`)
      .expect(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each(['CUSTOMER_USER', 'SERVICE_MANAGER'] as const)(
    'authorizes %s before calling source with original context',
    async (role) => {
      const caller = signTestAccessToken({ role, tenantId, customerId });
      const res = await request(app.getHttpServer())
        .get(path)
        .set('authorization', `Bearer ${caller}`)
        .set('x-correlation-id', 'c4-correlation')
        .expect(200);
      expect(res.body).toEqual(page);
      expect(res.headers['cache-control']).toBe('no-store');
      expect(lookup).toHaveBeenCalledWith({
        where: {
          id: requestId,
          tenantId,
          ...(role === 'CUSTOMER_USER' ? { customerId } : { branchId: FIXTURE_BRANCH }),
        },
      });
      expect(lookup.mock.invocationCallOrder[0]).toBeLessThan(
        fetchMock.mock.invocationCallOrder[0],
      );
      expect(fetchMock.mock.calls[0][1].headers).toMatchObject({
        authorization: `Bearer ${caller}`,
        'x-correlation-id': 'c4-correlation',
      });
    },
  );
  it.each([
    [404, 'WORK_ORDER_NOT_FOUND', 200],
    [404, 'NOT_FOUND', 502],
    [401, 'INVALID_ACCESS_TOKEN', 502],
    [403, 'FORBIDDEN', 403],
    [500, 'INTERNAL_ERROR', 502],
    [503, 'ATTACHMENT_SOURCE_UNAVAILABLE', 503],
  ])(
    'maps source %s/%s to %s without raw details',
    async (status, code, expected) => {
      fetchMock.mockImplementation(
        async () =>
          new Response(
            JSON.stringify({
              code,
              message: 'private-storage-secret',
              storageKey: 'private-storage-secret',
            }),
            { status: Number(status) },
          ),
      );
      const res = await request(app.getHttpServer())
        .get(path)
        .set('authorization', `Bearer ${token}`)
        .expect(Number(expected));
      expect(JSON.stringify(res.body)).not.toContain('private-storage-secret');
      if (expected === 200) expect(res.body).toEqual(page);
      else expect(res.body.code).toBeDefined();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );
  it.each(['network', 'timeout'])(
    'keeps %s failure unavailable',
    async (reason) => {
      fetchMock.mockRejectedValue(new Error(reason));
      await request(app.getHttpServer())
        .get(path)
        .set('authorization', `Bearer ${token}`)
        .expect(503);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );
  it('rejects malformed source success', async () => {
    fetchMock.mockResolvedValue(new Response('private-invalid-json'));
    const res = await request(app.getHttpServer())
      .get(path)
      .set('authorization', `Bearer ${token}`)
      .expect(502);
    expect(JSON.stringify(res.body)).not.toContain('private-invalid-json');
  });
  it('returns only the authorized download ticket with no-store', async () => {
    const ticket = {
      downloadUrl: 'https://storage.example/file?sig=fixture',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    };
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ ...ticket, storageKey: 'private' })),
    );
    const res = await request(app.getHttpServer())
      .get(`${path}/${attachmentId}/download`)
      .set('authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body).toEqual(ticket);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(lookup.mock.invocationCallOrder[0]).toBeLessThan(
      fetchMock.mock.invocationCallOrder[0],
    );
  });
  it.each(['INTERNAL', 'deleted', 'hidden'])(
    'preserves source denial for %s attachment IDs',
    async () => {
      fetchMock.mockResolvedValue(
        new Response(
          JSON.stringify({ code: 'ATTACHMENT_NOT_FOUND', message: 'private' }),
          { status: 404 },
        ),
      );
      await request(app.getHttpServer())
        .get(`${path}/${attachmentId}/download`)
        .set('authorization', `Bearer ${token}`)
        .expect(404, {
          code: 'ATTACHMENT_NOT_FOUND',
          message: 'Attachment not found',
        });
    },
  );
});

import { FIXTURE_BRANCH } from '@pbl6/testing';
import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { signTestAccessToken } from '@pbl6/testing';
import request from 'supertest';
import { PrismaService } from '../../src/prisma/prisma.service';
import { createTestApp, resetDatabase } from './support/test-app';

// PostgreSQL-backed SR authorization. Work Order HTTP transport is a double;
// these tests do not establish WO visibility/count or storage integration.
describe('C4 authorization (service_request_test_db, fake Work Order)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let upstream: jest.SpyInstance;
  let tenantId: string,
    customerId: string,
    requestId: string,
    attachmentId: string;
  let token: string;
  const urls = () => {
    const path = `/service-requests/${requestId}/result/attachments`;
    return [path, `${path}/${attachmentId}/download`];
  };
  beforeAll(async () => {
    upstream = jest.spyOn(global, 'fetch');
    ({ app, prisma } = await createTestApp());
  });
  afterAll(async () => {
    await app?.close();
    jest.restoreAllMocks();
  });
  beforeEach(async () => {
    await resetDatabase(prisma);
    tenantId = randomUUID();
    customerId = randomUUID();
    attachmentId = randomUUID();
    const row = await prisma.serviceRequest.create({
      data: {
        branchId: FIXTURE_BRANCH,
        tenantId,
        customerId,
        requestNo: 'SR-C4-TEST',
        equipmentId: randomUUID(),
        requesterId: randomUUID(),
        type: 'REPAIR',
        title: 'C4 database fixture',
        description: 'Private description',
      },
    });
    requestId = row.id;
    token = signTestAccessToken({
      role: 'CUSTOMER_USER',
      tenantId,
      customerId,
    });
    upstream.mockReset().mockImplementation(
      async (url: URL) =>
        new Response(
          JSON.stringify(
            url.pathname.endsWith('/download')
              ? {
                  downloadUrl: 'https://storage.example/file?sig=test-only',
                  expiresAt: new Date(Date.now() + 60000).toISOString(),
                  storageKey: 'private',
                  bucket: 'private',
                }
              : {
                  items: [
                    {
                      id: attachmentId,
                      fileName: 'result.pdf',
                      mimeType: 'application/pdf',
                      sizeBytes: 10,
                      createdAt: new Date().toISOString(),
                      storageKey: 'private',
                      internalNotes: 'private',
                    },
                  ],
                  page: 1,
                  pageSize: 20,
                  total: 1,
                  bucket: 'private',
                },
          ),
        ),
    );
  });

  it.each([
    'NEW',
    'REVIEWING',
    'AWAITING_INFO',
    'AWAITING_CUSTOMER_APPROVAL',
    'ACCEPTED',
    'PROCESSING',
    'RESOLVED',
    'CLOSED',
    'REJECTED',
    'CANCELLED',
    'COST_REJECTED',
  ])(
    'uses existing read scope without inventing a status gate: %s',
    async (status) => {
      await prisma.serviceRequest.update({
        where: { id: requestId },
        data: { status },
      });
      for (const url of urls()) {
        const res = await request(app.getHttpServer())
          .get(url)
          .set('authorization', `Bearer ${token}`)
          .expect(200);
        expect(res.headers['cache-control']).toBe('no-store');
        expect(JSON.stringify(res.body)).not.toMatch(
          /storageKey|bucket|internalNotes|private/,
        );
        expect(res.headers['x-correlation-id']).toBeDefined();
      }
      expect(upstream).toHaveBeenCalledTimes(2);
      expect(upstream.mock.calls[0][1].headers.authorization).toBe(
        `Bearer ${token}`,
      );
    },
  );
  it.each(['other-customer', 'other-tenant', 'missing-request'])(
    'gives the same 404 for %s without querying Work Order',
    async (scenario) => {
      const claims = { role: 'CUSTOMER_USER' as const, tenantId, customerId };
      if (scenario === 'other-customer') claims.customerId = randomUUID();
      if (scenario === 'other-tenant') claims.tenantId = randomUUID();
      const original = requestId;
      requestId = randomUUID();
      const missing = await request(app.getHttpServer())
        .get(urls()[0])
        .set('authorization', `Bearer ${token}`)
        .expect(404);
      if (scenario !== 'missing-request') requestId = original;
      for (const url of urls()) {
        const res = await request(app.getHttpServer())
          .get(url)
          .set('authorization', `Bearer ${signTestAccessToken(claims)}`)
          .expect(404);
        expect(res.body).toEqual(missing.body);
      }
      expect(upstream).not.toHaveBeenCalled();
    },
  );
  it('authorizes staff and forwards exact token and supplied correlation ID', async () => {
    const staff = signTestAccessToken({ role: 'SERVICE_MANAGER', tenantId });
    for (const url of urls()) {
      await request(app.getHttpServer())
        .get(url)
        .set('authorization', `Bearer ${staff}`)
        .set('x-correlation-id', 'c4-db')
        .expect(200);
    }
    for (const call of upstream.mock.calls)
      expect(call[1].headers).toMatchObject({
        authorization: `Bearer ${staff}`,
        'x-correlation-id': 'c4-db',
      });
  });
  it('rechecks SR ownership on every list/download after a controlled fixture transfer', async () => {
    await request(app.getHttpServer())
      .get(urls()[0])
      .set('authorization', `Bearer ${token}`)
      .expect(200);
    upstream.mockClear();
    // Fixture mutation only, not a proposed public transfer operation.
    await prisma.serviceRequest.update({
      where: { id: requestId },
      data: { customerId: randomUUID() },
    });
    for (const url of urls())
      await request(app.getHttpServer())
        .get(url)
        .set('authorization', `Bearer ${token}`)
        .expect(404);
    expect(upstream).not.toHaveBeenCalled();
  });
  it.each([null, 'changed'])(
    'uses refreshed membership context %s, not prior access',
    async (membership) => {
      const changed = signTestAccessToken({
        role: 'CUSTOMER_USER',
        tenantId,
        customerId: membership === null ? null : randomUUID(),
      });
      for (const url of urls())
        await request(app.getHttpServer())
          .get(url)
          .set('authorization', `Bearer ${changed}`)
          .expect(membership === null ? 403 : 404);
      expect(upstream).not.toHaveBeenCalled();
    },
  );
  it('denies staff without read permission for list and download', async () => {
    const denied = signTestAccessToken({ role: 'INVENTORY_STAFF', tenantId });
    for (const url of urls())
      await request(app.getHttpServer())
        .get(url)
        .set('authorization', `Bearer ${denied}`)
        .expect(403);
    expect(upstream).not.toHaveBeenCalled();
  });
});

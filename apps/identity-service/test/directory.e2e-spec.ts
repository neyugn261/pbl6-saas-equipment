import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { EventEnvelope } from '@pbl6/event-contracts';
import request from 'supertest';
import { App } from 'supertest/types';
import { DirectoryEventHandler } from '../src/events/directory-event.handler';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  createTenant,
  createTestApp,
  createUser,
  resetDatabase,
} from './support/test-app';

const PASSWORD = 'Correct#Pass1';
const CUSTOMER_A = '0aaaaaaa-0000-4000-8000-000000000001';
const CUSTOMER_B = '0bbbbbbb-0000-4000-8000-000000000002';

function envelope(
  eventType: string,
  tenantId: string,
  aggregateId: string,
  payload: unknown,
  eventId = randomUUID(),
): EventEnvelope {
  return {
    eventId,
    eventType,
    eventVersion: 1,
    producer: 'organization-service',
    tenantId,
    aggregateType: eventType.startsWith('Tenant') ? 'Tenant' : 'CustomerUserMembership',
    aggregateId,
    occurredAt: new Date().toISOString(),
    correlationId: 'e2e',
    payload,
  };
}

describe('Directory events and the customer_id claim (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let handler: DirectoryEventHandler;
  let tenantId: string;
  let customerUserId: string;
  const membershipId = randomUUID();

  const http = () => request(app.getHttpServer());
  const decode = (token: string) =>
    new JwtService().decode<Record<string, unknown>>(token);
  const loginCustomer = () =>
    http()
      .post('/auth/login')
      .send({ tenantCode: 'TENANT-A', email: 'buyer@customer.com', password: PASSWORD });
  const membership = (status: 'ACTIVE' | 'INACTIVE', changedAt: string, customerId = CUSTOMER_A, userId = customerUserId) =>
    envelope('CustomerMembershipChanged', tenantId, membershipId, {
      membershipId,
      userId,
      customerId,
      status,
      changedAt,
    });

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    handler = app.get(DirectoryEventHandler);
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    tenantId = await createTenant(prisma, 'TENANT-A');
    customerUserId = await createUser(prisma, {
      tenantId,
      userType: 'CUSTOMER',
      email: 'buyer@customer.com',
      password: PASSWORD,
      roles: ['CUSTOMER_USER'],
    });
  });

  it('issues customer_id = null while the account has no customer link', async () => {
    const res = await loginCustomer().expect(200);
    expect(decode(res.body.accessToken)).toMatchObject({ user_type: 'CUSTOMER', customer_id: null });
    expect(res.body.user.customerId).toBeNull();
  });

  it('puts the customer of an active membership into the token and the profile', async () => {
    await expect(handler.handle(membership('ACTIVE', '2026-10-01T00:00:00Z'))).resolves.toBe('processed');
    const res = await loginCustomer().expect(200);
    expect(decode(res.body.accessToken)).toMatchObject({ customer_id: CUSTOMER_A });
    const me = await http()
      .get('/auth/me')
      .set('authorization', `Bearer ${res.body.accessToken}`)
      .expect(200);
    expect(me.body.customerId).toBe(CUSTOMER_A);
  });

  it('processes a redelivered event only once', async () => {
    const event = membership('ACTIVE', '2026-10-01T00:00:00Z');
    await expect(handler.handle(event)).resolves.toBe('processed');
    await expect(handler.handle(event)).resolves.toBe('duplicate');
    expect(await prisma.processedEvent.count()).toBe(1);
  });

  it('ignores a membership change older than the stored one', async () => {
    await handler.handle(membership('ACTIVE', '2026-10-05T00:00:00Z', CUSTOMER_B));
    await handler.handle(membership('ACTIVE', '2026-10-01T00:00:00Z', CUSTOMER_A));
    const link = await prisma.userCustomerLink.findUniqueOrThrow({ where: { userId: customerUserId } });
    expect(link.customerId).toBe(CUSTOMER_B);
  });

  it('drops the claim once the membership becomes inactive (at the next refresh)', async () => {
    await handler.handle(membership('ACTIVE', '2026-10-01T00:00:00Z'));
    const login = await loginCustomer().expect(200);
    await handler.handle(membership('INACTIVE', '2026-10-02T00:00:00Z'));
    const refreshed = await http()
      .post('/auth/refresh')
      .send({ refreshToken: login.body.refreshToken })
      .expect(200);
    expect(decode(refreshed.body.accessToken)).toMatchObject({ customer_id: null });
  });

  it('refuses to link a staff account to a customer and records nothing', async () => {
    const staffId = await createUser(prisma, {
      tenantId,
      userType: 'TENANT_STAFF',
      email: 'staff@vendor.com',
      password: PASSWORD,
      roles: ['DISPATCHER'],
    });
    await expect(
      handler.handle(membership('ACTIVE', '2026-10-01T00:00:00Z', CUSTOMER_A, staffId)),
    ).rejects.toThrow(/Only CUSTOMER accounts/);
    expect(await prisma.userCustomerLink.count()).toBe(0);
    // The inbox row rolled back with the failed write, so a retry is possible.
    expect(await prisma.processedEvent.count()).toBe(0);
  });

  it('refuses a link to a customer account of another tenant', async () => {
    const otherTenant = await createTenant(prisma, 'TENANT-B');
    const outsider = await createUser(prisma, {
      tenantId: otherTenant,
      userType: 'CUSTOMER',
      email: 'outsider@customer.com',
      password: PASSWORD,
      roles: ['CUSTOMER_USER'],
    });
    await expect(
      handler.handle(membership('ACTIVE', '2026-10-01T00:00:00Z', CUSTOMER_A, outsider)),
    ).rejects.toThrow(/tenant does not match/);
  });

  it('maintains tenant_directory from tenant events', async () => {
    const newTenant = randomUUID();
    await handler.handle(
      envelope('TenantCreated', newTenant, newTenant, {
        tenantId: newTenant,
        code: 'NEWCO',
        name: 'New Co',
        status: 'ACTIVE',
      }),
    );
    await createUser(prisma, {
      tenantId: newTenant,
      userType: 'TENANT_STAFF',
      email: 'admin@newco.com',
      password: PASSWORD,
      roles: ['TENANT_ADMIN'],
    });
    const login = () =>
      http().post('/auth/login').send({ tenantCode: 'NEWCO', email: 'admin@newco.com', password: PASSWORD });
    await login().expect(200);

    const status = (value: string, previous: string, changedAt: string) =>
      envelope('TenantStatusChanged', newTenant, newTenant, {
        tenantId: newTenant,
        code: 'NEWCO',
        status: value,
        previousStatus: previous,
        changedAt,
      });
    const later = new Date(Date.now() + 60_000).toISOString();
    await handler.handle(status('SUSPENDED', 'ACTIVE', later));
    const refused = await login().expect(403);
    expect(refused.body.code).toBe('TENANT_NOT_ACTIVE');

    // A stale status change must not re-activate the tenant.
    await handler.handle(status('ACTIVE', 'SUSPENDED', '2026-01-01T00:00:00Z'));
    await login().expect(403);
  });
});

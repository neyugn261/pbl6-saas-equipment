import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import { PrismaService } from '../../src/prisma/prisma.service';
import {
  api,
  bearer,
  createTenant,
  createTestApp,
  FakeIdentityClient,
  resetDatabase,
} from './support/test-app';

describe('Customer memberships and branch staff (e2e, organization_test_db)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let identity: FakeIdentityClient;
  let tenantA: string;
  let tenantB: string;
  let own: string;
  let other: string;

  beforeAll(async () => {
    ({ app, prisma, identity } = await createTestApp());
  });

  afterAll(async () => {
    await app?.close();
  });

  const tenantAdmin = () => api(app, bearer('TENANT_ADMIN', tenantA));
  const customerAdmin = (customerId = own) => {
    const id = identity.add({ tenantId: tenantA, userType: 'CUSTOMER', roles: ['CUSTOMER_ADMIN'] });
    return { id, http: api(app, bearer('CUSTOMER_ADMIN', tenantA, customerId, id)) };
  };
  const customerUserAccount = (tenantId = tenantA) =>
    identity.add({ tenantId, userType: 'CUSTOMER', roles: ['CUSTOMER_USER'] });
  const events = async () =>
    (await prisma.outboxEvent.findMany({ orderBy: { occurredAt: 'asc' } }))
      .filter((e) => e.eventType === 'CustomerMembershipChanged')
      .map((e) => (e.payload as { data: Record<string, unknown> }).data);

  beforeEach(async () => {
    await resetDatabase(prisma);
    identity.clear();
    tenantA = await createTenant(prisma, 'TENANT-A');
    tenantB = await createTenant(prisma, 'TENANT-B');
    own = (await tenantAdmin().post('/customers', { code: 'C1', name: 'Alpha' }).expect(201)).body.id;
    other = (await tenantAdmin().post('/customers', { code: 'C2', name: 'Beta' }).expect(201)).body.id;
  });

  describe('linking by a Tenant Admin', () => {
    it('links a CUSTOMER account and writes CustomerMembershipChanged', async () => {
      const userId = customerUserAccount();
      const res = await tenantAdmin().post(`/customers/${own}/memberships`, { userId }).expect(201);
      expect(res.body).toMatchObject({ customerId: own, userId, status: 'ACTIVE' });

      expect(await events()).toEqual([
        expect.objectContaining({ membershipId: res.body.id, userId, customerId: own, status: 'ACTIVE' }),
      ]);
      const list = await tenantAdmin().get(`/customers/${own}/memberships`).expect(200);
      expect(list.body).toHaveLength(1);

      // Linking again changes nothing and writes no event.
      await tenantAdmin().post(`/customers/${own}/memberships`, { userId }).expect(201);
      expect(await events()).toHaveLength(1);
    });

    it('moves an account to another customer (one customer per account)', async () => {
      const userId = customerUserAccount();
      await tenantAdmin().post(`/customers/${own}/memberships`, { userId }).expect(201);
      const moved = await tenantAdmin().post(`/customers/${other}/memberships`, { userId }).expect(201);
      expect(moved.body.customerId).toBe(other);
      expect((await tenantAdmin().get(`/customers/${own}/memberships`).expect(200)).body).toEqual([]);
      expect((await events()).map((e) => e.customerId)).toEqual([own, other]);
    });

    it('only links CUSTOMER accounts of the same tenant', async () => {
      const staff = identity.add({ tenantId: tenantA, userType: 'TENANT_STAFF', roles: ['TECHNICIAN'] });
      const wrongType = await tenantAdmin().post(`/customers/${own}/memberships`, { userId: staff }).expect(422);
      expect(wrongType.body.code).toBe('USER_NOT_CUSTOMER_ACCOUNT');

      const foreign = customerUserAccount(tenantB);
      const missing = await tenantAdmin().post(`/customers/${own}/memberships`, { userId: foreign }).expect(422);
      expect(missing.body.code).toBe('USER_NOT_FOUND');
      expect(await events()).toEqual([]);
    });

    it('needs user:manage', async () => {
      const userId = customerUserAccount();
      await api(app, bearer('SERVICE_MANAGER', tenantA)).post(`/customers/${own}/memberships`, { userId }).expect(403);
      await api(app, bearer('CUSTOMER_USER', tenantA, own)).post(`/customers/${own}/memberships`, { userId }).expect(403);
      await api(app, bearer('SERVICE_MANAGER', tenantA)).get(`/customers/${own}/memberships`).expect(403);
    });
  });

  describe('linking by a Customer Admin (ADR 0006)', () => {
    it('links CUSTOMER_USER accounts to its own customer only', async () => {
      const { http } = customerAdmin();
      const userId = customerUserAccount();
      await http.post(`/customers/${own}/memberships`, { userId }).expect(201);
      expect((await http.get(`/customers/${own}/memberships`).expect(200)).body).toHaveLength(1);

      const res = await http.post(`/customers/${other}/memberships`, { userId: customerUserAccount() }).expect(404);
      expect(res.body.code).toBe('CUSTOMER_NOT_FOUND');
      await http.get(`/customers/${other}/memberships`).expect(404);
    });

    it('never manages another Customer Admin', async () => {
      const { http } = customerAdmin();
      const admin = identity.add({ tenantId: tenantA, userType: 'CUSTOMER', roles: ['CUSTOMER_ADMIN'] });
      const res = await http.post(`/customers/${own}/memberships`, { userId: admin }).expect(403);
      expect(res.body).toMatchObject({ code: 'ROLE_NOT_ASSIGNABLE', details: { roles: ['CUSTOMER_ADMIN'] } });
    });

    it('never takes an account away from another customer', async () => {
      const userId = customerUserAccount();
      await tenantAdmin().post(`/customers/${other}/memberships`, { userId }).expect(201);
      const res = await customerAdmin().http.post(`/customers/${own}/memberships`, { userId }).expect(409);
      expect(res.body.code).toBe('USER_LINKED_TO_OTHER_CUSTOMER');
      expect((await events()).map((e) => e.customerId)).toEqual([other]);
    });
  });

  describe('membership status', () => {
    it('deactivates and re-activates with an event each time', async () => {
      const userId = customerUserAccount();
      const link = await tenantAdmin().post(`/customers/${own}/memberships`, { userId }).expect(201);
      const off = await tenantAdmin().post(`/memberships/${link.body.id}/status`, { status: 'INACTIVE' }).expect(200);
      expect(off.body.status).toBe('INACTIVE');
      const again = await tenantAdmin().post(`/memberships/${link.body.id}/status`, { status: 'INACTIVE' }).expect(409);
      expect(again.body.code).toBe('INVALID_STATE_TRANSITION');
      // Linking an inactive account again re-activates it.
      await tenantAdmin().post(`/customers/${own}/memberships`, { userId }).expect(201);
      expect((await events()).map((e) => e.status)).toEqual(['ACTIVE', 'INACTIVE', 'ACTIVE']);
    });

    it('deactivates the memberships of a deleted customer and never re-activates them', async () => {
      const userId = customerUserAccount();
      const link = await tenantAdmin().post(`/customers/${own}/memberships`, { userId }).expect(201);
      await tenantAdmin().delete(`/customers/${own}`).expect(204);

      expect((await events()).map((e) => [e.membershipId, e.status])).toEqual([
        [link.body.id, 'ACTIVE'],
        [link.body.id, 'INACTIVE'],
      ]);
      const res = await tenantAdmin().post(`/memberships/${link.body.id}/status`, { status: 'ACTIVE' }).expect(404);
      expect(res.body.code).toBe('CUSTOMER_NOT_FOUND');
      // The account can still be linked to a live customer.
      await tenantAdmin().post(`/customers/${other}/memberships`, { userId }).expect(201);
    });

    it('limits a Customer Admin to CUSTOMER_USER memberships of its own customer', async () => {
      const admin = customerAdmin();
      const ownAdminLink = await tenantAdmin().post(`/customers/${own}/memberships`, { userId: admin.id }).expect(201);
      const user = await tenantAdmin().post(`/customers/${own}/memberships`, { userId: customerUserAccount() }).expect(201);
      const foreign = await tenantAdmin().post(`/customers/${other}/memberships`, { userId: customerUserAccount() }).expect(201);

      await admin.http.post(`/memberships/${user.body.id}/status`, { status: 'INACTIVE' }).expect(200);
      const res = await admin.http.post(`/memberships/${foreign.body.id}/status`, { status: 'INACTIVE' }).expect(404);
      expect(res.body.code).toBe('MEMBERSHIP_NOT_FOUND');
      await admin.http.post(`/memberships/${ownAdminLink.body.id}/status`, { status: 'INACTIVE' }).expect(403);
      await api(app, bearer('TENANT_ADMIN', tenantB)).post(`/memberships/${user.body.id}/status`, { status: 'ACTIVE' }).expect(404);
    });
  });

  describe('branch staff', () => {
    let hcm: string;
    let danang: string;

    beforeEach(async () => {
      hcm = (await tenantAdmin().post('/branches', { code: 'HCM', name: 'HCM', address: 'x' }).expect(201)).body.id;
      danang = (await tenantAdmin().post('/branches', { code: 'DN', name: 'Da Nang', address: 'x' }).expect(201)).body.id;
    });

    it('assigns staff, keeps one primary branch per user and unassigns', async () => {
      const tech = identity.add({ tenantId: tenantA, userType: 'TENANT_STAFF', roles: ['TECHNICIAN'] });
      await tenantAdmin().post(`/branches/${hcm}/users`, { userId: tech, isPrimary: true }).expect(201);
      await tenantAdmin().post(`/branches/${danang}/users`, { userId: tech, isPrimary: true }).expect(201);

      const inHcm = (await tenantAdmin().get(`/branches/${hcm}/users`).expect(200)).body;
      const inDanang = (await tenantAdmin().get(`/branches/${danang}/users`).expect(200)).body;
      expect(inHcm).toEqual([expect.objectContaining({ userId: tech, isPrimary: false })]);
      expect(inDanang).toEqual([expect.objectContaining({ userId: tech, isPrimary: true })]);

      await tenantAdmin().delete(`/branches/${hcm}`).expect(409);
      await tenantAdmin().delete(`/branches/${hcm}/users/${tech}`).expect(204);
      const gone = await tenantAdmin().delete(`/branches/${hcm}/users/${tech}`).expect(404);
      expect(gone.body.code).toBe('ASSIGNMENT_NOT_FOUND');
      await tenantAdmin().delete(`/branches/${hcm}`).expect(204);
    });

    it('only assigns TENANT_STAFF accounts of the same tenant', async () => {
      const customer = customerUserAccount();
      const res = await tenantAdmin().post(`/branches/${hcm}/users`, { userId: customer }).expect(422);
      expect(res.body.code).toBe('USER_NOT_TENANT_STAFF');
      const foreign = identity.add({ tenantId: tenantB, userType: 'TENANT_STAFF', roles: ['TECHNICIAN'] });
      await tenantAdmin().post(`/branches/${hcm}/users`, { userId: foreign }).expect(422);
      await api(app, bearer('DISPATCHER', tenantA)).get(`/branches/${hcm}/users`).expect(403);
    });
  });
});

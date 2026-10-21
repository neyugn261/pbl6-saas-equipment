import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import { PrismaService } from '../../src/prisma/prisma.service';
import {
  api,
  bearer,
  createTenant,
  createTestApp,
  resetDatabase,
} from './support/test-app';

describe('Customers and contacts (e2e, organization_test_db)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let tenantA: string;
  let tenantB: string;
  let own: string;
  let other: string;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });

  afterAll(async () => {
    await app?.close();
  });

  const manager = () => api(app, bearer('SERVICE_MANAGER', tenantA));
  const customerUser = () => api(app, bearer('CUSTOMER_USER', tenantA, own));

  beforeEach(async () => {
    await resetDatabase(prisma);
    tenantA = await createTenant(prisma, 'TENANT-A');
    tenantB = await createTenant(prisma, 'TENANT-B');
    own = (await manager().post('/customers', { code: 'C1', name: 'Alpha Hospital' }).expect(201)).body.id;
    other = (await manager().post('/customers', { code: 'C2', name: 'Beta Factory' }).expect(201)).body.id;
  });

  describe('customers', () => {
    it('lets staff list, search, update and soft-delete customers', async () => {
      const list = await manager().get('/customers?q=beta').expect(200);
      expect(list.body.items.map((c: { code: string }) => c.code)).toEqual(['C2']);

      const updated = await manager().patch(`/customers/${own}`, { taxCode: '0101', email: null }).expect(200);
      expect(updated.body).toMatchObject({ taxCode: '0101', email: null, address: null });

      await manager().delete(`/customers/${other}`).expect(204);
      await manager().get(`/customers/${other}`).expect(404);
      expect((await manager().get('/customers').expect(200)).body.total).toBe(1);
    });

    it('limits a CUSTOMER account to its own customer (other customer → 404)', async () => {
      const list = await customerUser().get('/customers').expect(200);
      expect(list.body.items.map((c: { id: string }) => c.id)).toEqual([own]);
      await customerUser().get(`/customers/${own}`).expect(200);
      const res = await customerUser().get(`/customers/${other}`).expect(404);
      expect(res.body.code).toBe('CUSTOMER_NOT_FOUND');
      await customerUser().get(`/customers/${other}/contacts`).expect(404);
    });

    it('keeps writes for staff and refuses a customer account without a customer', async () => {
      await customerUser().post('/customers', { code: 'C3', name: 'x' }).expect(403);
      await customerUser().patch(`/customers/${own}`, { name: 'x' }).expect(403);
      const res = await api(app, bearer('CUSTOMER_USER', tenantA)).get('/customers').expect(403);
      expect(res.body.code).toBe('CUSTOMER_SCOPE_MISSING');
      await api(app, bearer('DISPATCHER', tenantA)).post('/customers', { code: 'C3', name: 'x' }).expect(403);
    });

    it('answers 404 for a customer of another tenant', async () => {
      const otherTenant = api(app, bearer('SERVICE_MANAGER', tenantB));
      await otherTenant.get(`/customers/${own}`).expect(404);
      await otherTenant.patch(`/customers/${own}`, { name: 'x' }).expect(404);
      await otherTenant.delete(`/customers/${own}`).expect(404);
      expect((await otherTenant.get('/customers').expect(200)).body.total).toBe(0);
    });
  });

  describe('contacts', () => {
    it('keeps exactly one primary contact per customer', async () => {
      const first = await manager().post(`/customers/${own}/contacts`, { name: 'An', isPrimary: true }).expect(201);
      const second = await manager().post(`/customers/${own}/contacts`, { name: 'Binh', isPrimary: true }).expect(201);
      let contacts = (await manager().get(`/customers/${own}/contacts`).expect(200)).body;
      expect(contacts.filter((c: { isPrimary: boolean }) => c.isPrimary).map((c: { id: string }) => c.id)).toEqual([second.body.id]);

      await manager().patch(`/contacts/${first.body.id}`, { isPrimary: true }).expect(200);
      contacts = (await customerUser().get(`/customers/${own}/contacts`).expect(200)).body;
      expect(contacts[0]).toMatchObject({ id: first.body.id, isPrimary: true });
      expect(contacts[1]).toMatchObject({ id: second.body.id, isPrimary: false });
    });

    it('only ties a contact to a live site of the same customer', async () => {
      const site = await manager()
        .post(`/customers/${other}/sites`, { code: 'S1', name: 'Plant', address: 'x' })
        .expect(201);
      const res = await manager()
        .post(`/customers/${own}/contacts`, { name: 'An', customerSiteId: site.body.id })
        .expect(422);
      expect(res.body.code).toBe('SITE_NOT_OF_CUSTOMER');
      await manager()
        .post(`/customers/${other}/contacts`, { name: 'An', customerSiteId: site.body.id })
        .expect(201);
    });

    it('soft-deletes a contact and hides contacts of other tenants', async () => {
      const contact = await manager().post(`/customers/${own}/contacts`, { name: 'An' }).expect(201);
      await api(app, bearer('SERVICE_MANAGER', tenantB)).patch(`/contacts/${contact.body.id}`, { name: 'x' }).expect(404);
      await manager().delete(`/contacts/${contact.body.id}`).expect(204);
      await manager().patch(`/contacts/${contact.body.id}`, { name: 'x' }).expect(404);
      expect((await manager().get(`/customers/${own}/contacts`).expect(200)).body).toEqual([]);
    });
  });
});

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

describe('Sites, locations and internal lookups (e2e, organization_test_db)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let tenantA: string;
  let tenantB: string;
  let own: string;
  let other: string;
  let site: string;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });

  afterAll(async () => {
    await app?.close();
  });

  const manager = () => api(app, bearer('SERVICE_MANAGER', tenantA));
  const customerUser = () => api(app, bearer('CUSTOMER_USER', tenantA, own));
  const location = (body: object, siteId = site) =>
    manager().post(`/sites/${siteId}/locations`, body);

  beforeEach(async () => {
    await resetDatabase(prisma);
    tenantA = await createTenant(prisma, 'TENANT-A');
    tenantB = await createTenant(prisma, 'TENANT-B');
    own = (await manager().post('/customers', { code: 'C1', name: 'Alpha' }).expect(201)).body.id;
    other = (await manager().post('/customers', { code: 'C2', name: 'Beta' }).expect(201)).body.id;
    site = (
      await manager()
        .post(`/customers/${own}/sites`, { code: 'S1', name: 'Main', address: '1 A St', latitude: 10.762622, longitude: 106.660172 })
        .expect(201)
    ).body.id;
  });

  describe('sites', () => {
    it('returns coordinates as numbers and nulls for absent values', async () => {
      const res = await customerUser().get(`/sites/${site}`).expect(200);
      expect(res.body).toEqual({
        id: site,
        customerId: own,
        code: 'S1',
        name: 'Main',
        address: '1 A St',
        latitude: 10.762622,
        longitude: 106.660172,
        defaultServicingBranchId: null,
        status: 'ACTIVE',
      });
    });

    it('only accepts a branch of the same tenant as default servicing branch', async () => {
      const foreign = await api(app, bearer('TENANT_ADMIN', tenantB))
        .post('/branches', { code: 'B', name: 'B', address: 'x' })
        .expect(201);
      const res = await manager()
        .patch(`/sites/${site}`, { defaultServicingBranchId: foreign.body.id })
        .expect(422);
      expect(res.body.code).toBe('BRANCH_NOT_FOUND');
    });

    it('hides sites of another customer from a CUSTOMER account', async () => {
      const otherSite = await manager()
        .post(`/customers/${other}/sites`, { code: 'S2', name: 'Plant', address: 'x' })
        .expect(201);
      await customerUser().get(`/sites/${otherSite.body.id}`).expect(404);
      await customerUser().get(`/customers/${other}/sites`).expect(404);
      await customerUser().get(`/sites/${otherSite.body.id}/locations`).expect(404);
      expect((await customerUser().get(`/customers/${own}/sites`).expect(200)).body).toHaveLength(1);
      await customerUser().post(`/customers/${own}/sites`, { code: 'S3', name: 'x', address: 'x' }).expect(403);
    });

    it('hides a site and its locations once the site or its customer is deleted', async () => {
      const room = await location({ name: 'Room', type: 'ROOM' }).expect(201);
      await manager().delete(`/customers/${own}`).expect(204);
      await manager().get(`/sites/${site}`).expect(404);
      await manager().patch(`/locations/${room.body.id}`, { name: 'x' }).expect(404);
    });

    it('keeps the contacts of a deleted site, without the site', async () => {
      const contact = await manager()
        .post(`/customers/${own}/contacts`, { name: 'An', customerSiteId: site })
        .expect(201);
      await manager().delete(`/sites/${site}`).expect(204);
      const contacts = (await manager().get(`/customers/${own}/contacts`).expect(200)).body;
      expect(contacts).toEqual([expect.objectContaining({ id: contact.body.id, customerSiteId: null })]);
    });

    it('answers 404 for a site of another tenant', async () => {
      await api(app, bearer('SERVICE_MANAGER', tenantB)).get(`/sites/${site}`).expect(404);
      await api(app, bearer('SERVICE_MANAGER', tenantB)).delete(`/sites/${site}`).expect(404);
    });
  });

  describe('locations', () => {
    it('builds a tree and refuses cycles', async () => {
      const building = await location({ name: 'Block A', type: 'BUILDING', code: 'A' }).expect(201);
      const floor = await location({ name: 'Floor 1', type: 'FLOOR', parentId: building.body.id }).expect(201);
      const room = await location({ name: 'Room 101', type: 'ROOM', parentId: floor.body.id }).expect(201);

      const cycle = await manager().patch(`/locations/${building.body.id}`, { parentId: room.body.id }).expect(422);
      expect(cycle.body.code).toBe('LOCATION_CYCLE');
      await manager().patch(`/locations/${floor.body.id}`, { parentId: floor.body.id }).expect(422);

      // Moving to the top of the site, then under another branch of the tree, is fine.
      await manager().patch(`/locations/${room.body.id}`, { parentId: null }).expect(200);
      await manager().patch(`/locations/${floor.body.id}`, { parentId: room.body.id }).expect(200);

      const tree = await customerUser().get(`/sites/${site}/locations`).expect(200);
      expect(tree.body).toHaveLength(3);
    });

    it('requires the parent to be in the same site and a unique code per site', async () => {
      const otherSite = await manager()
        .post(`/customers/${own}/sites`, { code: 'S2', name: 'Annex', address: 'x' })
        .expect(201);
      const foreignParent = await location({ name: 'Annex hall', type: 'AREA' }, otherSite.body.id).expect(201);
      const res = await location({ name: 'Room', type: 'ROOM', parentId: foreignParent.body.id }).expect(422);
      expect(res.body.code).toBe('PARENT_NOT_IN_SITE');

      await location({ name: 'Block A', type: 'BUILDING', code: 'A' }).expect(201);
      await location({ name: 'Block A2', type: 'BUILDING', code: 'A' }).expect(409);
      await location({ name: 'x', type: 'GARDEN' }).expect(400);
    });

    it('refuses to delete a location that still has children', async () => {
      const building = await location({ name: 'Block A', type: 'BUILDING' }).expect(201);
      const floor = await location({ name: 'Floor 1', type: 'FLOOR', parentId: building.body.id }).expect(201);
      const res = await manager().delete(`/locations/${building.body.id}`).expect(409);
      expect(res.body.code).toBe('LOCATION_HAS_CHILDREN');
      await manager().delete(`/locations/${floor.body.id}`).expect(204);
      await manager().delete(`/locations/${building.body.id}`).expect(204);
    });
  });

  describe('internal lookups', () => {
    it('returns the customer and site references used by Asset and Service Request', async () => {
      const room = await location({ name: 'Room', type: 'ROOM' }).expect(201);
      const customer = await customerUser().get(`/internal/customers/${own}`).expect(200);
      expect(customer.body).toEqual({ id: own, code: 'C1', name: 'Alpha', status: 'ACTIVE' });

      const ref = await manager()
        .get(`/internal/customers/${own}/sites/${site}?locationId=${room.body.id}`)
        .expect(200);
      expect(ref.body).toEqual({
        customerId: own,
        siteId: site,
        siteStatus: 'ACTIVE',
        locationId: room.body.id,
        defaultServicingBranchId: null,
      });
    });

    it('returns a branch reference of the caller tenant only', async () => {
      const admin = api(app, bearer('TENANT_ADMIN', tenantA));
      const branch = await admin.post('/branches', { code: 'HCM', name: 'HCM', address: 'x' }).expect(201);
      const ref = await api(app, bearer('DISPATCHER', tenantA)).get(`/internal/branches/${branch.body.id}`).expect(200);
      expect(ref.body).toEqual({ id: branch.body.id, code: 'HCM', name: 'HCM', status: 'ACTIVE' });
      const res = await api(app, bearer('DISPATCHER', tenantB)).get(`/internal/branches/${branch.body.id}`).expect(404);
      expect(res.body.code).toBe('BRANCH_NOT_FOUND');
      await customerUser().get(`/internal/branches/${branch.body.id}`).expect(403);
      await admin.delete(`/branches/${branch.body.id}`).expect(204);
      await api(app, bearer('DISPATCHER', tenantA)).get(`/internal/branches/${branch.body.id}`).expect(404);
    });

    it('answers 404 with a specific code for mismatched ids', async () => {
      const otherSite = await manager()
        .post(`/customers/${other}/sites`, { code: 'S2', name: 'Plant', address: 'x' })
        .expect(201);
      const otherRoom = await location({ name: 'Hall', type: 'AREA' }, otherSite.body.id).expect(201);

      const wrongSite = await manager().get(`/internal/customers/${own}/sites/${otherSite.body.id}`).expect(404);
      expect(wrongSite.body.code).toBe('SITE_NOT_FOUND');
      const wrongLocation = await manager()
        .get(`/internal/customers/${own}/sites/${site}?locationId=${otherRoom.body.id}`)
        .expect(404);
      expect(wrongLocation.body.code).toBe('LOCATION_NOT_FOUND');
      const otherCustomer = await customerUser().get(`/internal/customers/${other}`).expect(404);
      expect(otherCustomer.body.code).toBe('CUSTOMER_NOT_FOUND');
      await api(app, bearer('SERVICE_MANAGER', tenantB)).get(`/internal/customers/${own}`).expect(404);
    });
  });
});

import { randomUUID } from 'node:crypto';
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

describe('Branches (e2e, organization_test_db)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let tenantA: string;
  let tenantB: string;

  const branch = { code: 'HCM', name: 'Ho Chi Minh', address: '1 Le Loi' };

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    tenantA = await createTenant(prisma, 'TENANT-A');
    tenantB = await createTenant(prisma, 'TENANT-B');
  });

  const admin = () => api(app, bearer('TENANT_ADMIN', tenantA));

  it('creates, lists, reads, updates and soft-deletes a branch', async () => {
    const created = await admin().post('/branches', branch).expect(201);
    expect(created.body).toMatchObject({ ...branch, phone: null, email: null, status: 'ACTIVE' });
    expect(created.body).not.toHaveProperty('tenantId');
    const id = created.body.id;

    const list = await api(app, bearer('DISPATCHER', tenantA)).get('/branches?q=chi').expect(200);
    expect(list.body).toMatchObject({ page: 1, pageSize: 20, total: 1 });

    await admin().patch(`/branches/${id}`, { status: 'INACTIVE', phone: '0901' }).expect(200);
    const read = await admin().get(`/branches/${id}`).expect(200);
    expect(read.body).toMatchObject({ status: 'INACTIVE', phone: '0901' });

    await admin().delete(`/branches/${id}`).expect(204);
    await admin().get(`/branches/${id}`).expect(404);
    const after = await admin().get('/branches').expect(200);
    expect(after.body.total).toBe(0);
  });

  it('answers 404 for a branch of another tenant', async () => {
    const other = await api(app, bearer('TENANT_ADMIN', tenantB)).post('/branches', branch).expect(201);
    const res = await admin().get(`/branches/${other.body.id}`).expect(404);
    expect(res.body.code).toBe('BRANCH_NOT_FOUND');
    await admin().patch(`/branches/${other.body.id}`, { name: 'x' }).expect(404);
    await admin().delete(`/branches/${other.body.id}`).expect(404);
  });

  it('checks permissions and account types', async () => {
    const res = await api(app, bearer('DISPATCHER', tenantA)).post('/branches', branch).expect(403);
    expect(res.body.details.required).toEqual(['branch:manage']);
    await api(app, bearer('CUSTOMER_ADMIN', tenantA, randomUUID())).get('/branches').expect(403);
    await api(app, bearer('PLATFORM_ADMIN')).get('/branches').expect(403);
    await api(app, 'Bearer nope').get('/branches').expect(401);
  });

  it('rejects a duplicate code, a tenantId in the body and a null name', async () => {
    await admin().post('/branches', branch).expect(201);
    const dup = await admin().post('/branches', branch).expect(409);
    expect(dup.body.code).toBe('UNIQUE_VIOLATION');
    // Same code in another tenant is fine.
    await api(app, bearer('TENANT_ADMIN', tenantB)).post('/branches', branch).expect(201);

    const injected = await admin().post('/branches', { ...branch, code: 'X', tenantId: tenantB }).expect(400);
    expect(injected.body.code).toBe('VALIDATION_FAILED');
    const created = await admin().post('/branches', { ...branch, code: 'Y' }).expect(201);
    await admin().patch(`/branches/${created.body.id}`, { name: null }).expect(400);
  });

  it('refuses to delete a branch still used by a site or a staff assignment', async () => {
    const used = await admin().post('/branches', branch).expect(201);
    const customer = await admin().post('/customers', { code: 'C1', name: 'Customer 1' }).expect(201);
    await admin()
      .post(`/customers/${customer.body.id}/sites`, {
        code: 'S1',
        name: 'Site 1',
        address: 'x',
        defaultServicingBranchId: used.body.id,
      })
      .expect(201);
    const res = await admin().delete(`/branches/${used.body.id}`).expect(409);
    expect(res.body.code).toBe('BRANCH_IN_USE');

    const staffed = await admin().post('/branches', { ...branch, code: 'DN' }).expect(201);
    await prisma.branchUserAssignment.create({
      data: { tenantId: tenantA, branchId: staffed.body.id, userId: randomUUID() },
    });
    await admin().delete(`/branches/${staffed.body.id}`).expect(409);
  });
});

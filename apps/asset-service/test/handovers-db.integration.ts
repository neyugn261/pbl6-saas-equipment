import { randomUUID } from 'node:crypto';
import { requireTestDatabaseUrl } from '@pbl6/testing';
import { createPrismaAdapter } from '@pbl6/service-kit/prisma';
import { permissionsOf, type Principal } from '@pbl6/auth';
import { PrismaClient } from '../src/generated/prisma/client.js';
import type { PrismaService } from '../src/prisma/prisma.service';
import { HandoverRepository } from '../src/handovers/handover.repository';
import { HandoverService } from '../src/handovers/handover.service';
import { HandoverAuthorization } from '../src/handovers/handover-authorization';
import { FakeOrganizationClient } from './support/fake-organization-client';
import { EquipmentRepository } from '../src/equipment/equipment.repository';

const db = new PrismaClient({ adapter: createPrismaAdapter(requireTestDatabaseUrl('ASSET_TEST_DATABASE_URL')) });
const prisma = db as unknown as PrismaService;
const repository = new HandoverRepository(prisma), equipment = new EquipmentRepository(prisma);
const organization = new FakeOrganizationClient();
const tenantId = randomUUID(), customerId = randomUUID(), siteId = randomUUID();
const staff: Principal = { userId: randomUUID(), tenantId, customerId: null, userType: 'TENANT_STAFF', roles: ['SERVICE_MANAGER'],
  permissions: permissionsOf(['SERVICE_MANAGER']), sessionId: randomUUID(), accessToken: 'test', expiresAt: new Date(Date.now() + 60000) };
const customer: Principal = { ...staff, userId: randomUUID(), userType: 'CUSTOMER', customerId,
  roles: ['CUSTOMER_ADMIN'], permissions: permissionsOf(['CUSTOMER_ADMIN']) };
const authorize = { check: jest.fn(async () => undefined) };
const service = new HandoverService(repository, authorize as unknown as HandoverAuthorization, organization);
let modelId: string;
beforeAll(async () => {
  await db.$connect();
  modelId = (await db.equipmentModel.create({ data: { tenantId, manufacturer: 'Handover test', modelCode: randomUUID(), name: 'Pump' } })).id;
  organization.customers.set(customerId, { id: customerId, code: 'C', name: 'Customer', status: 'ACTIVE' });
  organization.sites.set(`${customerId}:${siteId}`, { customerId, siteId, siteStatus: 'ACTIVE', locationId: null, defaultServicingBranchId: null });
});
afterAll(async () => {
  await db.outboxEvent.deleteMany({ where: { tenantId } });
  await db.equipmentHandoverAudit.deleteMany({ where: { tenantId } });
  await db.equipmentHandover.deleteMany({ where: { tenantId } });
  await db.equipmentHistory.deleteMany({ where: { tenantId } });
  await db.equipment.deleteMany({ where: { tenantId } });
  await db.equipmentModel.deleteMany({ where: { tenantId } });
  await db.$disconnect();
});
async function fixture(legacy = false) {
  const eq = await equipment.createWithHistory(tenantId, staff.userId, { modelId, customerId, customerSiteId: siteId,
    assetCode: randomUUID(), serialNumber: randomUUID(), handoverRequired: !legacy });
  const input = { equipmentId: eq.id, expiresAt: new Date(Date.now() + 86400000).toISOString(), deliveryAt: new Date().toISOString(), condition: 'New', notes: '<script>not executable</script>' };
  const row = await service.create(staff, input);
  return { eq, row, input };
}
it('keeps legacy ACTIVE and gates new equipment across old API/direct DB writes', async () => {
  const { eq, row } = await fixture();
  expect(eq.status).toBe('OUT_OF_SERVICE');
  await expect(equipment.patchWithHistory({ tenantId, customerId: null }, eq.id, staff.userId, { status: 'ACTIVE' })).rejects.toMatchObject({ status: 409 });
  await expect(db.equipment.update({ where: { id: eq.id }, data: { status: 'ACTIVE' } })).rejects.toThrow();
  await expect(db.equipment.update({ where: { id: eq.id }, data: { handoverRequired: false } })).rejects.toThrow();
  await expect(service.act(customer, row.id, 'accept')).rejects.toMatchObject({ status: 404 });
  const legacy = await fixture(true);
  expect((await db.equipment.findUniqueOrThrow({ where: { id: legacy.eq.id } })).status).toBe('ACTIVE');
});
it('serializes duplicate create and accepts once with atomic audit/outbox', async () => {
  const { eq, row, input } = await fixture();
  const creates = await Promise.allSettled([service.create(staff, input), service.create(staff, input)]);
  expect(creates.every(r => r.status === 'rejected')).toBe(true);
  await service.act(staff, row.id, 'submit');
  await Promise.all([service.act(customer, row.id, 'accept'), service.act(customer, row.id, 'accept')]);
  expect((await db.equipment.findUniqueOrThrow({ where: { id: eq.id } })).status).toBe('ACTIVE');
  expect(await db.equipmentHandoverAudit.count({ where: { handoverId: row.id, action: 'ACCEPTED' } })).toBe(1);
  expect(await db.outboxEvent.count({ where: { aggregateId: row.id } })).toBe(2);
});
it.each(['reject', 'cancel'] as const)('serializes accept against %s without split outcomes', async action => {
  const { eq, row } = await fixture(); await service.act(staff, row.id, 'submit');
  const results = await Promise.allSettled([service.act(customer, row.id, 'accept'), service.act(action === 'reject' ? customer : staff, row.id, action, 'Incorrect serial')]);
  expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
  const final = await db.equipmentHandover.findUniqueOrThrow({ where: { id: row.id } });
  expect((await db.equipment.findUniqueOrThrow({ where: { id: eq.id } })).status).toBe(final.status === 'ACTIVATED' ? 'ACTIVE' : 'OUT_OF_SERVICE');
});
it('expires under lock, preserves expiry on failed accept, and supersedes terminal occurrence', async () => {
  const { eq, row, input } = await fixture(); await service.act(staff, row.id, 'submit');
  await db.equipmentHandover.update({ where: { id: row.id }, data: { expiresAt: new Date(0) } });
  await Promise.allSettled([service.act(customer, row.id, 'accept'), service.expireDue()]);
  expect((await db.equipmentHandover.findUniqueOrThrow({ where: { id: row.id } })).status).toBe('EXPIRED');
  expect(await db.equipmentHandoverAudit.count({ where: { handoverId: row.id, action: 'EXPIRED' } })).toBe(1);
  const next = await service.create(staff, input);
  await expect(service.act(customer, row.id, 'accept')).rejects.toMatchObject({ status: 409 });
  expect((await db.equipment.findUniqueOrThrow({ where: { id: eq.id } })).currentHandoverId).toBe(next.id);
});
it('scopes IDs to tenant/customer and hides staff data', async () => {
  const { row } = await fixture(); await service.act(staff, row.id, 'submit');
  for (const outsider of [{ ...customer, tenantId: randomUUID() }, { ...customer, customerId: randomUUID() }])
    await expect(service.detail(outsider, row.id)).rejects.toMatchObject({ status: 404 });
  const detail = await service.detail(customer, row.id);
  expect(detail).not.toHaveProperty('createdBy');
  expect(detail.audit[0]).not.toHaveProperty('actorId');
});
it('rejects a stale destination snapshot and preserves negative-flow activation gate', async () => {
  const { eq, row, input } = await fixture(); await service.act(staff, row.id, 'submit');
  await service.act(customer, row.id, 'reject', 'Wrong equipment');
  expect((await db.equipment.findUniqueOrThrow({ where: { id: eq.id } })).status).toBe('OUT_OF_SERVICE');
  const next = await service.create(staff, input); await service.act(staff, next.id, 'submit');
  await db.equipment.update({ where: { id: eq.id }, data: { customerSiteId: randomUUID() } });
  await expect(service.act(customer, next.id, 'accept')).rejects.toMatchObject({ status: 409 });
});

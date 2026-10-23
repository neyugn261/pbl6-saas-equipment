import { randomUUID } from 'node:crypto';
import { config as loadEnv } from 'dotenv';
import { requireTestDatabaseUrl } from '@pbl6/testing';
import { createPrismaAdapter } from '@pbl6/service-kit/prisma';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { EquipmentRepository, dbDate } from '../src/equipment/equipment.repository';
import type { PrismaService } from '../src/prisma/prisma.service';

// Dedicated opt-in suite. Never use ASSET_DATABASE_URL or reset existing data.
loadEnv({ path: '../../.env', quiet: true });
const databaseUrl = requireTestDatabaseUrl('ASSET_TEST_DATABASE_URL');
const prisma = new PrismaClient({ adapter: createPrismaAdapter(databaseUrl) });
const repo = new EquipmentRepository(prisma as unknown as PrismaService);
const tenantId = randomUUID();
const customerId = randomUUID();
const siteId = randomUUID();
const otherSiteId = randomUUID();
const actorId = randomUUID();
let modelId: string;
let otherModelId: string;

const input = (assetCode: string, serialNumber: string, selectedModelId = modelId) => ({
  modelId: selectedModelId, customerId, customerSiteId: siteId, assetCode, serialNumber,
});

beforeAll(async () => {
  await prisma.$connect();
  const first = await prisma.equipmentModel.create({ data: { tenantId,
    manufacturer: 'Integration', modelCode: randomUUID(), name: 'Pump' } });
  const second = await prisma.equipmentModel.create({ data: { tenantId,
    manufacturer: 'Integration', modelCode: randomUUID(), name: 'Valve' } });
  modelId = first.id; otherModelId = second.id;
});

afterAll(async () => {
  await prisma.equipmentHistory.deleteMany({ where: { tenantId } });
  await prisma.warranty.deleteMany({ where: { tenantId } });
  await prisma.equipmentQrCode.deleteMany({ where: { tenantId } });
  await prisma.equipment.deleteMany({ where: { tenantId } });
  await prisma.equipmentModel.deleteMany({ where: { tenantId } });
  await prisma.$disconnect();
});

it('rolls back registration if history fails, and enforces both uniqueness keys under concurrent inserts', async () => {
  await expect(repo.createWithHistory(tenantId, 'invalid-uuid', input('rollback', 'S-rollback'))).rejects.toThrow();
  expect(await prisma.equipment.count({ where: { tenantId, assetCode: 'rollback' } })).toBe(0);
  await prisma.equipmentModel.update({ where: { id: modelId }, data: { status: 'INACTIVE' } });
  await expect(repo.createWithHistory(tenantId, actorId, input('inactive-model', 'S-inactive')))
    .rejects.toMatchObject({ status: 422, response: { code: 'MODEL_INACTIVE' } });
  expect(await prisma.equipment.count({ where: { tenantId, assetCode: 'inactive-model' } })).toBe(0);
  await prisma.equipmentModel.update({ where: { id: modelId }, data: { status: 'ACTIVE' } });
  const sameAsset = await Promise.allSettled([
    repo.createWithHistory(tenantId, actorId, input('same-asset', 'S-1')),
    repo.createWithHistory(tenantId, actorId, input('same-asset', 'S-2')),
  ]);
  expect(sameAsset.filter((item) => item.status === 'fulfilled')).toHaveLength(1);
  expect(sameAsset.filter((item) => item.status === 'rejected')).toHaveLength(1);
  expect(await prisma.equipmentHistory.count({ where: { tenantId, eventType: 'REGISTERED' } })).toBe(1);
  const sameSerial = await Promise.allSettled([
    repo.createWithHistory(tenantId, actorId, input('serial-a', 'S-shared')),
    repo.createWithHistory(tenantId, actorId, input('serial-b', 'S-shared')),
  ]);
  expect(sameSerial.filter((item) => item.status === 'fulfilled')).toHaveLength(1);
  expect(sameSerial.filter((item) => item.status === 'rejected')).toHaveLength(1);
  await expect(repo.createWithHistory(tenantId, actorId, input('other-model', 'S-shared', otherModelId)))
    .resolves.toMatchObject({ modelId: otherModelId, serialNumber: 'S-shared' });
});

it('serializes concurrent moves and retirement, and never records a failed or no-op patch', async () => {
  const row = await repo.createWithHistory(tenantId, actorId, input('patch-target', 'S-patch'));
  const scope = { tenantId, customerId: null };
  await repo.patchWithHistory(scope, row.id, actorId, { status: 'ACTIVE' });
  expect(await prisma.equipmentHistory.count({ where: { tenantId, equipmentId: row.id } })).toBe(1);
  const outcomes = await Promise.allSettled([
    repo.patchWithHistory(scope, row.id, actorId, { status: 'RETIRED' }),
    repo.patchWithHistory(scope, row.id, actorId, { customerSiteId: otherSiteId }),
  ]);
  expect(outcomes[0].status).toBe('fulfilled');
  const final = await prisma.equipment.findUniqueOrThrow({ where: { id: row.id } });
  expect(final.status).toBe('RETIRED');
  const history = await prisma.equipmentHistory.findMany({ where: { tenantId, equipmentId: row.id } });
  expect(history.filter((entry) => entry.eventType === 'STATUS_CHANGED')).toHaveLength(1);
  expect(history.filter((entry) => entry.eventType === 'MOVED')).toHaveLength(outcomes[1].status === 'fulfilled' ? 1 : 0);
  await expect(repo.patchWithHistory(scope, row.id, actorId, { status: 'ACTIVE' })).rejects.toMatchObject({ status: 409 });
});

it('evaluates real ACTIVE warranties and stable list predicates, ignoring VOID and future periods', async () => {
  const row = await repo.createWithHistory(tenantId, actorId, input('warranty-target', 'S-warranty'));
  await prisma.warranty.createMany({ data: [
    { tenantId, equipmentId: row.id, startDate: dbDate('2026-01-01'), endDate: dbDate('2026-01-31'), warrantyType: 'STANDARD' },
    { tenantId, equipmentId: row.id, startDate: dbDate('2026-03-01'), endDate: dbDate('2026-03-31'), warrantyType: 'STANDARD' },
    { tenantId, equipmentId: row.id, startDate: dbDate('2026-04-01'), endDate: dbDate('2026-04-30'), warrantyType: 'STANDARD', status: 'VOID' },
  ] });
  expect(await repo.warrantyAt(tenantId, row.id, '2025-12-31')).toBeNull();
  expect((await repo.warrantyAt(tenantId, row.id, '2026-01-01'))?.endDate).toEqual(dbDate('2026-01-31'));
  expect((await repo.warrantyAt(tenantId, row.id, '2026-02-15'))?.endDate).toEqual(dbDate('2026-01-31'));
  expect((await repo.warrantyAt(tenantId, row.id, '2026-03-31'))?.endDate).toEqual(dbDate('2026-03-31'));
  expect((await repo.warrantyAt(tenantId, row.id, '2026-05-01'))?.endDate).toEqual(dbDate('2026-03-31'));
  const listed = await repo.list({ tenantId, customerId }, { page: 1, pageSize: 20,
    sort: '-createdAt', warranty: 'OUT_OF_WARRANTY' });
  expect(listed.rows.some((item) => item.id === row.id)).toBe(true);
  const searched = await repo.list({ tenantId, customerId }, { page: 1, pageSize: 20,
    sort: '-createdAt', q: 'pump' });
  expect(searched.rows.some((item) => item.id === row.id)).toBe(true);
  const outsideCustomer = await repo.list({ tenantId, customerId: randomUUID() }, { page: 1,
    pageSize: 20, sort: '-createdAt', q: 'pump' });
  expect(outsideCustomer.rows).toHaveLength(0);
});

import { randomUUID } from 'node:crypto';
import { config as loadEnv } from 'dotenv';
import { requireTestDatabaseUrl } from '@pbl6/testing';
import { createPrismaAdapter } from '@pbl6/service-kit/prisma';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { EquipmentRepository, dbDate } from '../src/equipment/equipment.repository';
import { WarrantyRepository } from '../src/warranties/warranty.repository';
import { QrRepository } from '../src/qr/qr.repository';
import type { PrismaService } from '../src/prisma/prisma.service';

// Dedicated opt-in suite. Never use ASSET_DATABASE_URL or reset existing data.
loadEnv({ path: '../../.env', quiet: true });
const databaseUrl = requireTestDatabaseUrl('ASSET_TEST_DATABASE_URL');
const prisma = new PrismaClient({ adapter: createPrismaAdapter(databaseUrl) });
const repo = new EquipmentRepository(prisma as unknown as PrismaService);
const warranties = new WarrantyRepository(prisma as unknown as PrismaService);
const qrCodes = new QrRepository(prisma as unknown as PrismaService);
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

it('rejects a location-only patch validated against a site that changed before the write', async () => {
  const row = await repo.createWithHistory(tenantId, actorId, input('stale-site', 'S-stale'));
  const scope = { tenantId, customerId: null };
  await repo.patchWithHistory(scope, row.id, actorId, { customerSiteId: otherSiteId });
  const historyCount = await prisma.equipmentHistory.count({ where: { tenantId, equipmentId: row.id } });
  await expect(repo.patchWithHistory(scope, row.id, actorId, { locationId: randomUUID() }, siteId))
    .rejects.toMatchObject({ status: 409, response: { code: 'EQUIPMENT_SITE_CHANGED' } });
  expect(await prisma.equipment.findUniqueOrThrow({ where: { id: row.id } }))
    .toMatchObject({ customerSiteId: otherSiteId, locationId: null });
  expect(await prisma.equipmentHistory.count({ where: { tenantId, equipmentId: row.id } }))
    .toBe(historyCount);
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

it('serializes overlapping warranty writes, keeps VOID history, and respects customer scope', async () => {
  const row = await repo.createWithHistory(tenantId, actorId, input('warranty-write', 'S-write'));
  const scope = { tenantId, customerId: null };
  const first = { startDate: '2028-02-28', endDate: '2028-02-29', warrantyType: 'STANDARD' };
  const results = await Promise.allSettled([
    warranties.add(scope, row.id, actorId, first),
    warranties.add(scope, row.id, actorId, { ...first, startDate: '2028-02-29', endDate: '2028-03-01' }),
  ]);
  expect(results.filter((item) => item.status === 'fulfilled')).toHaveLength(1);
  expect(results.filter((item) => item.status === 'rejected')).toHaveLength(1);
  const saved = await warranties.list({ tenantId, customerId }, row.id);
  expect(saved).toHaveLength(1);
  await expect(warranties.list({ tenantId, customerId: randomUUID() }, row.id))
    .rejects.toMatchObject({ status: 404 });
  await expect(warranties.add({ tenantId: randomUUID(), customerId: null }, row.id, actorId, first))
    .rejects.toMatchObject({ status: 404 });
  const voided = await warranties.void(scope, saved[0].id, actorId, 'entered in error');
  expect(voided.status).toBe('VOID');
  await expect(warranties.void(scope, saved[0].id, actorId))
    .rejects.toMatchObject({ status: 409, response: { code: 'INVALID_STATE_TRANSITION' } });
  await expect(warranties.add(scope, row.id, actorId, first)).resolves.toMatchObject({ status: 'ACTIVE' });
  const history = await prisma.equipmentHistory.findMany({ where: { tenantId, equipmentId: row.id } });
  expect(history.filter((entry) => entry.eventType === 'WARRANTY_ADDED')).toHaveLength(2);
  expect(history.filter((entry) => entry.eventType === 'WARRANTY_VOIDED')).toHaveLength(1);
});

it('reprints QR atomically, leaves one active code, and scopes resolution', async () => {
  const row = await repo.createWithHistory(tenantId, actorId, input('qr-target', 'S-qr'));
  const scope = { tenantId, customerId: null };
  const firstToken = 'a'.repeat(43);
  const secondToken = 'b'.repeat(43);
  const thirdToken = 'c'.repeat(43);
  await qrCodes.issue(scope, row.id, actorId, firstToken);
  const issued = await Promise.all([
    qrCodes.issue(scope, row.id, actorId, secondToken),
    qrCodes.issue(scope, row.id, actorId, thirdToken),
  ]);
  expect(issued).toHaveLength(2);
  const active = await prisma.equipmentQrCode.findMany({ where: { tenantId, equipmentId: row.id, revokedAt: null } });
  expect(active).toHaveLength(1);
  expect(await qrCodes.resolve({ tenantId, customerId }, active[0].token)).toMatchObject({ id: row.id });
  await expect(qrCodes.resolve({ tenantId, customerId }, firstToken)).rejects.toMatchObject({ status: 404 });
  await expect(qrCodes.resolve({ tenantId, customerId: randomUUID() }, active[0].token))
    .rejects.toMatchObject({ status: 404 });
  await expect(qrCodes.resolve({ tenantId: randomUUID(), customerId: null }, active[0].token))
    .rejects.toMatchObject({ status: 404 });
  await expect(qrCodes.issue(scope, row.id, actorId, active[0].token)).rejects.toThrow();
  expect(await prisma.equipmentQrCode.count({ where: { tenantId, equipmentId: row.id, revokedAt: null } }))
    .toBe(1);
  await qrCodes.revoke(scope, row.id, actorId);
  await qrCodes.revoke(scope, row.id, actorId);
  await expect(qrCodes.resolve(scope, active[0].token)).rejects.toMatchObject({ status: 404 });
  const history = await prisma.equipmentHistory.findMany({ where: { tenantId, equipmentId: row.id } });
  expect(history.filter((entry) => entry.eventType === 'QR_CREATED')).toHaveLength(1);
  expect(history.filter((entry) => entry.eventType === 'QR_REPRINTED')).toHaveLength(2);
  expect(history.filter((entry) => entry.eventType === 'QR_REVOKED')).toHaveLength(1);
});

it('isolates persisted equipment across two tenants and two customers in one tenant', async () => {
  const secondTenantId = randomUUID();
  const secondCustomerId = randomUUID();
  const secondModel = await prisma.equipmentModel.create({ data: {
    tenantId: secondTenantId, manufacturer: 'Other tenant', modelCode: randomUUID(), name: 'Other pump',
  } });
  try {
    const first = await repo.createWithHistory(tenantId, actorId, input('isolation-a', 'S-isolation-a'));
    const second = await repo.createWithHistory(tenantId, actorId, {
      ...input('isolation-b', 'S-isolation-b'), customerId: secondCustomerId,
    });
    const foreign = await repo.createWithHistory(secondTenantId, actorId, {
      ...input('isolation-c', 'S-isolation-c', secondModel.id), customerId,
    });
    expect(await repo.findScoped({ tenantId, customerId }, first.id)).toMatchObject({ id: first.id });
    expect(await repo.findScoped({ tenantId, customerId }, second.id)).toBeNull();
    expect(await repo.findScoped({ tenantId, customerId }, foreign.id)).toBeNull();
    expect(await repo.findScoped({ tenantId: secondTenantId, customerId: null }, first.id)).toBeNull();
    const listed = await repo.list({ tenantId, customerId }, { page: 1, pageSize: 100, sort: '-createdAt' });
    expect(listed.rows.some((row) => row.id === first.id)).toBe(true);
    expect(listed.rows.some((row) => row.id === second.id || row.id === foreign.id)).toBe(false);
  } finally {
    await prisma.equipmentHistory.deleteMany({ where: { tenantId: secondTenantId } });
    await prisma.equipment.deleteMany({ where: { tenantId: secondTenantId } });
    await prisma.equipmentModel.deleteMany({ where: { tenantId: secondTenantId } });
  }
});

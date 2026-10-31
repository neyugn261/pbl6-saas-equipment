import { ConflictException } from '@nestjs/common';
import { EquipmentRepository, dbDate, todayInVietnam } from './equipment.repository';
import type { PrismaService } from '../prisma/prisma.service';

const tenantId = '00000000-0000-4000-8000-000000000001';
const equipmentId = '00000000-0000-4000-8000-000000000002';
const modelId = '00000000-0000-4000-8000-000000000003';
const customerId = '00000000-0000-4000-8000-000000000004';
const siteId = '00000000-0000-4000-8000-000000000005';
const siteB = '00000000-0000-4000-8000-000000000006';
const actorId = '00000000-0000-4000-8000-000000000007';
const now = new Date('2026-10-21T00:00:00Z');
const base = () => ({ id: equipmentId, tenantId, modelId, customerId, customerSiteId: siteId,
  locationId: '00000000-0000-4000-8000-000000000008', assetCode: 'A', serialNumber: 'S',
  installationDate: null, handoverDate: null, status: 'ACTIVE', snapshotVersion: 0, createdAt: now, updatedAt: now });

describe('EquipmentRepository', () => {
  it('scopes list and translates all three real warranty states into database predicates', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const count = jest.fn().mockResolvedValue(0);
    const repo = new EquipmentRepository({ equipment: { findMany, count } } as unknown as PrismaService);
    for (const warranty of ['IN_WARRANTY', 'OUT_OF_WARRANTY', 'NO_WARRANTY'] as const) {
      await repo.list({ tenantId, customerId }, { page: 2, pageSize: 5, sort: '-createdAt',
        customerId: '00000000-0000-4000-8000-000000000099', warranty });
      const args = findMany.mock.lastCall?.[0];
      expect(args.where).toMatchObject({ tenantId, customerId });
      expect(args.skip).toBe(5);
      expect(args.orderBy).toEqual([{ createdAt: 'desc' }, { id: 'asc' }]);
      if (warranty === 'IN_WARRANTY') {
        expect(args.where.warranties.some.status).toBe('ACTIVE');
      } else {
        expect(args.where.AND).toHaveLength(2);
        expect(args.where.AND[0].warranties.none.status).toBe('ACTIVE');
        expect(args.where.AND[1].warranties[warranty === 'OUT_OF_WARRANTY' ? 'some' : 'none'].status).toBe('ACTIVE');
      }
    }
    expect(dbDate(todayInVietnam()).toISOString()).toMatch(/^\d{4}-\d{2}-\d{2}T00:00:00.000Z$/);
  });

  it('selects covering ACTIVE warranty, otherwise latest ended ACTIVE; VOID and future never count', async () => {
    const findFirst = jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'ended' });
    const repo = new EquipmentRepository({ warranty: { findFirst } } as unknown as PrismaService);
    expect(await repo.warrantyAt(tenantId, equipmentId, '2026-10-21')).toEqual({ id: 'ended' });
    expect(findFirst.mock.calls[0][0]).toMatchObject({ where: { tenantId, equipmentId, status: 'ACTIVE' } });
    expect(findFirst.mock.calls[1][0]).toMatchObject({
      where: { status: 'ACTIVE', endDate: { lt: dbDate('2026-10-21') } },
      orderBy: [{ endDate: 'desc' }, { id: 'asc' }],
    });
  });

  it('writes REGISTERED in the same transaction and rejects failed history without returning equipment', async () => {
    const create = jest.fn().mockResolvedValue(base());
    const historyCreate = jest.fn().mockRejectedValue(new Error('history failure'));
    const lockModel = jest.fn().mockResolvedValue([{ status: 'ACTIVE' }]);
    const transaction = jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({ $queryRaw: lockModel, equipment: { create }, equipmentHistory: { create: historyCreate } }));
    const repo = new EquipmentRepository({ $transaction: transaction } as unknown as PrismaService);
    await expect(repo.createWithHistory(tenantId, actorId, {
      modelId, customerId, customerSiteId: siteId, assetCode: 'A', serialNumber: 'S',
    })).rejects.toThrow('history failure');
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(lockModel).toHaveBeenCalledTimes(1);
    expect(historyCreate).toHaveBeenCalledWith({ data: expect.objectContaining({
      tenantId, equipmentId, eventType: 'REGISTERED', createdBy: actorId,
    }) });
  });

  it('rechecks model status under lock so a deactivated model cannot be registered', async () => {
    const create = jest.fn();
    const lockModel = jest.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([{ status: 'INACTIVE' }]);
    const repo = new EquipmentRepository({ $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({ $queryRaw: lockModel, equipment: { create } }) } as unknown as PrismaService);
    for (const code of ['MODEL_NOT_FOUND', 'MODEL_INACTIVE']) {
      await expect(repo.createWithHistory(tenantId, actorId, {
        modelId, customerId, customerSiteId: siteId, assetCode: 'A', serialNumber: 'S',
      })).rejects.toMatchObject({ response: { code } });
    }
    expect(create).not.toHaveBeenCalled();
  });

  it('clears the old location when moving site and records every changed category after row lock', async () => {
    const events = jest.fn();
    const update = jest.fn().mockImplementation(async ({ data }) => ({ ...base(), ...data }));
    const tx = { $executeRawUnsafe: jest.fn().mockResolvedValue(1), $queryRaw: jest.fn().mockResolvedValue([{ id: equipmentId }]),
      equipment: { findFirst: jest.fn().mockResolvedValue(base()), update },
      equipmentHistory: { createMany: events } };
    const repo = new EquipmentRepository({ $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(tx) } as unknown as PrismaService);
    const after = await repo.patchWithHistory({ tenantId, customerId: null }, equipmentId, actorId,
      { customerSiteId: siteB, status: 'OUT_OF_SERVICE', handoverDate: '2026-10-20' });
    expect(after).toMatchObject({ customerSiteId: siteB, locationId: null, status: 'OUT_OF_SERVICE' });
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(tx.equipment.findFirst.mock.invocationCallOrder[0]);
    expect(events.mock.calls[0][0].data.map((row: {eventType: string}) => row.eventType))
      .toEqual(['MOVED', 'STATUS_CHANGED', 'DETAILS_UPDATED']);
    expect(events.mock.calls[0][0].data.every((row: {createdBy: string}) => row.createdBy === actorId)).toBe(true);
  });

  it('does not update or write history for a no-op and blocks RETIRED after lock', async () => {
    const update = jest.fn(); const createMany = jest.fn();
    const findFirst = jest.fn().mockResolvedValueOnce(base()).mockResolvedValueOnce({ ...base(), status: 'RETIRED' });
    const tx = { $queryRaw: jest.fn(), equipment: { findFirst, update }, equipmentHistory: { createMany } };
    const repo = new EquipmentRepository({ $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(tx) } as unknown as PrismaService);
    expect(await repo.patchWithHistory({ tenantId, customerId: null }, equipmentId, actorId, { status: 'ACTIVE' }))
      .toMatchObject({ status: 'ACTIVE' });
    await expect(repo.patchWithHistory({ tenantId, customerId: null }, equipmentId, actorId, { status: 'ACTIVE' }))
      .rejects.toBeInstanceOf(ConflictException);
    expect(update).not.toHaveBeenCalled();
    expect(createMany).not.toHaveBeenCalled();
  });

  it('orders history by timestamp then ID after checking the equipment scope', async () => {
    const findFirst = jest.fn().mockResolvedValue(base());
    const findMany = jest.fn().mockResolvedValue([]);
    const count = jest.fn().mockResolvedValue(0);
    const repo = new EquipmentRepository({ equipment: { findFirst }, equipmentHistory: { findMany, count } } as unknown as PrismaService);
    await repo.history({ tenantId, customerId }, equipmentId, 3, 10);
    expect(findFirst).toHaveBeenCalledWith({ where: { tenantId, customerId, id: equipmentId } });
    expect(findMany).toHaveBeenCalledWith({ where: expect.objectContaining({ tenantId, equipmentId }),
      orderBy: [{ occurredAt: 'desc' }, { id: 'asc' }], skip: 20, take: 10 });
  });
});

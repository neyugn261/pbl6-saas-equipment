import { EquipmentModelRepository } from './equipment-model.repository';
import type { PrismaService } from '../prisma/prisma.service';
import { ListEquipmentModelsQueryDto } from './dto/list-equipment-models-query.dto';

describe('EquipmentModelRepository tenant queries', () => {
  const findMany = jest.fn(async (_args: unknown) => []);
  const count = jest.fn(async () => 0);
  const create = jest.fn(async () => ({}));
  const update = jest.fn(async () => ({}));
  const findFirst = jest.fn(async () => null);
  const history = jest.fn();
  const tx = { $queryRaw: jest.fn(), equipmentModelHistory: { create: history }, equipmentModel: { findMany, count, create, update, findFirst, findUniqueOrThrow: jest.fn(async () => ({})) } };
  const prisma = { ...tx, $transaction: async (fn: (value: unknown) => Promise<unknown>) => fn(tx) };
  const repository = new EquipmentModelRepository(prisma as unknown as PrismaService);

  beforeEach(() => jest.clearAllMocks());

  it('combines tenant, search and status with stable pagination', async () => {
    const query = Object.assign(new ListEquipmentModelsQueryDto(), {
      page: 3,
      pageSize: 5,
      q: ' Pump ',
      status: 'INACTIVE' as const,
      sort: '-createdAt' as const,
    });
    await repository.list('tenant-a', query);
    expect(findMany).toHaveBeenCalledWith({
      include: { _count: { select: { equipments: true } } },
      where: {
        tenantId: 'tenant-a',
        status: 'INACTIVE',
        OR: [
          { manufacturer: { contains: 'Pump', mode: 'insensitive' } },
          { modelCode: { contains: 'Pump', mode: 'insensitive' } },
          { name: { contains: 'Pump', mode: 'insensitive' } },
        ],
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      skip: 10,
      take: 5,
    });
    expect(count).toHaveBeenCalledWith({
      where: expect.objectContaining({ tenantId: 'tenant-a', status: 'INACTIVE' }),
    });
  });

  it('scopes create, lookup and update by tenant', async () => {
    await repository.create('tenant-a', {
      manufacturer: 'Acme', modelCode: 'P-1', name: 'Pump',
    });
    expect(create).toHaveBeenCalledWith({
      include: { _count: { select: { equipments: true } } },
      data: {
        tenantId: 'tenant-a', manufacturer: 'Acme', modelCode: 'P-1',
        name: 'Pump', category: null, description: null,
      },
    });
    await repository.findScoped('tenant-a', 'model-1');
    expect(findFirst).toHaveBeenCalledWith({ where: { tenantId: 'tenant-a', id: 'model-1' } });
    await repository.findScopedWithCount('tenant-a', 'model-1');
    expect(findFirst).toHaveBeenCalledWith({ where: { tenantId: 'tenant-a', id: 'model-1' }, include: { _count: { select: { equipments: true } } } });
    await repository.update('tenant-a', 'model-1', { status: 'INACTIVE' });
    expect(update).toHaveBeenCalledWith({
      where: { id: 'model-1', tenantId: 'tenant-a' },
      include: { _count: { select: { equipments: true } } },
      data: { status: 'INACTIVE' },
    });
  });
});

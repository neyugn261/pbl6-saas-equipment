import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { AccessTokenVerifier, jwtOptionsFromConfig } from '@pbl6/auth';
import { signTestAccessToken } from '@pbl6/testing';
import { PrismaService } from '../src/prisma/prisma.service';
import { InventoryRepository } from '../src/inventory/inventory.repository';
import { seedInventory, INVENTORY_DEMO } from '../src/demo/seed-demo';

describe('Inventory demo seed (dedicated test DB; API reference fixture)', () => {
  const config = new ConfigService();
  const db = new PrismaService(config),
    repo = new InventoryRepository(db);
  const p = new AccessTokenVerifier(jwtOptionsFromConfig(config)).verify(
    signTestAccessToken({
      role: 'INVENTORY_STAFF',
      tenantId: INVENTORY_DEMO.tenantId,
    }),
  );
  const refs = { branch: async (id: string) => ({ id, status: 'ACTIVE' }) };
  beforeAll(() => db.$connect());
  afterAll(() => db.$disconnect());
  it('runs twice without resetting stock, catalogue or threshold and keeps one initial receipt', async () => {
    const first = await seedInventory(repo, refs, p, 'test');
    const before = await db.stock.findUniqueOrThrow({
      where: {
        warehouseId_partId: {
          warehouseId: first.warehouseId,
          partId: first.partId,
        },
      },
    });
    await repo.transact({
      tenantId: p.tenantId!,
      key: randomUUID(),
      actorId: p.userId,
      operation: 'RECEIVE',
      request: {
        warehouseId: first.warehouseId,
        partId: first.partId,
        quantity: '1.00',
        note: 'seed preservation check',
      },
    });
    await db.part.update({
      where: { id: first.partId },
      data: { name: 'Preserved operator name' },
    });
    const second = await seedInventory(repo, refs, p, 'test');
    expect(second).toEqual(first);
    const after = await db.stock.findUniqueOrThrow({
      where: { id: before.id },
    });
    expect(after.quantity.toFixed(2)).toBe(
      before.quantity.plus('1.00').toFixed(2),
    );
    expect(after.minQuantity.toFixed(2)).toBe(before.minQuantity.toFixed(2));
    expect(
      (await db.part.findUniqueOrThrow({ where: { id: first.partId } })).name,
    ).toBe('Preserved operator name');
    expect(
      await db.inventoryOperation.count({
        where: { tenantId: p.tenantId!, key: INVENTORY_DEMO.receiptKey },
      }),
    ).toBe(1);
  });
  it('refuses production and an inactive/missing branch before seeding', async () => {
    await expect(seedInventory(repo, refs, p, 'production')).rejects.toThrow();
    await expect(
      seedInventory(repo, { branch: async () => null }, p, 'test'),
    ).rejects.toThrow('Branch');
  });
});

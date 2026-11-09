import { ForbiddenException } from '@nestjs/common';
import type { Principal } from '@pbl6/auth';
import { InventoryRepository } from '../inventory/inventory.repository';
import type { ReferencesClient } from '../inventory/references.client';
const catalog = require('../../../../scripts/demo/catalog.cjs');
export const INVENTORY_DEMO = {
  tenantId: catalog.tenant.id as string,
  branchId: catalog.branches[0].id as string,
  partId: catalog.parts[0].id as string,
  warehouseId: catalog.warehouses[0].id as string,
  receiptKey: catalog.id(5201) as string,
};
/** Own DB only; initial receipts have stable idempotency keys and never reset balances. */
export async function seedInventory(
  repo: InventoryRepository,
  refs: Pick<ReferencesClient, 'branch'>,
  p: Principal,
  nodeEnv: string,
  branchId = INVENTORY_DEMO.branchId,
) {
  if (
    !['development', 'test'].includes(nodeEnv) ||
    p.userType !== 'TENANT_STAFF' ||
    p.tenantId !== INVENTORY_DEMO.tenantId ||
    !p.permissions.has('inventory:manage')
  )
    throw new ForbiddenException(
      'Inventory demo seed requires DEMO Inventory staff outside production',
    );
  const wi = catalog.warehouses.findIndex(
    (w: { branchId: string }) => w.branchId === branchId,
  );
  if (wi < 0) throw new Error('Unknown demo Branch');
  const fixture = catalog.warehouses[wi];
  const branch = await refs.branch(branchId, p);
  if (!branch || branch.id !== branchId || branch.status !== 'ACTIVE')
    throw new Error('Run Organization demo seed first; Branch must be ACTIVE');
  const warehouse = await repo.db.warehouse.upsert({
    where: { tenantId_code: { tenantId: p.tenantId, code: fixture.code } },
    create: {
      id: fixture.id,
      tenantId: p.tenantId,
      branchId,
      code: fixture.code,
      name: fixture.name,
    },
    update: {},
  });
  if (warehouse.branchId !== branchId)
    throw new Error('Demo warehouse belongs to another Branch');
  const partIds: string[] = [];
  for (const [i, fixturePart] of catalog.parts.entries()) {
    const part = await repo.db.part.upsert({
      where: { tenantId_sku: { tenantId: p.tenantId, sku: fixturePart.sku } },
      create: {
        id: fixturePart.id,
        tenantId: p.tenantId,
        sku: fixturePart.sku,
        name: fixturePart.name,
        unit: fixturePart.unit,
      },
      update: {},
    });
    partIds.push(part.id);
    await repo.db.stock.upsert({
      where: {
        warehouseId_partId: { warehouseId: warehouse.id, partId: part.id },
      },
      create: {
        tenantId: p.tenantId,
        warehouseId: warehouse.id,
        partId: part.id,
        minQuantity: fixturePart.minimum,
      },
      update: {},
    });
    if (Number(fixture.receipts[i]) > 0)
      await repo.transact({
        tenantId: p.tenantId,
        key: catalog.id(5201 + wi * 3 + i),
        actorId: p.userId,
        operation: 'RECEIVE',
        request: {
          warehouseId: warehouse.id,
          partId: part.id,
          quantity: fixture.receipts[i],
          note: 'Nhập tồn đầu kỳ demo',
        },
      });
  }
  return {
    partId: partIds[0],
    warehouseId: warehouse.id,
    receiptKey: catalog.id(5201 + wi * 3),
    partIds,
    existingValuesPreserved: true,
  };
}

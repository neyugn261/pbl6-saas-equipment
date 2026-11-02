import { ForbiddenException } from '@nestjs/common';
import type { Principal } from '@pbl6/auth';
import { InventoryRepository } from '../inventory/inventory.repository';
import type { ReferencesClient } from '../inventory/references.client';

const id = (suffix: string) =>
  `00000000-0000-4000-8000-${suffix.padStart(12, '0')}`;
export const INVENTORY_DEMO = {
  tenantId: id('1'),
  branchId: id('301'),
  partId: id('5001'),
  warehouseId: id('5101'),
  receiptKey: id('5201'),
};

/** Development fixture only; actual actor and Branch come from authorized APIs.
 * Existing catalogue, counts, thresholds and statuses are never reset. */
export async function seedInventory(
  repo: InventoryRepository,
  refs: Pick<ReferencesClient, 'branch'>,
  p: Principal,
  nodeEnv: string,
) {
  if (
    nodeEnv === 'production' ||
    p.userType !== 'TENANT_STAFF' ||
    p.tenantId !== INVENTORY_DEMO.tenantId ||
    !p.permissions.has('inventory:manage')
  )
    throw new ForbiddenException(
      'Inventory demo seed requires the DEMO Inventory staff account outside production',
    );
  const branch = await refs.branch(INVENTORY_DEMO.branchId, p);
  if (
    !branch ||
    branch.id !== INVENTORY_DEMO.branchId ||
    branch.status !== 'ACTIVE'
  )
    throw new Error(
      'Run Organization demo seed first; HCM Branch must be ACTIVE',
    );
  const part = await repo.db.part.upsert({
    where: { tenantId_sku: { tenantId: p.tenantId, sku: 'DEMO-FILTER-01' } },
    create: {
      id: INVENTORY_DEMO.partId,
      tenantId: p.tenantId,
      sku: 'DEMO-FILTER-01',
      name: 'Lọc thiết bị demo',
      unit: 'cái',
    },
    update: {},
  });
  const warehouse = await repo.db.warehouse.upsert({
    where: { tenantId_code: { tenantId: p.tenantId, code: 'DEMO-HCM-STORE' } },
    create: {
      id: INVENTORY_DEMO.warehouseId,
      tenantId: p.tenantId,
      branchId: branch.id,
      code: 'DEMO-HCM-STORE',
      name: 'Kho phụ tùng HCM demo',
    },
    update: {},
  });
  if (warehouse.branchId !== branch.id)
    throw new Error(
      'Existing demo warehouse belongs to another branch; reconcile it instead of overwriting',
    );
  await repo.db.stock.upsert({
    where: {
      warehouseId_partId: { warehouseId: warehouse.id, partId: part.id },
    },
    create: {
      tenantId: p.tenantId,
      warehouseId: warehouse.id,
      partId: part.id,
      minQuantity: '5.00',
    },
    update: {},
  });
  const receipt = await repo.transact({
    tenantId: p.tenantId,
    key: INVENTORY_DEMO.receiptKey,
    actorId: p.userId,
    operation: 'RECEIVE',
    request: {
      warehouseId: warehouse.id,
      partId: part.id,
      quantity: '10.00',
      note: 'Initial Inventory demo stock',
    },
  });
  return {
    partId: part.id,
    warehouseId: warehouse.id,
    receiptKey: receipt.key,
    existingValuesPreserved: true,
  };
}

import { Injectable } from '@nestjs/common';
import { enqueueEvent, Events } from '@pbl6/event-contracts';
import { getCorrelationId, toPage, toSkipTake } from '@pbl6/service-kit';
import { Prisma, type InventoryOperation } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service';
import type {
  InventoryQuery,
  PartInput,
  PartPatch,
  WarehouseInput,
  WarehousePatch,
  AuditQuery,
} from './dto';
import {
  conflict,
  fingerprint,
  invalid,
  json,
  lowStockPolicy,
  notFound,
} from './policy';

type Tx = Prisma.TransactionClient;
export type OperationName =
  | 'RECEIVE'
  | 'ADJUST'
  | 'ISSUE'
  | 'RETURN'
  | 'INSPECT'
  | 'CONFIRM_USE'
  | 'REVERSE_USE';
export interface Movement {
  warehouseId: string;
  partId: string;
  quantity: string;
  note?: string;
  direction?: 'ADJUST_IN' | 'ADJUST_OUT';
  unitCost?: string;
  unitCostCurrency?: string;
  workOrderId?: string;
  workOrderPartId?: string;
  reasonCode?: string;
  documentReference?: string;
  relatedTransactionId?: string;
  condition?: string;
  disposition?: 'RELEASE' | 'SCRAP';
  serviceReportId?: string;
  customerReason?: string;
  removedPartDisposition?: string;
  removedPartNote?: string;
  reversesId?: string;
}
export interface ConfirmationSource {
  workOrderId: string;
  equipmentId: string;
  customerId: string;
  serviceReportId: string;
  workOrderNo: string;
}
export interface OperationContext {
  tenantId: string;
  key: string;
  actorId: string;
  operation: OperationName;
  request: Movement;
}
const maxQuantity = new Prisma.Decimal('9999999999.99');

@Injectable()
export class InventoryRepository {
  constructor(readonly db: PrismaService) {}

  async parts(tenantId: string, q: InventoryQuery) {
    const where: Prisma.PartWhereInput = {
      tenantId,
      status: q.status,
      ...(q.q
        ? {
            OR: [
              { sku: { contains: q.q, mode: 'insensitive' } },
              { name: { contains: q.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [items, total] = await this.db.$transaction(
      [
        this.db.part.findMany({
          where,
          ...toSkipTake(q),
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        }),
        this.db.part.count({ where }),
      ],
      { isolationLevel: 'RepeatableRead' },
    );
    return json(toPage(items, total, q));
  }
  async part(tenantId: string, id: string) {
    const row = await this.db.part.findFirst({ where: { tenantId, id } });
    if (!row) throw notFound();
    return row;
  }
  private audit(
    tx: Tx,
    tenantId: string,
    actorId: string,
    entityType: string,
    entityId: string,
    action: string,
    before: unknown,
    after: unknown,
  ) {
    return tx.inventoryAudit.create({
      data: {
        tenantId,
        actorId,
        entityType,
        entityId,
        action,
        before: before == null ? Prisma.DbNull : json(before),
        after: json(after),
      },
    });
  }
  createPart(tenantId: string, input: PartInput, actorId: string) {
    return this.db.$transaction(async (tx) => {
      const row = await tx.part.create({ data: { tenantId, ...input } });
      await this.audit(
        tx,
        tenantId,
        actorId,
        'PART',
        row.id,
        'CREATE',
        null,
        row,
      );
      return row;
    });
  }
  updatePart(tenantId: string, id: string, input: PartPatch, actorId: string) {
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM parts WHERE tenant_id = ${tenantId}::uuid AND id = ${id}::uuid FOR UPDATE`;
      const before = await tx.part.findFirst({ where: { tenantId, id } });
      if (!before) throw notFound();
      const after = await tx.part.update({ where: { id }, data: input });
      await this.audit(
        tx,
        tenantId,
        actorId,
        'PART',
        id,
        'UPDATE',
        before,
        after,
      );
      return after;
    });
  }
  async warehouses(tenantId: string, q: InventoryQuery) {
    const where = { tenantId, branchId: q.branchId, status: q.status };
    const [items, total] = await this.db.$transaction(
      [
        this.db.warehouse.findMany({
          where,
          ...toSkipTake(q),
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        }),
        this.db.warehouse.count({ where }),
      ],
      { isolationLevel: 'RepeatableRead' },
    );
    return json(toPage(items, total, q));
  }
  async warehouse(tenantId: string, id: string) {
    const row = await this.db.warehouse.findFirst({ where: { tenantId, id } });
    if (!row) throw notFound();
    return row;
  }
  createWarehouse(tenantId: string, input: WarehouseInput, actorId: string) {
    return this.db.$transaction(async (tx) => {
      const row = await tx.warehouse.create({ data: { tenantId, ...input } });
      await this.audit(
        tx,
        tenantId,
        actorId,
        'WAREHOUSE',
        row.id,
        'CREATE',
        null,
        row,
      );
      return row;
    });
  }
  updateWarehouse(
    tenantId: string,
    id: string,
    input: WarehousePatch,
    actorId: string,
  ) {
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM warehouses WHERE tenant_id = ${tenantId}::uuid AND id = ${id}::uuid FOR UPDATE`;
      const before = await tx.warehouse.findFirst({ where: { tenantId, id } });
      if (!before) throw notFound();
      const after = await tx.warehouse.update({ where: { id }, data: input });
      await this.audit(
        tx,
        tenantId,
        actorId,
        'WAREHOUSE',
        id,
        'UPDATE',
        before,
        after,
      );
      return after;
    });
  }
  async stocks(tenantId: string, q: InventoryQuery) {
    const where: Prisma.StockWhereInput = {
      tenantId,
      warehouseId: q.warehouseId,
      partId: q.partId,
      ...(q.lowStock === 'true'
        ? { quantity: { lt: this.db.stock.fields.minQuantity } }
        : {}),
      ...(q.lowStock === 'false'
        ? { quantity: { gte: this.db.stock.fields.minQuantity } }
        : {}),
    };
    const [items, total] = await this.db.$transaction(
      [
        this.db.stock.findMany({
          where,
          include: { part: true, warehouse: true },
          ...toSkipTake(q),
          orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        }),
        this.db.stock.count({ where }),
      ],
      { isolationLevel: 'RepeatableRead' },
    );
    return json(
      toPage(
        items.map((row) => ({
          ...row,
          isLowStock: row.quantity.lt(row.minQuantity),
          quantityMeaning: 'AVAILABLE_FOR_ISSUE',
          quarantineMeaning: 'NOT_AVAILABLE_FOR_ISSUE',
          quantityPhysicalAtWarehouse: row.quantity.plus(
            row.quantityQuarantined,
          ),
          shortageQuantity: Prisma.Decimal.max(
            0,
            row.minQuantity.minus(row.quantity),
          ),
        })),
        total,
        q,
      ),
    );
  }
  async ledger(tenantId: string, q: InventoryQuery) {
    const where = {
      tenantId,
      warehouseId: q.warehouseId,
      partId: q.partId,
      type: q.type,
      relatedTransactionId: q.relatedTransactionId,
      ...(q.workOrderId
        ? { referenceType: 'WORK_ORDER', referenceId: q.workOrderId }
        : {}),
    };
    const [items, total] = await this.db.$transaction(
      [
        this.db.stockTransaction.findMany({
          where,
          ...toSkipTake(q),
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        }),
        this.db.stockTransaction.count({ where }),
      ],
      { isolationLevel: 'RepeatableRead' },
    );
    return json(toPage(items, total, q));
  }
  async usages(tenantId: string, workOrderId: string) {
    const rows = await this.db.workOrderPart.findMany({
      where: { tenantId, workOrderId },
      include: {
        returns: { orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] },
        confirmations: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    return json(
      rows.map((row) => ({
        ...row,
        quantityIssued: row.quantityUsed,
        quantityOutstanding: row.quantityUsed.minus(row.quantityReturned),
        quantityConsumed: row.quantityConfirmedUsed,
        quantityUnreconciled: row.quantityUsed
          .minus(row.quantityReturned)
          .minus(row.quantityConfirmedUsed),
        costMeaning: 'INTERNAL_REFERENCE_COST_NOT_CUSTOMER_PRICE',
        historicalSnapshotComplete:
          row.partSnapshot !== null && row.warehouseSnapshot !== null,
      })),
    );
  }
  async usage(tenantId: string, id: string) {
    const row = await this.db.workOrderPart.findFirst({
      where: { tenantId, id },
    });
    if (!row) throw notFound();
    return row;
  }
  async transaction(tenantId: string, id: string) {
    const row = await this.db.stockTransaction.findFirst({
      where: { tenantId, id },
    });
    if (!row) throw notFound();
    return row;
  }
  async confirmation(tenantId: string, id: string) {
    const row = await this.db.usageConfirmation.findFirst({
      where: { tenantId, id },
    });
    if (!row) throw notFound();
    return row;
  }
  async auditHistory(tenantId: string, q: AuditQuery) {
    const where = { tenantId, entityType: q.entityType, entityId: q.entityId };
    const [items, total] = await this.db.$transaction(
      [
        this.db.inventoryAudit.findMany({
          where,
          ...toSkipTake(q),
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        }),
        this.db.inventoryAudit.count({ where }),
      ],
      { isolationLevel: 'RepeatableRead' },
    );
    return json(toPage(items, total, q));
  }
  async serviceParts(
    tenantId: string,
    equipmentId: string,
    customerId: string,
    q: InventoryQuery,
  ) {
    const where = { tenantId, equipmentId, customerId };
    const { rows, total, reversed } = await this.db.$transaction(
      async (tx) => {
        const rows = await tx.usageConfirmation.findMany({
          where,
          include: { usage: true },
          ...toSkipTake(q),
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        });
        const total = await tx.usageConfirmation.count({ where });
        const reversed = await tx.usageConfirmation.findMany({
          where: { ...where, reversesId: { in: rows.map((row) => row.id) } },
          select: { reversesId: true },
        });
        return { rows, total, reversed };
      },
      { isolationLevel: 'RepeatableRead' },
    );
    const reversedIds = new Set(reversed.map((row) => row.reversesId));
    // Explicit allowlist: never spread a database row into a customer response.
    const items = rows.map((row) => ({
      id: row.id,
      workOrderId: row.workOrderId,
      workOrderNo: row.workOrderNo,
      serviceReportId: row.serviceReportId,
      equipmentId: row.equipmentId,
      kind: row.kind,
      correctsConfirmationId: row.reversesId,
      isReversed: reversedIds.has(row.id),
      effectiveQuantity:
        row.kind === 'CONFIRM' && !reversedIds.has(row.id)
          ? row.quantity
          : new Prisma.Decimal(0),
      quantity: row.quantity,
      part: row.usage.partSnapshot,
      reason:
        row.kind === 'CONFIRM'
          ? row.customerReason
          : 'Thông tin phụ tùng đã được điều chỉnh; xem bản ghi xác nhận liên quan.',
      removedPartDisposition: row.removedPartDisposition,
      removedPartNote: row.kind === 'CONFIRM' ? row.removedPartNote : null,
      recordedAt: row.createdAt,
      costDisclosure: {
        status: 'NOT_PROVIDED_BY_INVENTORY',
        source: 'SERVICE_REQUEST_APPROVED_ESTIMATE',
      },
      warrantyDisclosure: {
        status: 'NOT_DETERMINED_BY_INVENTORY',
        automaticallyRenewsEquipmentWarranty: false,
      },
    }));
    return json({
      ...toPage(items, total, q),
      meaning: 'CONFIRMED_USE_AND_CORRECTIONS_ONLY',
      legacyHistoryMayBeIncomplete: true,
    });
  }
  async recordUse(ctx: OperationContext, source: ConfirmationSource) {
    return this.db.$transaction(
      async (tx) => {
        await this.keyLock(tx, ctx.tenantId, ctx.key);
        const cached = await this.existing(tx, ctx);
        if (cached) return cached;
        const r = ctx.request;
        // Same lock order as returns; a confirmation and return cannot consume the same outstanding quantity.
        const { part } = await this.lockStock(
          tx,
          ctx.tenantId,
          r.warehouseId,
          r.partId,
          true,
        );
        await tx.$queryRaw`SELECT id FROM work_order_parts WHERE tenant_id = ${ctx.tenantId}::uuid AND id = ${r.workOrderPartId}::uuid FOR UPDATE`;
        const usage = await tx.workOrderPart.findFirst({
          where: { tenantId: ctx.tenantId, id: r.workOrderPartId },
        });
        if (!usage || usage.workOrderId !== source.workOrderId)
          throw notFound();
        let quantity = new Prisma.Decimal(r.quantity);
        let original;
        if (ctx.operation === 'REVERSE_USE') {
          original = await tx.usageConfirmation.findFirst({
            where: {
              tenantId: ctx.tenantId,
              id: r.reversesId,
              workOrderPartId: usage.id,
              kind: 'CONFIRM',
            },
          });
          if (!original) throw notFound();
          if (
            await tx.usageConfirmation.findFirst({
              where: { reversesId: original.id },
            })
          )
            throw conflict(
              'CONFIRMATION_ALREADY_REVERSED',
              'Confirmation has already been reversed',
            );
          quantity = original.quantity;
        }
        this.assertQuantity(part, quantity);
        const confirmed = original
          ? usage.quantityConfirmedUsed.minus(quantity)
          : usage.quantityConfirmedUsed.plus(quantity);
        if (
          confirmed.lt(0) ||
          confirmed.plus(usage.quantityReturned).gt(usage.quantityUsed)
        )
          throw conflict(
            'EXCESS_CONFIRMED_USE',
            'Confirmed and returned quantities cannot exceed issued quantity',
          );
        const response = await tx.usageConfirmation.create({
          data: {
            tenantId: ctx.tenantId,
            workOrderPartId: usage.id,
            ...source,
            kind: original ? 'REVERSE' : 'CONFIRM',
            quantity,
            reversesId: original?.id,
            customerReason: original?.customerReason ?? r.customerReason!,
            removedPartDisposition:
              original?.removedPartDisposition ?? r.removedPartDisposition!,
            removedPartNote: original?.removedPartNote ?? r.removedPartNote,
            note: r.note,
            actorId: ctx.actorId,
          },
        });
        await tx.workOrderPart.update({
          where: { id: usage.id },
          data: { quantityConfirmedUsed: confirmed },
        });
        return tx.inventoryOperation.create({
          data: {
            tenantId: ctx.tenantId,
            key: ctx.key,
            actorId: ctx.actorId,
            operation: ctx.operation,
            fingerprint: fingerprint(ctx.operation, r),
            request: json(r),
            state: 'COMMITTED',
            httpStatus: 201,
            response: json(response),
          },
        });
      },
      { timeout: 15000, maxWait: 15000 },
    );
  }
  async operation(tenantId: string, key: string) {
    const row = await this.db.inventoryOperation.findUnique({
      where: { tenantId_key: { tenantId, key } },
    });
    if (!row) throw notFound();
    return row;
  }
  async operations(tenantId: string, q: InventoryQuery) {
    const where: Prisma.InventoryOperationWhereInput = {
      tenantId,
      operation: 'ISSUE',
      ...(q.workOrderId ? { workOrderId: q.workOrderId } : {}),
      ...(q.state ? { state: q.state } : {}),
    };
    if (q.reservationPending === 'true') where.reservationSettledAt = null;
    if (q.reservationPending === 'false')
      where.reservationSettledAt = { not: null };
    const [items, total] = await this.db.$transaction(
      [
        this.db.inventoryOperation.findMany({
          where,
          ...toSkipTake(q),
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        }),
        this.db.inventoryOperation.count({ where }),
      ],
      { isolationLevel: 'RepeatableRead' },
    );
    return json(
      toPage(
        items.map((row) => this.proof(row)),
        total,
        q,
      ),
    );
  }
  proof(row: InventoryOperation) {
    return {
      key: row.key,
      tenantId: row.tenantId,
      operation: row.operation,
      fingerprint: row.fingerprint,
      request: row.request,
      actorId: row.actorId,
      workOrderId: row.workOrderId,
      state: row.state,
      httpStatus: row.httpStatus,
      response: row.response,
      reservationSettledAt: row.reservationSettledAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      recovery: {
        stockOutcome:
          row.state === 'COMMITTED'
            ? 'ISSUED'
            : row.state === 'ABORTED'
              ? 'NOT_ISSUED'
              : 'UNCONFIRMED',
        synchronization: row.reservationSettledAt
          ? 'SETTLED'
          : row.state === 'COMMITTED'
            ? 'PENDING_FINALIZE'
            : row.state === 'ABORTED'
              ? 'PENDING_RELEASE'
              : 'PENDING',
        responsibleActorId: row.actorId,
        pendingSince: row.reservationSettledAt ? null : row.createdAt,
        nextActions:
          row.state === 'PENDING'
            ? ['RETRY_SAME_OPERATION', 'ABORT_BEFORE_COMMIT']
            : row.reservationSettledAt
              ? []
              : ['RETRY_SETTLEMENT'],
        mayCreateReplacementOperation:
          row.state === 'ABORTED' && row.reservationSettledAt !== null,
      },
    };
  }

  async threshold(
    tenantId: string,
    warehouseId: string,
    partId: string,
    minQuantity: string,
    actorId: string,
  ) {
    return this.db.$transaction(
      async (tx) => {
        const { part, stock } = await this.lockStock(
          tx,
          tenantId,
          warehouseId,
          partId,
          false,
        );
        this.assertQuantity(part, new Prisma.Decimal(minQuantity));
        const after = await this.saveStock(
          tx,
          stock,
          part.sku,
          stock.quantity,
          new Prisma.Decimal(minQuantity),
        );
        await this.audit(
          tx,
          tenantId,
          actorId,
          'STOCK',
          stock.id,
          'THRESHOLD',
          stock,
          after,
        );
        return json(after);
      },
      { timeout: 15000 },
    );
  }
  private async keyLock(tx: Tx, tenantId: string, key: string) {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`inventory:${tenantId}:${key}`}, 0))::text`;
  }
  private async existing(tx: Tx, ctx: OperationContext) {
    const row = await tx.inventoryOperation.findUnique({
      where: { tenantId_key: { tenantId: ctx.tenantId, key: ctx.key } },
    });
    if (row && row.fingerprint !== fingerprint(ctx.operation, ctx.request))
      throw conflict(
        'IDEMPOTENCY_KEY_REUSED',
        'Idempotency key belongs to a different operation or payload',
      );
    return row;
  }
  async cached(ctx: OperationContext) {
    const row = await this.db.inventoryOperation.findUnique({
      where: { tenantId_key: { tenantId: ctx.tenantId, key: ctx.key } },
    });
    if (row && row.fingerprint !== fingerprint(ctx.operation, ctx.request))
      throw conflict(
        'IDEMPOTENCY_KEY_REUSED',
        'Idempotency key belongs to a different operation or payload',
      );
    return row;
  }
  async prepareIssue(ctx: OperationContext) {
    return this.db.$transaction(async (tx) => {
      await this.keyLock(tx, ctx.tenantId, ctx.key);
      const row = await this.existing(tx, ctx);
      if (row) return row;
      return tx.inventoryOperation.create({
        data: {
          tenantId: ctx.tenantId,
          key: ctx.key,
          actorId: ctx.actorId,
          operation: 'ISSUE',
          fingerprint: fingerprint('ISSUE', ctx.request),
          request: json(ctx.request),
          workOrderId: ctx.request.workOrderId,
        },
      });
    });
  }
  /** The remote hold stays durable after this local transaction commits or rolls back. */
  issue(
    ctx: OperationContext,
    reserve: (row: InventoryOperation) => Promise<void>,
  ) {
    return this.db.$transaction(
      async (tx) => {
        await this.keyLock(tx, ctx.tenantId, ctx.key);
        const row = await this.existing(tx, ctx);
        if (!row) throw notFound();
        if (row.state !== 'PENDING') return row;
        await reserve(row);
        const response = await this.move(tx, { ...ctx, actorId: row.actorId });
        return tx.inventoryOperation.update({
          where: { id: row.id },
          data: { state: 'COMMITTED', response, httpStatus: 201 },
        });
      },
      { timeout: 15000, maxWait: 15000 },
    );
  }
  /** Re-read under the same key lock: never release a hold for a concurrent committed issue. */
  abortIssue(
    ctx: OperationContext,
    httpStatus: number,
    response: Prisma.InputJsonValue,
  ) {
    return this.db.$transaction(
      async (tx) => {
        await this.keyLock(tx, ctx.tenantId, ctx.key);
        const row = await this.existing(tx, ctx);
        if (!row) throw notFound();
        if (row.state !== 'PENDING') return row;
        return tx.inventoryOperation.update({
          where: { id: row.id },
          data: { state: 'ABORTED', httpStatus, response },
        });
      },
      { maxWait: 15000 },
    );
  }
  async settled(row: InventoryOperation) {
    await this.db.inventoryOperation.updateMany({
      where: {
        id: row.id,
        tenantId: row.tenantId,
        state: row.state,
        reservationSettledAt: null,
      },
      data: { reservationSettledAt: new Date() },
    });
  }
  transact(ctx: OperationContext) {
    return this.db.$transaction(
      async (tx) => {
        await this.keyLock(tx, ctx.tenantId, ctx.key);
        const existing = await this.existing(tx, ctx);
        if (existing) return existing;
        const response = await this.move(tx, ctx);
        return tx.inventoryOperation.create({
          data: {
            tenantId: ctx.tenantId,
            key: ctx.key,
            actorId: ctx.actorId,
            operation: ctx.operation,
            fingerprint: fingerprint(ctx.operation, ctx.request),
            request: json(ctx.request),
            state: 'COMMITTED',
            response,
            httpStatus: ctx.operation === 'RETURN' ? 200 : 201,
          },
        });
      },
      { timeout: 15000, maxWait: 15000 },
    );
  }
  private async lockStock(
    tx: Tx,
    tenantId: string,
    warehouseId: string,
    partId: string,
    allowInactive: boolean,
  ) {
    // All stock writers use Part -> Warehouse -> Stock -> Usage; status changes
    // take the same catalog row locks, so an INACTIVE transition cannot race a write.
    await tx.$queryRaw`SELECT id FROM parts WHERE tenant_id = ${tenantId}::uuid AND id = ${partId}::uuid FOR UPDATE`;
    const part = await tx.part.findFirst({ where: { tenantId, id: partId } });
    if (!part)
      throw invalid('INVALID_PART', 'Part is missing or outside tenant');
    await tx.$queryRaw`SELECT id FROM warehouses WHERE tenant_id = ${tenantId}::uuid AND id = ${warehouseId}::uuid FOR UPDATE`;
    const warehouse = await tx.warehouse.findFirst({
      where: { tenantId, id: warehouseId },
    });
    if (!warehouse)
      throw invalid(
        'INVALID_WAREHOUSE',
        'Warehouse is missing or outside tenant',
      );
    if (
      !allowInactive &&
      (part.status !== 'ACTIVE' || warehouse.status !== 'ACTIVE')
    )
      throw invalid(
        'INACTIVE_INVENTORY',
        'Part and warehouse must be ACTIVE for new stock operations',
      );
    const stock = await tx.stock.upsert({
      where: { warehouseId_partId: { warehouseId, partId } },
      create: { tenantId, warehouseId, partId },
      update: {},
    });
    await tx.$queryRaw`SELECT id FROM stocks WHERE id = ${stock.id}::uuid FOR UPDATE`;
    const locked = await tx.stock.findUniqueOrThrow({
      where: { id: stock.id },
    });
    return { part, warehouse, stock: locked };
  }
  private assertQuantity(
    part: { allowFractional: boolean },
    quantity: Prisma.Decimal,
  ) {
    if (!part.allowFractional && !quantity.isInteger())
      throw invalid(
        'WHOLE_QUANTITY_REQUIRED',
        'This part requires a whole quantity',
      );
  }
  private async saveStock(
    tx: Tx,
    stock: {
      id: string;
      tenantId: string;
      warehouseId: string;
      partId: string;
      quantity: Prisma.Decimal;
      minQuantity: Prisma.Decimal;
      lowStockAlertedAt: Date | null;
    },
    sku: string,
    quantity: Prisma.Decimal,
    minimum = stock.minQuantity,
  ) {
    if (quantity.lt(0))
      throw conflict('INSUFFICIENT_STOCK', 'Insufficient stock');
    if (quantity.gt(maxQuantity))
      throw conflict(
        'STOCK_CAPACITY_EXCEEDED',
        'Stock exceeds NUMERIC(12,2) capacity',
      );
    const policy = lowStockPolicy(
      quantity,
      minimum,
      stock.lowStockAlertedAt !== null,
    );
    if (policy.emit)
      await enqueueEvent(tx, Events.LowStockDetected, {
        tenantId: stock.tenantId,
        aggregateId: stock.id,
        correlationId: getCorrelationId(),
        payload: {
          stockId: stock.id,
          partId: stock.partId,
          partSku: sku,
          warehouseId: stock.warehouseId,
          quantity: quantity.toFixed(2),
          minQuantity: minimum.toFixed(2),
        },
      });
    return tx.stock.update({
      where: { id: stock.id },
      data: {
        quantity,
        minQuantity: minimum,
        lowStockAlertedAt: policy.emit
          ? new Date()
          : policy.clear
            ? null
            : stock.lowStockAlertedAt,
      },
    });
  }
  private async move(
    tx: Tx,
    ctx: OperationContext,
  ): Promise<Prisma.InputJsonValue> {
    const r = ctx.request;
    const { part, warehouse, stock } = await this.lockStock(
      tx,
      ctx.tenantId,
      r.warehouseId,
      r.partId,
      ctx.operation === 'RETURN' ||
        (ctx.operation === 'INSPECT' && r.disposition === 'SCRAP'),
    );
    const quantity = new Prisma.Decimal(r.quantity);
    if (quantity.lte(0))
      throw invalid(
        'QUANTITY_MUST_BE_POSITIVE',
        'Movement quantity must be positive',
      );
    this.assertQuantity(part, quantity);
    const type =
      ctx.operation === 'ADJUST'
        ? r.direction!
        : ctx.operation === 'INSPECT'
          ? r.disposition!
          : ctx.operation;
    if (
      ctx.operation === 'RETURN' &&
      !['GOOD', 'DAMAGED', 'PENDING_INSPECTION'].includes(r.condition ?? '')
    )
      throw invalid(
        'RETURN_CONDITION_REQUIRED',
        'Record the returned component condition',
      );
    if (ctx.operation === 'INSPECT' && !r.relatedTransactionId)
      throw invalid(
        'QUARANTINE_SOURCE_REQUIRED',
        'Inspection must identify the original return',
      );
    if (r.relatedTransactionId) {
      const original = await tx.stockTransaction.findFirst({
        where: {
          tenantId: ctx.tenantId,
          id: r.relatedTransactionId,
          partId: r.partId,
          warehouseId: r.warehouseId,
        },
      });
      if (!original)
        throw invalid(
          'INVALID_RELATED_TRANSACTION',
          'Related transaction must belong to this part and warehouse',
        );
      if (ctx.operation === 'INSPECT') {
        if (
          original.type !== 'RETURN' ||
          !['DAMAGED', 'PENDING_INSPECTION'].includes(
            original.returnCondition ?? '',
          )
        )
          throw invalid(
            'INVALID_QUARANTINE_SOURCE',
            'Inspection must refer to a quarantined return',
          );
      } else if (r.reasonCode === 'CORRECTION') {
        if (
          !['RECEIVE', 'ADJUST_IN', 'ADJUST_OUT'].includes(original.type) ||
          original.reasonCode === 'CORRECTION' ||
          (original.type === 'ADJUST_OUT') === (type === 'ADJUST_OUT')
        )
          throw invalid(
            'INVALID_CORRECTION',
            'Correction requires an opposite-direction receipt or adjustment; correct issue/return through their own workflow',
          );
      }
      const previous = await tx.stockTransaction.aggregate({
        where: { tenantId: ctx.tenantId, relatedTransactionId: original.id },
        _sum: { quantity: true },
      });
      if (
        (previous._sum.quantity ?? new Prisma.Decimal(0))
          .plus(quantity)
          .gt(original.quantity)
      )
        throw conflict(
          'EXCESS_DISPOSITION',
          'Processed quantity exceeds the original transaction',
        );
    }
    let usage;
    if (ctx.operation === 'RETURN') {
      await tx.$queryRaw`SELECT id FROM work_order_parts WHERE tenant_id = ${ctx.tenantId}::uuid AND id = ${r.workOrderPartId}::uuid FOR UPDATE`;
      usage = await tx.workOrderPart.findFirst({
        where: { tenantId: ctx.tenantId, id: r.workOrderPartId },
      });
      if (
        !usage ||
        usage.partId !== r.partId ||
        usage.warehouseId !== r.warehouseId ||
        usage.workOrderId !== r.workOrderId
      )
        throw notFound();
      if (
        usage.quantityReturned
          .plus(usage.quantityConfirmedUsed)
          .plus(quantity)
          .gt(usage.quantityUsed)
      )
        throw conflict(
          'EXCESS_RETURN',
          'Return exceeds the unreturned issued quantity',
        );
    }
    const quarantinedReturn = type === 'RETURN' && r.condition !== 'GOOD';
    const after =
      type === 'ISSUE' || type === 'ADJUST_OUT'
        ? stock.quantity.minus(quantity)
        : quarantinedReturn || type === 'SCRAP'
          ? stock.quantity
          : stock.quantity.plus(quantity);
    const quarantineAfter = quarantinedReturn
      ? stock.quantityQuarantined.plus(quantity)
      : type === 'RELEASE' || type === 'SCRAP'
        ? stock.quantityQuarantined.minus(quantity)
        : stock.quantityQuarantined;
    if (quarantineAfter.lt(0) || quarantineAfter.gt(maxQuantity))
      throw conflict(
        'INVALID_QUARANTINE_BALANCE',
        'Quarantine balance is outside capacity',
      );
    await this.saveStock(tx, stock, part.sku, after);
    await tx.stock.update({
      where: { id: stock.id },
      data: { quantityQuarantined: quarantineAfter },
    });
    const partSnapshot = {
      sku: part.sku,
      name: part.name,
      unit: part.unit,
      allowFractional: part.allowFractional,
    };
    const warehouseSnapshot = {
      code: warehouse.code,
      name: warehouse.name,
      branchId: warehouse.branchId,
    };
    const ledger = await tx.stockTransaction.create({
      data: {
        tenantId: ctx.tenantId,
        warehouseId: r.warehouseId,
        partId: r.partId,
        type,
        quantity,
        referenceType: r.workOrderId ? 'WORK_ORDER' : null,
        referenceId: r.workOrderId ?? null,
        workOrderPartId: usage?.id ?? null,
        note: r.note ?? null,
        createdBy: ctx.actorId,
        balanceBefore: stock.quantity,
        balanceAfter: after,
        quarantineBefore: stock.quantityQuarantined,
        quarantineAfter,
        reasonCode: r.reasonCode,
        documentReference: r.documentReference,
        relatedTransactionId: r.relatedTransactionId,
        returnCondition: type === 'RETURN' ? r.condition : null,
        partSnapshot,
        warehouseSnapshot,
      },
    });
    if (ctx.operation === 'ISSUE') {
      return json(
        await tx.workOrderPart.create({
          data: {
            tenantId: ctx.tenantId,
            workOrderId: r.workOrderId!,
            partId: r.partId,
            warehouseId: r.warehouseId,
            stockTransactionId: ledger.id,
            quantityUsed: quantity,
            unitCost:
              r.unitCost === undefined ? null : new Prisma.Decimal(r.unitCost),
            unitCostCurrency: r.unitCostCurrency,
            recordedBy: ctx.actorId,
            partSnapshot,
            warehouseSnapshot,
          },
        }),
      );
    }
    if (usage)
      return json(
        await tx.workOrderPart.update({
          where: { id: usage.id },
          data: { quantityReturned: usage.quantityReturned.plus(quantity) },
        }),
      );
    return json(ledger);
  }
}

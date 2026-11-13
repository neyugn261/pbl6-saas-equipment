import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { toPage, toSkipTake } from '@pbl6/service-kit';
import { Prisma, type InventoryOperation } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service';
import { conflict, decimal, json, notFound } from '../inventory/policy';
import type { WorkOrderReference } from '../inventory/references.client';
import type {
  CreatePartRequestInput,
  CreateReturnRequestInput,
  RequestDecisionInput,
  RequestQuery,
} from './requests.dto';
import {
  assertPartQuantity,
  assertRequestVersion,
  decisionStatus,
  operationTotals,
  type RequestAction,
} from './requests.policy';
import { lockPartRequest, requestAudit } from './requests.transactions';

const partInclude = {
  lines: {
    orderBy: { id: 'asc' as const },
    include: { fulfillments: { orderBy: { createdAt: 'asc' as const } } },
  },
};
const returnInclude = {
  receipts: { orderBy: { createdAt: 'asc' as const } },
  usage: true,
};
type PartRow = Prisma.PartRequestGetPayload<{ include: typeof partInclude }>;
type ReturnRow = Prisma.PartReturnRequestGetPayload<{
  include: typeof returnInclude;
}>;
export type RequestScope = {
  tenantId: string;
  branchId?: string;
  requestedBy?: string;
};
export type CommandContext = {
  tenantId: string;
  actorId: string;
  key: string;
  fingerprint: string;
};

const operationView = (op: InventoryOperation) => ({
  key: op.key,
  state: op.state,
  actorId: op.actorId,
  request: op.request,
  businessContext: op.businessContext,
  response: op.response,
  httpStatus: op.httpStatus,
  reservationSettledAt: op.reservationSettledAt,
  createdAt: op.createdAt,
});

export function partRequestView(row: PartRow) {
  const lines = row.lines.map((line) => {
    const totals = operationTotals(line.fulfillments);
    return {
      ...line,
      quantityIssued: totals.committed,
      quantityPendingIssue: totals.pending,
      quantityRemainingToIssue: line.quantityRequested.minus(totals.committed),
      quantityAvailableToFulfill:
        row.status === 'OPEN'
          ? line.quantityRequested.minus(totals.committed).minus(totals.pending)
          : new Prisma.Decimal(0),
      quantityClosedWithoutIssue:
        row.status === 'OPEN'
          ? new Prisma.Decimal(0)
          : line.quantityRequested.minus(totals.committed),
      pendingRecovery: totals.blocked,
      fulfillments: line.fulfillments.map(operationView),
    };
  });
  const fully = lines.every((line) =>
    line.quantityIssued.eq(line.quantityRequested),
  );
  return {
    ...row,
    lines,
    fulfillmentStatus: fully
      ? 'FULLY_ISSUED'
      : lines.some((line) => line.quantityIssued.gt(0))
        ? 'PARTIALLY_ISSUED'
        : 'NOT_ISSUED',
    pendingRecovery: lines.some((line) => line.pendingRecovery),
    stockReservedByRequest: false,
  };
}
export function returnRequestView(row: ReturnRow) {
  const received = operationTotals(row.receipts).committed;
  const remaining = row.quantityRequested.minus(received);
  const unreconciled = row.usage.quantityUsed
    .minus(row.usage.quantityReturned)
    .minus(row.usage.quantityConfirmedUsed);
  return {
    ...row,
    receipts: row.receipts.map(operationView),
    quantityReceived: received,
    quantityUnreceived: remaining,
    quantityPendingReceipt:
      row.status === 'OPEN' ? remaining : new Prisma.Decimal(0),
    quantityClosedWithoutReceipt:
      row.status === 'OPEN' ? new Prisma.Decimal(0) : remaining,
    quantityReceivableNow:
      row.status === 'OPEN'
        ? Prisma.Decimal.min(remaining, unreconciled)
        : new Prisma.Decimal(0),
    usageQuantityUnreconciled: unreconciled,
    receiptStatus: received.eq(row.quantityRequested)
      ? 'RECEIVED'
      : received.gt(0)
        ? 'PARTIALLY_RECEIVED'
        : 'NOT_RECEIVED',
    custodyMeaning: 'ORIGINAL_RECIPIENT_REMAINS_RESPONSIBLE',
  };
}

@Injectable()
export class InventoryRequestsRepository {
  constructor(readonly db: PrismaService) {}

  async cachedCommand(ctx: CommandContext) {
    const row = await this.db.inventoryRequestCommand.findUnique({
      where: { tenantId_key: { tenantId: ctx.tenantId, key: ctx.key } },
    });
    if (
      row &&
      (row.fingerprint !== ctx.fingerprint || row.actorId !== ctx.actorId)
    )
      throw conflict(
        'IDEMPOTENCY_KEY_REUSED',
        'This creation key belongs to a different actor or payload',
      );
    return row?.response as Record<string, Prisma.JsonValue> | undefined;
  }
  private async command(
    ctx: CommandContext,
    create: (tx: Prisma.TransactionClient) => Promise<Prisma.InputJsonValue>,
  ) {
    return this.db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`inventory-request:${ctx.tenantId}:${ctx.key}`}, 0))::text`;
        const cached = await tx.inventoryRequestCommand.findUnique({
          where: { tenantId_key: { tenantId: ctx.tenantId, key: ctx.key } },
        });
        if (cached) {
          if (
            cached.fingerprint !== ctx.fingerprint ||
            cached.actorId !== ctx.actorId
          )
            throw conflict(
              'IDEMPOTENCY_KEY_REUSED',
              'This creation key belongs to a different actor or payload',
            );
          return cached.response;
        }
        const response = await create(tx);
        await tx.inventoryRequestCommand.create({ data: { ...ctx, response } });
        return response;
      },
      { timeout: 15000, maxWait: 15000 },
    );
  }
  createPartRequest(
    ctx: CommandContext,
    wo: WorkOrderReference,
    input: CreatePartRequestInput,
  ) {
    return this.command(ctx, async (tx) => {
      const parts = await tx.part.findMany({
        where: {
          tenantId: ctx.tenantId,
          id: { in: input.lines.map((line) => line.partId) },
          status: 'ACTIVE',
        },
      });
      if (parts.length !== input.lines.length)
        throw conflict(
          'INVALID_REQUEST_PARTS',
          'Every requested part must be unique, active and in this tenant',
        );
      const id = randomUUID();
      const row = await tx.partRequest.create({
        data: {
          id,
          tenantId: ctx.tenantId,
          branchId: wo.branchId!,
          workOrderId: wo.id,
          workOrderNo: wo.workOrderNo!,
          equipmentId: wo.equipmentId!,
          customerId: wo.customerId!,
          requestedBy: ctx.actorId,
          requestNo: `PR-${id.replaceAll('-', '').slice(0, 16).toUpperCase()}`,
          reason: input.reason,
          lines: {
            create: input.lines.map((line) => {
              const part = parts.find((item) => item.id === line.partId)!;
              const quantity = decimal(line.quantity, true);
              assertPartQuantity(part, quantity);
              return {
                partId: part.id,
                quantityRequested: quantity,
                partSnapshot: {
                  sku: part.sku,
                  name: part.name,
                  unit: part.unit,
                  allowFractional: part.allowFractional,
                },
              };
            }),
          },
        },
        include: partInclude,
      });
      await requestAudit(
        tx,
        ctx.tenantId,
        ctx.actorId,
        'PART_REQUEST',
        id,
        'CREATE',
        null,
        row,
      );
      return json(partRequestView(row));
    });
  }
  async partRequest(scope: RequestScope, id: string) {
    const row = await this.db.partRequest.findFirst({
      where: { ...scope, id },
      include: partInclude,
    });
    if (!row) throw notFound();
    return row;
  }
  async partRequests(scope: RequestScope, q: RequestQuery) {
    const where = {
      ...scope,
      workOrderId: q.workOrderId?.toLowerCase(),
      status: q.status,
    };
    const [items, total] = await this.db.$transaction(
      [
        this.db.partRequest.findMany({
          where,
          include: partInclude,
          ...toSkipTake(q),
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        }),
        this.db.partRequest.count({ where }),
      ],
      { isolationLevel: 'RepeatableRead' },
    );
    return json(toPage(items.map(partRequestView), total, q));
  }
  async decidePartRequest(
    scope: RequestScope,
    actorId: string,
    id: string,
    action: RequestAction,
    input: RequestDecisionInput,
  ) {
    return this.db.$transaction(async (tx) => {
      const row = await lockPartRequest(tx, scope.tenantId, id);
      if (scope.branchId && row.branchId !== scope.branchId) throw notFound();
      const status = decisionStatus(action);
      if (
        row.version === input.expectedVersion + 1 &&
        row.status === status &&
        row.closedBy === actorId &&
        row.closingReason === input.reason
      )
        return;
      assertRequestVersion(row, input.expectedVersion);
      const totals = row.lines.map((line) =>
        operationTotals(line.fulfillments),
      );
      if (totals.some((total) => total.blocked))
        throw conflict(
          'REQUEST_PENDING_ISSUE',
          'Reconcile pending issues or release aborted reservations before deciding this request',
        );
      if (action !== 'close' && totals.some((total) => total.committed.gt(0)))
        throw conflict(
          'REQUEST_ALREADY_ISSUED',
          'Close the remaining demand; issued parts and custody obligations must be preserved',
        );
      const after = await tx.partRequest.update({
        where: { id },
        data: {
          status,
          version: { increment: 1 },
          closedAt: new Date(),
          closedBy: actorId,
          closingReason: input.reason,
        },
      });
      await requestAudit(
        tx,
        scope.tenantId,
        actorId,
        'PART_REQUEST',
        id,
        action.toUpperCase(),
        row,
        after,
      );
    });
  }
  createReturnRequest(
    ctx: CommandContext,
    usageId: string,
    input: CreateReturnRequestInput,
    branchId?: string,
  ) {
    return this.command(ctx, async (tx) => {
      await tx.$queryRaw`SELECT id FROM work_order_parts WHERE tenant_id = ${ctx.tenantId}::uuid AND id = ${usageId}::uuid FOR UPDATE`;
      const usage = await tx.workOrderPart.findFirst({
        where: {
          tenantId: ctx.tenantId,
          id: usageId,
          ...(branchId ? { warehouse: { branchId } } : {}),
        },
        include: { warehouse: true, part: true },
      });
      if (!usage) throw notFound();
      if (!usage.custodianUserId)
        throw conflict(
          'CUSTODY_NOT_RECORDED',
          'The original recipient was not recorded; Inventory Staff must reconcile this legacy issue through direct RETURN',
        );
      const quantity = decimal(input.quantity, true);
      assertPartQuantity(usage.part, quantity);
      const open = await tx.partReturnRequest.findMany({
        where: {
          tenantId: ctx.tenantId,
          workOrderPartId: usageId,
          status: 'OPEN',
        },
        include: { receipts: true },
      });
      const outstanding = open.reduce(
        (sum, item) =>
          sum.plus(
            item.quantityRequested.minus(
              operationTotals(item.receipts).committed,
            ),
          ),
        new Prisma.Decimal(0),
      );
      const receivable = usage.quantityUsed
        .minus(usage.quantityReturned)
        .minus(usage.quantityConfirmedUsed);
      if (outstanding.plus(quantity).gt(receivable))
        throw conflict(
          'RETURN_REQUEST_QUANTITY_EXCEEDED',
          'Open return proposals and this quantity exceed the issued quantity still eligible for return',
        );
      const id = randomUUID();
      const row = await tx.partReturnRequest.create({
        data: {
          id,
          tenantId: ctx.tenantId,
          branchId: usage.warehouse.branchId,
          workOrderId: usage.workOrderId,
          workOrderPartId: usageId,
          warehouseId: usage.warehouseId,
          custodianUserId: usage.custodianUserId,
          requestedBy: ctx.actorId,
          quantityRequested: quantity,
          reason: input.reason,
          requestNo: `RR-${id.replaceAll('-', '').slice(0, 16).toUpperCase()}`,
        },
        include: returnInclude,
      });
      await requestAudit(
        tx,
        ctx.tenantId,
        ctx.actorId,
        'RETURN_REQUEST',
        id,
        'CREATE',
        null,
        row,
      );
      return json(returnRequestView(row));
    });
  }
  async returnRequest(scope: RequestScope, id: string) {
    const row = await this.db.partReturnRequest.findFirst({
      where: {
        tenantId: scope.tenantId,
        branchId: scope.branchId,
        id,
        ...(scope.requestedBy
          ? {
              OR: [
                { requestedBy: scope.requestedBy },
                { custodianUserId: scope.requestedBy },
              ],
            }
          : {}),
      },
      include: returnInclude,
    });
    if (!row) throw notFound();
    return row;
  }
  async returnRequests(scope: RequestScope, q: RequestQuery) {
    const where = {
      tenantId: scope.tenantId,
      branchId: scope.branchId,
      workOrderId: q.workOrderId?.toLowerCase(),
      status: q.status,
      ...(scope.requestedBy
        ? {
            OR: [
              { requestedBy: scope.requestedBy },
              { custodianUserId: scope.requestedBy },
            ],
          }
        : {}),
    };
    const [items, total] = await this.db.$transaction(
      [
        this.db.partReturnRequest.findMany({
          where,
          include: returnInclude,
          ...toSkipTake(q),
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        }),
        this.db.partReturnRequest.count({ where }),
      ],
      { isolationLevel: 'RepeatableRead' },
    );
    return json(toPage(items.map(returnRequestView), total, q));
  }
  async decideReturnRequest(
    scope: RequestScope,
    actorId: string,
    id: string,
    action: 'cancel' | 'close',
    input: RequestDecisionInput,
  ) {
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM part_return_requests WHERE tenant_id = ${scope.tenantId}::uuid AND id = ${id}::uuid FOR UPDATE`;
      const row = await tx.partReturnRequest.findFirst({
        where: { tenantId: scope.tenantId, branchId: scope.branchId, id },
        include: { receipts: true },
      });
      if (!row) throw notFound();
      const status = decisionStatus(action);
      if (
        row.version === input.expectedVersion + 1 &&
        row.status === status &&
        row.closedBy === actorId &&
        row.closingReason === input.reason
      )
        return;
      assertRequestVersion(row, input.expectedVersion);
      if (action === 'cancel' && operationTotals(row.receipts).committed.gt(0))
        throw conflict(
          'REQUEST_ALREADY_RECEIVED',
          'Close the outstanding proposal; received goods remain recorded',
        );
      const after = await tx.partReturnRequest.update({
        where: { id },
        data: {
          status,
          version: { increment: 1 },
          closedAt: new Date(),
          closedBy: actorId,
          closingReason: input.reason,
        },
      });
      await requestAudit(
        tx,
        scope.tenantId,
        actorId,
        'RETURN_REQUEST',
        id,
        action.toUpperCase(),
        row,
        after,
      );
    });
  }
  async history(
    tenantId: string,
    type: 'PART_REQUEST' | 'RETURN_REQUEST',
    id: string,
    q: RequestQuery,
  ) {
    const where = { tenantId, entityType: type, entityId: id };
    const [items, total] = await this.db.$transaction(
      [
        this.db.inventoryAudit.findMany({
          where,
          ...toSkipTake(q),
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        }),
        this.db.inventoryAudit.count({ where }),
      ],
      { isolationLevel: 'RepeatableRead' },
    );
    return json(toPage(items, total, q));
  }
}

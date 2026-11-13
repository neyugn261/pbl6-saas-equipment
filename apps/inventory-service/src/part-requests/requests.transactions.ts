/** Hooks executed by the existing Inventory transaction owner. No remote IO here. */
import { Prisma } from '../generated/prisma/client.js';
import type { OperationContext } from '../inventory/inventory.repository';
import { conflict, json, notFound } from '../inventory/policy';
import { assertRequestVersion, operationTotals } from './requests.policy';

type Tx = Prisma.TransactionClient;
export async function requestAudit(
  tx: Tx,
  tenantId: string,
  actorId: string,
  entityType: string,
  entityId: string,
  action: string,
  before: unknown,
  after: unknown,
) {
  await tx.inventoryAudit.create({
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
export async function lockPartRequest(tx: Tx, tenantId: string, id: string) {
  await tx.$queryRaw`SELECT id FROM part_requests WHERE tenant_id = ${tenantId}::uuid AND id = ${id}::uuid FOR UPDATE`;
  const row = await tx.partRequest.findFirst({
    where: { tenantId, id },
    include: { lines: { include: { fulfillments: true } } },
  });
  if (!row) throw notFound();
  return row;
}
export async function prepareFulfillment(tx: Tx, ctx: OperationContext) {
  const r = ctx.request;
  const b = ctx.businessContext;
  if (!b?.partRequestId) return;
  const row = await lockPartRequest(tx, ctx.tenantId, b.partRequestId);
  assertRequestVersion(row, b.requestVersion!);
  if (
    row.lines.some((line) =>
      line.fulfillments.some(
        (op) => op.state === 'ABORTED' && !op.reservationSettledAt,
      ),
    )
  )
    throw conflict(
      'REQUEST_PENDING_ISSUE',
      'Release aborted inventory reservations before preparing a replacement issue',
    );
  const line = row.lines.find(
    (item) => item.id === b.partRequestLineId && item.partId === r.partId,
  );
  if (!line || row.workOrderId !== r.workOrderId) throw notFound();
  const { committed, pending } = operationTotals(line.fulfillments);
  if (committed.plus(pending).plus(r.quantity).gt(line.quantityRequested))
    throw conflict(
      'REQUEST_QUANTITY_EXCEEDED',
      'Quantity exceeds the demand remaining after committed and pending issues',
    );
  await tx.partRequest.update({
    where: { id: row.id },
    data: { version: { increment: 1 } },
  });
  await requestAudit(
    tx,
    ctx.tenantId,
    ctx.actorId,
    'PART_REQUEST',
    row.id,
    'ISSUE_PREPARED',
    null,
    {
      operationKey: ctx.key,
      lineId: line.id,
      quantity: r.quantity,
      custodianUserId: b.custodianUserId,
      handoverReference: b.handoverReference,
    },
  );
}
export async function lockFulfillment(tx: Tx, ctx: OperationContext) {
  if (ctx.businessContext?.partRequestId)
    await lockPartRequest(tx, ctx.tenantId, ctx.businessContext.partRequestId);
}
export async function fulfillmentOutcome(
  tx: Tx,
  ctx: OperationContext,
  state: 'COMMITTED' | 'ABORTED',
) {
  if (!ctx.businessContext?.partRequestId) return;
  const row = await lockPartRequest(
    tx,
    ctx.tenantId,
    ctx.businessContext.partRequestId,
  );
  const complete =
    state === 'COMMITTED' &&
    row.lines.every((line) =>
      operationTotals(line.fulfillments).committed.eq(line.quantityRequested),
    );
  await tx.partRequest.update({
    where: { id: row.id },
    data: {
      version: { increment: 1 },
      ...(complete
        ? {
            status: 'CLOSED',
            closedAt: new Date(),
            closedBy: ctx.actorId,
            closingReason: 'FULLY_ISSUED',
          }
        : {}),
    },
  });
  await requestAudit(
    tx,
    ctx.tenantId,
    ctx.executedBy ?? ctx.actorId,
    'PART_REQUEST',
    row.id,
    `ISSUE_${state}`,
    null,
    {
      operationKey: ctx.key,
      lineId: ctx.businessContext.partRequestLineId,
      quantity: ctx.request.quantity,
      fullyIssued: complete,
      originalActorId: ctx.actorId,
    },
  );
}
export async function prepareReturnReceipt(tx: Tx, ctx: OperationContext) {
  const r = ctx.request;
  const b = ctx.businessContext;
  if (!b?.returnRequestId) return;
  await tx.$queryRaw`SELECT id FROM part_return_requests WHERE tenant_id = ${ctx.tenantId}::uuid AND id = ${b.returnRequestId}::uuid FOR UPDATE`;
  const row = await tx.partReturnRequest.findFirst({
    where: { tenantId: ctx.tenantId, id: b.returnRequestId },
    include: { receipts: true },
  });
  if (
    !row ||
    row.workOrderPartId !== r.workOrderPartId ||
    row.warehouseId !== r.warehouseId ||
    row.workOrderId !== r.workOrderId
  )
    throw notFound();
  assertRequestVersion(row, b.requestVersion!);
  if (
    operationTotals(row.receipts)
      .committed.plus(r.quantity)
      .gt(row.quantityRequested)
  )
    throw conflict(
      'REQUEST_QUANTITY_EXCEEDED',
      'Receipt exceeds the requested return quantity still awaiting receipt',
    );
}
export async function returnReceiptOutcome(tx: Tx, ctx: OperationContext) {
  const id = ctx.businessContext?.returnRequestId;
  if (!id) return;
  const row = await tx.partReturnRequest.findFirstOrThrow({
    where: { tenantId: ctx.tenantId, id },
    include: { receipts: true },
  });
  const complete = operationTotals(row.receipts).committed.eq(
    row.quantityRequested,
  );
  await tx.partReturnRequest.update({
    where: { id },
    data: {
      version: { increment: 1 },
      ...(complete
        ? {
            status: 'CLOSED',
            closedAt: new Date(),
            closedBy: ctx.actorId,
            closingReason: 'FULLY_RECEIVED',
          }
        : {}),
    },
  });
  await requestAudit(
    tx,
    ctx.tenantId,
    ctx.actorId,
    'RETURN_REQUEST',
    id,
    'RECEIPT',
    null,
    {
      operationKey: ctx.key,
      quantity: ctx.request.quantity,
      condition: ctx.request.condition,
      note: ctx.request.note,
      fullyReceived: complete,
    },
  );
}

import { ForbiddenException } from '@nestjs/common';
import type { Principal } from '@pbl6/auth';
import { Prisma, type InventoryOperation } from '../generated/prisma/client.js';
import { conflict, invalid } from '../inventory/policy';

export const PART_REQUEST_WO_STATES = [
  'ACCEPTED',
  'TRAVELLING',
  'IN_PROGRESS',
  'ON_HOLD',
] as const;
export function requireRequestableWorkOrder(status: string) {
  if (!(PART_REQUEST_WO_STATES as readonly string[]).includes(status))
    throw conflict(
      'WO_NOT_READY_FOR_PART_REQUEST',
      'Parts may be requested only after the technician accepts an active work order',
    );
}
export function requireRequestCreator(p: Principal) {
  if (
    !p.permissions.has('work_order:manage') &&
    !p.permissions.has('work_order:execute')
  )
    throw new ForbiddenException({
      code: 'PART_REQUEST_FORBIDDEN',
      message: 'Service Manager or assigned Technician permission is required',
    });
}
export function wideRequestRead(p: Principal) {
  return (
    p.permissions.has('work_order:manage') ||
    p.permissions.has('inventory:issue') ||
    p.roles.includes('TENANT_ADMIN')
  );
}
export function assertRequestVersion(
  row: { status: string; version: number },
  expected: number,
) {
  if (row.version !== expected)
    throw conflict(
      'REQUEST_VERSION_CONFLICT',
      'Reload the request and review its latest quantities before continuing',
    );
  if (row.status !== 'OPEN')
    throw conflict('REQUEST_NOT_OPEN', 'This request is already closed');
}
export function assertPartQuantity(
  part: { allowFractional: boolean },
  quantity: Prisma.Decimal,
) {
  if (!part.allowFractional && !quantity.isInteger())
    throw invalid(
      'WHOLE_QUANTITY_REQUIRED',
      'This part requires a whole quantity',
    );
}
export function operationTotals(operations: InventoryOperation[]) {
  let committed = new Prisma.Decimal(0),
    pending = new Prisma.Decimal(0);
  let blocked = false;
  for (const op of operations) {
    const quantity = new Prisma.Decimal(
      (op.request as { quantity: string }).quantity,
    );
    if (op.state === 'COMMITTED') committed = committed.plus(quantity);
    if (op.state === 'PENDING') pending = pending.plus(quantity);
    if (
      op.state === 'PENDING' ||
      (op.state === 'ABORTED' && !op.reservationSettledAt)
    )
      blocked = true;
  }
  return { committed, pending, blocked };
}
export type RequestAction = 'reject' | 'cancel' | 'close';
export const decisionStatus = (action: RequestAction) =>
  ({ reject: 'REJECTED', cancel: 'CANCELLED', close: 'CLOSED' })[action];

export function requireDecisionActor(
  p: Principal,
  action: RequestAction,
  requestedBy: string,
) {
  const manager = p.permissions.has('work_order:manage');
  const allowed =
    action === 'cancel'
      ? manager ||
        (p.permissions.has('work_order:execute') &&
          p.userId.toLowerCase() === requestedBy)
      : manager || p.permissions.has('inventory:issue');
  if (!allowed)
    throw new ForbiddenException({
      code: 'REQUEST_DECISION_FORBIDDEN',
      message: 'You may not make this request decision',
    });
}

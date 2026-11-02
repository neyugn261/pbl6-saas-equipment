import { createHash } from 'node:crypto';
import { isUUID } from 'class-validator';
import { conflict } from '../common/errors';

export const reservationConflict = () =>
  conflict(
    'INVENTORY_RESERVATION_CONFLICT',
    'Inventory reservation or proof conflicts with the requested operation',
  );
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (record(value))
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(',')}}`;
  return JSON.stringify(value);
}
const uuid = (value: unknown): value is string =>
  typeof value === 'string' && isUUID(value);
const same = (value: unknown, id: string) =>
  typeof value === 'string' && value.toLowerCase() === id;
export interface VerifiedInventoryProof {
  state: 'PENDING' | 'COMMITTED' | 'ABORTED';
  actorId: string;
  request: Record<string, string>;
  usageId: string | null;
  transactionId: string | null;
}

/** Validate the source's immutable ISSUE identity, not a caller-supplied outcome.
 * Canonical hash matches Inventory policy.ts; cross-service integration verifies it. */
export function verifyInventoryProof(
  raw: unknown,
  tenantId: string,
  workOrderId: string,
  key: string,
  fingerprint: string,
): VerifiedInventoryProof {
  if (
    !record(raw) ||
    raw.operation !== 'ISSUE' ||
    !same(raw.tenantId, tenantId) ||
    !same(raw.workOrderId, workOrderId) ||
    !same(raw.key, key) ||
    raw.fingerprint !== fingerprint ||
    !uuid(raw.actorId) ||
    !record(raw.request)
  )
    throw reservationConflict();
  const request = raw.request;
  const allowed = new Set([
    'warehouseId',
    'partId',
    'quantity',
    'workOrderId',
    'note',
    'documentReference',
    'unitCost',
    'unitCostCurrency',
  ]);
  if (
    Object.entries(request).some(
      ([name, value]) => !allowed.has(name) || typeof value !== 'string',
    ) ||
    !same(request.workOrderId, workOrderId) ||
    !uuid(request.partId) ||
    !uuid(request.warehouseId) ||
    typeof request.quantity !== 'string' ||
    !/^(0|[1-9]\d{0,9})\.\d{2}$/.test(request.quantity) ||
    Number(request.quantity) <= 0 ||
    createHash('sha256')
      .update(canonical({ operation: 'ISSUE', request }))
      .digest('hex') !== fingerprint
  )
    throw reservationConflict();
  const base = {
    actorId: raw.actorId.toLowerCase(),
    request: request as Record<string, string>,
    usageId: null,
    transactionId: null,
  };
  if (
    raw.state === 'PENDING' &&
    raw.response === null &&
    raw.httpStatus === null
  )
    return { ...base, state: 'PENDING' };
  if (
    raw.state === 'ABORTED' &&
    Number.isInteger(raw.httpStatus) &&
    Number(raw.httpStatus) >= 400 &&
    Number(raw.httpStatus) < 500 &&
    record(raw.response) &&
    typeof raw.response.code === 'string'
  )
    return { ...base, state: 'ABORTED' };
  if (
    raw.state === 'COMMITTED' &&
    raw.httpStatus === 201 &&
    record(raw.response)
  ) {
    const usage = raw.response;
    if (
      uuid(usage.id) &&
      uuid(usage.stockTransactionId) &&
      same(usage.tenantId, tenantId) &&
      same(usage.workOrderId, workOrderId) &&
      same(usage.partId, request.partId.toLowerCase()) &&
      same(usage.warehouseId, request.warehouseId.toLowerCase()) &&
      usage.quantityUsed === request.quantity &&
      same(usage.recordedBy, base.actorId)
    )
      return {
        ...base,
        state: 'COMMITTED',
        usageId: usage.id.toLowerCase(),
        transactionId: usage.stockTransactionId.toLowerCase(),
      };
  }
  throw reservationConflict();
}

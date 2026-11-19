import { is } from './checks';

/** Full snapshot, version increases per Service Request, including withdrawal. */
export interface CostEstimatePartsSnapshotV1 {
  serviceRequestId: string;
  estimateId: string;
  estimateRevision: number;
  sourceVersion: number;
  status: 'APPROVED' | 'WITHDRAWN';
  currency: 'VND';
  lines: {
    lineId: string;
    partId: string;
    description: string;
    quantity: string;
    unitPrice: string;
  }[];
}
export function validEstimatePartLines(value: unknown) {
  if (!Array.isArray(value) || value.length > 50) return false;
  const ids = new Set<string>();
  return value.every((line) => {
    if (!line || typeof line !== 'object') return false;
    const allowed = [
      'lineId',
      'partId',
      'description',
      'quantity',
      'unitPrice',
    ];
    if (
      Object.keys(line).some((k) => !allowed.includes(k)) ||
      !is.uuid(line.lineId) ||
      !is.uuid(line.partId) ||
      !is.string(255)(line.description) ||
      typeof line.quantity !== 'string' ||
      !/^(0|[1-9]\d{0,9})(\.\d{1,2})?$/.test(line.quantity) ||
      Number(line.quantity) <= 0 ||
      typeof line.unitPrice !== 'string' ||
      !/^(0|[1-9]\d{0,11})(\.\d{1,2})?$/.test(line.unitPrice) ||
      ids.has(line.lineId.toLowerCase())
    )
      return false;
    ids.add(line.lineId.toLowerCase());
    return true;
  });
}

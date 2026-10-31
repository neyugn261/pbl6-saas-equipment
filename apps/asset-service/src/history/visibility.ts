import type { Prisma } from '../generated/prisma/client.js';

/** Setup drafts and receipts are internal, including their history references. */
export function historyVisibility(
  customer: boolean,
): Prisma.EquipmentHistoryWhereInput {
  return customer
    ? {
        OR: [
          { referenceType: null },
          { referenceType: { not: 'EQUIPMENT_REGISTRATION' } },
        ],
      }
    : {};
}

import type { Equipment, Prisma } from '../generated/prisma/client.js';
export const json = (value: unknown): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(value));
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonical(item)]),
    );
  return value;
}
export function equipmentSnapshot(row: Equipment) {
  return {
    equipmentId: row.id,
    modelId: row.modelId,
    displayName: row.displayName ?? null,
    assetCode: row.assetCode,
    serialNumber: row.serialNumber,
    customerId: row.customerId,
    customerSiteId: row.customerSiteId,
    locationId: row.locationId,
  };
}
export function auditContext(
  row: Equipment,
  actorId?: string | null,
  roles: readonly string[] = [],
) {
  return {
    context: json({ ...equipmentSnapshot(row), snapshotMoment: 'LOCAL_WRITE' }),
    createdBy: actorId ?? null,
    actorType: actorId ? 'USER' : 'SYSTEM',
    actorRoles: [...roles],
  };
}
export function changedFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
) {
  const changes: Record<string, { before: unknown; after: unknown }> = {};
  for (const key of Object.keys(after)) {
    if (
      JSON.stringify(canonical(before[key] ?? null)) !==
      JSON.stringify(canonical(after[key] ?? null))
    )
      changes[key] = { before: before[key] ?? null, after: after[key] ?? null };
  }
  return json(changes);
}

import type { MaintenancePlan, Prisma } from '../generated/prisma/client.js';

const json = (value: unknown): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(value));
export function changes(before: object, after: object) {
  const old = JSON.parse(JSON.stringify(before)) as Record<string, unknown>;
  const next = JSON.parse(JSON.stringify(after)) as Record<string, unknown>;
  return json(
    Object.fromEntries(
      Object.entries(next)
        .filter(
          ([key, value]) => JSON.stringify(old[key]) !== JSON.stringify(value),
        )
        .map(([key, value]) => [
          key,
          { before: old[key] ?? null, after: value },
        ]),
    ),
  );
}
export function recordHistory(
  tx: Prisma.TransactionClient,
  plan: MaintenancePlan,
  eventType: string,
  delta: Prisma.InputJsonValue,
  options: {
    taskId?: string;
    actorId?: string;
    roles?: readonly string[];
    sourceEventId?: string;
    occurredAt?: Date;
  } = {},
) {
  return tx.maintenanceHistory.create({
    data: {
      tenantId: plan.tenantId,
      planId: plan.id,
      taskId: options.taskId,
      eventType,
      actorId: options.actorId,
      actorRoles: [...(options.roles ?? [])],
      sourceEventId: options.sourceEventId,
      changes: delta,
      context: json({
        equipmentId: plan.equipmentId,
        customerId: plan.customerId,
        customerSiteId: plan.customerSiteId,
        planName: plan.name,
        frequencyUnit: plan.frequencyUnit,
        frequencyValue: plan.frequencyValue,
        anchorDate: plan.anchorDate.toISOString().slice(0, 10),
      }),
      occurredAt: options.occurredAt,
    },
  });
}

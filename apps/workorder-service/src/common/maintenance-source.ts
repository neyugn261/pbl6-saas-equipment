import type { WorkOrderTx } from '../work-orders/work-orders.repository';

/** Shared by initial creation, explicit replacement and Maintenance WO workflows. */
export async function lockMaintenanceTask(tx: WorkOrderTx, taskId: string) {
  // The partial unique index is global, so the lock must not be tenant-specific.
  const key = 'maintenance-task:' + taskId.toLowerCase();
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text`;
}

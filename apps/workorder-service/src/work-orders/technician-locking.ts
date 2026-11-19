import type { Prisma } from '../generated/prisma/client.js';

export async function lockTechnicians(
  tx: Prisma.TransactionClient,
  tenantId: string,
  ids: string[],
) {
  for (const id of [
    ...new Set(ids.map((value) => value.toLowerCase())),
  ].sort()) {
    await tx.$queryRaw`SELECT id FROM technicians WHERE tenant_id = ${tenantId}::uuid AND id = ${id}::uuid FOR UPDATE`;
  }
}

export async function recomputeTechnician(
  tx: Prisma.TransactionClient,
  tenantId: string,
  id: string,
) {
  const technician = await tx.technician.findFirst({
    where: { tenantId, id },
  });
  if (!technician || ['OFF_DUTY', 'INACTIVE'].includes(technician.status))
    return;
  const accepted = await tx.workOrderAssignment.count({
    where: { tenantId, technicianId: id, status: 'ACCEPTED' },
  });
  await tx.technician.update({
    where: { id },
    data: { status: accepted ? 'BUSY' : 'AVAILABLE' },
  });
}

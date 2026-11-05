import { Injectable, NotFoundException } from '@nestjs/common';
import { dataScope, type Principal } from '@pbl6/auth';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, type EquipmentHandover } from '../generated/prisma/client.js';
import { escapeLikePattern } from '../common/search';
import type { HandoverQuery } from './handover.dto';
export type HandoverTx = Prisma.TransactionClient;
export const handoverMissing = () => new NotFoundException({ code: 'HANDOVER_NOT_FOUND', message: 'Handover not found' });
@Injectable()
export class HandoverRepository {
  constructor(readonly db: PrismaService) {}
  scope(p: Principal): Prisma.EquipmentHandoverWhereInput {
    const { tenantId, customerId } = dataScope(p);
    return { tenantId, ...(customerId ? { customerId, status: { not: 'DRAFT' } } : {}) };
  }
  async load(p: Principal, id: string, tx: HandoverTx = this.db): Promise<EquipmentHandover> {
    const row = await tx.equipmentHandover.findFirst({ where: { AND: [this.scope(p), { id }] } });
    if (!row) throw handoverMissing();
    return row;
  }
  async lockEquipment(tx: HandoverTx, tenantId: string, equipmentId: string) {
    await tx.$queryRaw`SELECT id FROM equipments WHERE tenant_id=${tenantId}::uuid AND id=${equipmentId}::uuid FOR UPDATE`;
    const eq = await tx.equipment.findFirst({ where: { tenantId, id: equipmentId }, include: { model: true } });
    if (!eq) throw handoverMissing();
    return eq;
  }
  async now(tx: HandoverTx): Promise<Date> {
    const [row] = await tx.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS now`;
    return row.now;
  }
  async list(p: Principal, q: HandoverQuery) {
    const where: Prisma.EquipmentHandoverWhereInput = { AND: [this.scope(p), {
      ...(q.status ? { status: q.status } : {}), ...(q.equipmentId ? { equipmentId: q.equipmentId } : {}),
      ...(q.q ? { OR: [{ handoverNo: { contains: escapeLikePattern(q.q), mode: 'insensitive' } },
        { equipment: { assetCode: { contains: escapeLikePattern(q.q), mode: 'insensitive' } } }] } : {}),
    }] };
    const [rows, total] = await this.db.$transaction([
      this.db.equipmentHandover.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
      this.db.equipmentHandover.count({ where }),
    ]);
    return { rows, total };
  }
}

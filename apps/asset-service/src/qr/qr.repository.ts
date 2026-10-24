import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { scopeWhere, type DataScope } from '@pbl6/auth';
import { PrismaService } from '../prisma/prisma.service';

const missingEquipment = () => new NotFoundException({ code: 'EQUIPMENT_NOT_FOUND', message: 'Equipment not found' });
const missingQr = () => new NotFoundException({ code: 'QR_NOT_FOUND', message: 'QR code not found' });

@Injectable()
export class QrRepository {
  constructor(private readonly prisma: PrismaService) {}

  async issue(scope: DataScope, equipmentId: string, actorId: string, token: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM equipments WHERE tenant_id = ${scope.tenantId}::uuid AND id = ${equipmentId}::uuid FOR UPDATE`;
      const equipment = await tx.equipment.findFirst({ where: { ...scopeWhere(scope), id: equipmentId } });
      if (!equipment) throw missingEquipment();
      if (equipment.status === 'RETIRED') {
        throw new ConflictException({ code: 'EQUIPMENT_RETIRED', message: 'Retired equipment cannot receive a new QR code' });
      }
      const previous = await tx.equipmentQrCode.findFirst({ where: {
        tenantId: scope.tenantId, equipmentId, revokedAt: null,
      } });
      if (previous) {
        await tx.equipmentQrCode.update({ where: { id: previous.id }, data: { revokedAt: new Date() } });
      }
      const qr = await tx.equipmentQrCode.create({ data: { tenantId: scope.tenantId, equipmentId, token } });
      await tx.equipmentHistory.create({ data: {
        tenantId: scope.tenantId, equipmentId, createdBy: actorId,
        eventType: previous ? 'QR_REPRINTED' : 'QR_CREATED', referenceType: 'QR_CODE', referenceId: qr.id,
      } });
      return qr;
    });
  }

  async revoke(scope: DataScope, equipmentId: string, actorId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM equipments WHERE tenant_id = ${scope.tenantId}::uuid AND id = ${equipmentId}::uuid FOR UPDATE`;
      const equipment = await tx.equipment.findFirst({ where: { ...scopeWhere(scope), id: equipmentId } });
      if (!equipment) throw missingEquipment();
      const active = await tx.equipmentQrCode.findFirst({ where: {
        tenantId: scope.tenantId, equipmentId, revokedAt: null,
      } });
      if (!active) return;
      await tx.equipmentQrCode.update({ where: { id: active.id }, data: { revokedAt: new Date() } });
      await tx.equipmentHistory.create({ data: {
        tenantId: scope.tenantId, equipmentId, createdBy: actorId,
        eventType: 'QR_REVOKED', referenceType: 'QR_CODE', referenceId: active.id,
      } });
    });
  }

  async resolve(scope: DataScope, token: string) {
    const qr = await this.prisma.equipmentQrCode.findFirst({ where: {
      tenantId: scope.tenantId, token, revokedAt: null,
    } });
    if (!qr) throw missingQr();
    const equipment = await this.prisma.equipment.findFirst({ where: {
      ...scopeWhere(scope), id: qr.equipmentId,
    } });
    if (!equipment) throw missingQr();
    return equipment;
  }
}

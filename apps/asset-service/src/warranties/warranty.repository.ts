import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { DataScope } from '@pbl6/auth';
import { scopeWhere } from '@pbl6/auth';
import type { Warranty } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service';
import { dbDate } from '../equipment/equipment.repository';
import type { CreateWarrantyDto } from './warranty.dto';
import { auditContext, changedFields } from '../history/audit';

const equipmentMissing = () =>
  new NotFoundException({
    code: 'EQUIPMENT_NOT_FOUND',
    message: 'Equipment not found',
  });
const warrantyMissing = () =>
  new NotFoundException({
    code: 'WARRANTY_NOT_FOUND',
    message: 'Warranty not found',
  });

@Injectable()
export class WarrantyRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(scope: DataScope, equipmentId: string): Promise<Warranty[]> {
    const equipment = await this.prisma.equipment.findFirst({
      where: { ...scopeWhere(scope), id: equipmentId },
    });
    if (!equipment) throw equipmentMissing();
    return this.prisma.warranty.findMany({
      where: { tenantId: scope.tenantId, equipmentId },
      orderBy: [{ startDate: 'desc' }, { id: 'asc' }],
    });
  }

  async add(
    scope: DataScope,
    equipmentId: string,
    actorId: string,
    input: CreateWarrantyDto,
    roles: readonly string[] = [],
  ): Promise<Warranty> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM equipments WHERE tenant_id = ${scope.tenantId}::uuid AND id = ${equipmentId}::uuid FOR UPDATE`;
      const equipment = await tx.equipment.findFirst({
        where: { ...scopeWhere(scope), id: equipmentId },
      });
      if (!equipment) throw equipmentMissing();
      if (equipment.status === 'RETIRED') {
        throw new ConflictException({
          code: 'EQUIPMENT_RETIRED',
          message: 'Retired equipment cannot receive a new warranty',
        });
      }
      const overlap = await tx.warranty.findFirst({
        where: {
          tenantId: scope.tenantId,
          equipmentId,
          status: 'ACTIVE',
          startDate: { lte: dbDate(input.endDate) },
          endDate: { gte: dbDate(input.startDate) },
        },
      });
      if (overlap)
        throw new ConflictException({
          code: 'WARRANTY_OVERLAP',
          message: 'Warranty period overlaps an active warranty',
        });
      const warranty = await tx.warranty.create({
        data: {
          tenantId: scope.tenantId,
          equipmentId,
          startDate: dbDate(input.startDate),
          endDate: dbDate(input.endDate),
          warrantyType: input.warrantyType,
          terms: input.terms ?? null,
        },
      });
      await tx.equipmentHistory.create({
        data: {
          tenantId: scope.tenantId,
          equipmentId,
          eventType: 'WARRANTY_ADDED',
          referenceType: 'WARRANTY',
          referenceId: warranty.id,
          ...auditContext(equipment, actorId, roles),
          changes: changedFields(
            {},
            {
              startDate: input.startDate,
              endDate: input.endDate,
              warrantyType: input.warrantyType,
              terms: input.terms ?? null,
              status: warranty.status,
            },
          ),
        },
      });
      return warranty;
    });
  }

  async void(
    scope: DataScope,
    warrantyId: string,
    actorId: string,
    reason?: string,
    customerNote?: string,
    roles: readonly string[] = [],
  ): Promise<Warranty> {
    const existing = await this.prisma.warranty.findFirst({
      where: { tenantId: scope.tenantId, id: warrantyId },
    });
    if (!existing) throw warrantyMissing();
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM equipments WHERE tenant_id = ${scope.tenantId}::uuid AND id = ${existing.equipmentId}::uuid FOR UPDATE`;
      const warranty = await tx.warranty.findFirst({
        where: { tenantId: scope.tenantId, id: warrantyId },
      });
      if (!warranty) throw warrantyMissing();
      const equipment = await tx.equipment.findFirst({
        where: { ...scopeWhere(scope), id: warranty.equipmentId },
      });
      if (!equipment) throw warrantyMissing();
      if (warranty.status !== 'ACTIVE') {
        throw new ConflictException({
          code: 'INVALID_STATE_TRANSITION',
          message: 'Warranty is already void',
        });
      }
      const updated = await tx.warranty.update({
        where: { id: warrantyId },
        data: { status: 'VOID' },
      });
      await tx.equipmentHistory.create({
        data: {
          tenantId: scope.tenantId,
          equipmentId: warranty.equipmentId,
          eventType: 'WARRANTY_VOIDED',
          referenceType: 'WARRANTY',
          referenceId: warrantyId,
          ...auditContext(equipment, actorId, roles),
          changes: changedFields(
            { status: warranty.status },
            { status: updated.status },
          ),
          reasonInternal: reason ?? null,
          customerNote: customerNote ?? null,
        },
      });
      return updated;
    });
  }
}

import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import type { DataScope } from '@pbl6/auth';
import { scopeWhere } from '@pbl6/auth';
import { Prisma, type Equipment, type EquipmentHistory, type Warranty } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateEquipmentDto, ListEquipmentQueryDto, PatchEquipmentDto } from './dto/equipment.dto';

const missing = () => new NotFoundException({ code: 'EQUIPMENT_NOT_FOUND', message: 'Equipment not found' });

/** PostgreSQL DATE is transported as UTC midnight; no locale conversion on output. */
export const dbDate = (value: string): Date => new Date(`${value}T00:00:00.000Z`);
export const dateString = (value: Date | null): string | null => value?.toISOString().slice(0, 10) ?? null;

export function todayInVietnam(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

export type EquipmentDetailRow = Equipment & {
  model: { id: string; tenantId: string; manufacturer: string; modelCode: string; name: string; category: string | null; description: string | null; status: string; createdAt: Date; updatedAt: Date };
  qrCodes: { id: string }[];
};

@Injectable()
export class EquipmentRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(scope: DataScope, query: ListEquipmentQueryDto): Promise<{ rows: Equipment[]; total: number }> {
    const date = dbDate(todayInVietnam());
    const covering: Prisma.WarrantyWhereInput = { status: 'ACTIVE', startDate: { lte: date }, endDate: { gte: date } };
    const ended: Prisma.WarrantyWhereInput = { status: 'ACTIVE', endDate: { lt: date } };
    const q = query.q?.trim();
    const where: Prisma.EquipmentWhereInput = {
      ...scopeWhere(scope),
      ...(scope.customerId === null && query.customerId ? { customerId: query.customerId } : {}),
      ...(query.siteId ? { customerSiteId: query.siteId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(q ? { OR: [
        { assetCode: { contains: q, mode: 'insensitive' } },
        { serialNumber: { contains: q, mode: 'insensitive' } },
        { model: { name: { contains: q, mode: 'insensitive' } } },
      ] } : {}),
      ...(query.warranty === 'IN_WARRANTY' ? { warranties: { some: covering } } : {}),
      ...(query.warranty === 'OUT_OF_WARRANTY' ? { AND: [
        { warranties: { none: covering } }, { warranties: { some: ended } },
      ] } : {}),
      ...(query.warranty === 'NO_WARRANTY' ? { AND: [
        { warranties: { none: covering } }, { warranties: { none: ended } },
      ] } : {}),
    };
    const field = query.sort.startsWith('-') ? query.sort.slice(1) : query.sort;
    const direction = query.sort.startsWith('-') ? 'desc' : 'asc';
    const orderBy: Prisma.EquipmentOrderByWithRelationInput[] = [{ [field]: direction }, { id: 'asc' }];
    const [rows, total] = await Promise.all([
      this.prisma.equipment.findMany({ where, orderBy, skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
      this.prisma.equipment.count({ where }),
    ]);
    return { rows, total };
  }

  findScoped(scope: DataScope, id: string): Promise<Equipment | null> {
    return this.prisma.equipment.findFirst({ where: { ...scopeWhere(scope), id } });
  }

  findDetail(scope: DataScope, id: string): Promise<EquipmentDetailRow | null> {
    return this.prisma.equipment.findFirst({
      where: { ...scopeWhere(scope), id },
      include: { model: true, qrCodes: { where: { revokedAt: null }, select: { id: true }, take: 1 } },
    }) as Promise<EquipmentDetailRow | null>;
  }

  async warrantyAt(tenantId: string, equipmentId: string, date: string): Promise<Warranty | null> {
    const asOf = dbDate(date);
    const covering = await this.prisma.warranty.findFirst({
      where: { tenantId, equipmentId, status: 'ACTIVE', startDate: { lte: asOf }, endDate: { gte: asOf } },
      orderBy: [{ endDate: 'desc' }, { id: 'asc' }],
    });
    if (covering) return covering;
    return this.prisma.warranty.findFirst({
      where: { tenantId, equipmentId, status: 'ACTIVE', endDate: { lt: asOf } },
      orderBy: [{ endDate: 'desc' }, { id: 'asc' }],
    });
  }

  async createWithHistory(tenantId: string, actorId: string, input: CreateEquipmentDto): Promise<Equipment> {
    return this.prisma.$transaction(async (tx) => {
      // A model may be deactivated after the API's initial check while
      // Organization is called. Hold a shared row lock until registration commits.
      const models = await tx.$queryRaw<{ status: string }[]>`
        SELECT status FROM equipment_models
        WHERE tenant_id = ${tenantId}::uuid AND id = ${input.modelId}::uuid
        FOR SHARE`;
      if (models.length === 0) {
        throw new UnprocessableEntityException({ code: 'MODEL_NOT_FOUND', message: 'Reference cannot be validated' });
      }
      if (models[0].status !== 'ACTIVE') {
        throw new UnprocessableEntityException({ code: 'MODEL_INACTIVE', message: 'Reference cannot be validated' });
      }
      const equipment = await tx.equipment.create({ data: {
        tenantId, modelId: input.modelId, customerId: input.customerId,
        customerSiteId: input.customerSiteId, locationId: input.locationId ?? null,
        assetCode: input.assetCode, serialNumber: input.serialNumber,
        installationDate: input.installationDate ? dbDate(input.installationDate) : null,
        handoverDate: input.handoverDate ? dbDate(input.handoverDate) : null,
      } });
      await tx.equipmentHistory.create({ data: {
        tenantId, equipmentId: equipment.id, eventType: 'REGISTERED', createdBy: actorId,
      } });
      return equipment;
    });
  }

  async patchWithHistory(
    scope: DataScope, id: string, actorId: string, input: PatchEquipmentDto, validatedSiteId?: string,
  ): Promise<Equipment> {
    return this.prisma.$transaction(async (tx) => {
      // Serialize concurrent patches before reading old values, including RETIRED.
      await tx.$queryRaw`SELECT id FROM equipments WHERE tenant_id = ${scope.tenantId}::uuid AND id = ${id}::uuid FOR UPDATE`;
      const before = await tx.equipment.findFirst({ where: { ...scopeWhere(scope), id } });
      if (!before) throw missing();
      if (before.status === 'RETIRED') {
        throw new ConflictException({ code: 'EQUIPMENT_RETIRED', message: 'Retired equipment cannot be changed' });
      }
      if (validatedSiteId !== undefined && before.customerSiteId !== validatedSiteId) {
        throw new ConflictException({ code: 'EQUIPMENT_SITE_CHANGED', message: 'Equipment site changed; retry the request' });
      }
      const siteId = input.customerSiteId ?? before.customerSiteId;
      const locationId = input.locationId !== undefined ? input.locationId
        : siteId !== before.customerSiteId ? null : before.locationId;
      const installationDate = input.installationDate !== undefined
        ? input.installationDate : dateString(before.installationDate);
      const handoverDate = input.handoverDate !== undefined
        ? input.handoverDate : dateString(before.handoverDate);
      const status = input.status ?? before.status;
      const moved = siteId !== before.customerSiteId || locationId !== before.locationId;
      const statusChanged = status !== before.status;
      const detailsChanged = installationDate !== dateString(before.installationDate)
        || handoverDate !== dateString(before.handoverDate);
      if (!moved && !statusChanged && !detailsChanged) return before;
      const after = await tx.equipment.update({ where: { id, tenantId: scope.tenantId }, data: {
        customerSiteId: siteId, locationId, status,
        installationDate: installationDate === null ? null : dbDate(installationDate),
        handoverDate: handoverDate === null ? null : dbDate(handoverDate),
      } });
      const histories: Prisma.EquipmentHistoryCreateManyInput[] = [];
      if (moved) histories.push({ tenantId: scope.tenantId, equipmentId: id, eventType: 'MOVED', createdBy: actorId,
        metadata: { fromSiteId: before.customerSiteId, toSiteId: siteId, fromLocationId: before.locationId, toLocationId: locationId } });
      if (statusChanged) histories.push({ tenantId: scope.tenantId, equipmentId: id, eventType: 'STATUS_CHANGED', createdBy: actorId,
        metadata: { from: before.status, to: status } });
      if (detailsChanged) histories.push({ tenantId: scope.tenantId, equipmentId: id, eventType: 'DETAILS_UPDATED', createdBy: actorId,
        metadata: { installationDate: { from: dateString(before.installationDate), to: installationDate }, handoverDate: { from: dateString(before.handoverDate), to: handoverDate } } });
      await tx.equipmentHistory.createMany({ data: histories });
      return after;
    });
  }

  async history(scope: DataScope, id: string, page: number, pageSize: number): Promise<{ rows: EquipmentHistory[]; total: number }> {
    // Check equipment scope before querying history; history has no customer column.
    if (!(await this.findScoped(scope, id))) throw missing();
    const where = { tenantId: scope.tenantId, equipmentId: id };
    const [rows, total] = await Promise.all([
      this.prisma.equipmentHistory.findMany({ where, orderBy: [{ occurredAt: 'desc' }, { id: 'asc' }], skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.equipmentHistory.count({ where }),
    ]);
    return { rows, total };
  }
}

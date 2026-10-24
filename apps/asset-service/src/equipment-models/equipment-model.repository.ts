import { Injectable } from '@nestjs/common';
import { type EquipmentModel, Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service';
import { escapeLikePattern } from '../common/search';
import type { CreateEquipmentModelDto } from './dto/create-equipment-model.dto';
import type { ListEquipmentModelsQueryDto } from './dto/list-equipment-models-query.dto';
import type { UpdateEquipmentModelDto } from './dto/update-equipment-model.dto';

@Injectable()
export class EquipmentModelRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    tenantId: string,
    query: ListEquipmentModelsQueryDto,
  ): Promise<{ rows: EquipmentModel[]; total: number }> {
    const q = query.q?.trim();
    const search = q ? escapeLikePattern(q) : undefined;
    const where: Prisma.EquipmentModelWhereInput = {
      tenantId,
      ...(query.status ? { status: query.status } : {}),
      ...(search
        ? {
            OR: [
              { manufacturer: { contains: search, mode: 'insensitive' } },
              { modelCode: { contains: search, mode: 'insensitive' } },
              { name: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const field = query.sort.startsWith('-') ? query.sort.slice(1) : query.sort;
    const direction = query.sort.startsWith('-') ? 'desc' : 'asc';
    const orderBy: Prisma.EquipmentModelOrderByWithRelationInput[] = [
      { [field]: direction },
      { id: 'asc' },
    ];
    const [rows, total] = await Promise.all([
      this.prisma.equipmentModel.findMany({
        where,
        orderBy,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.equipmentModel.count({ where }),
    ]);
    return { rows, total };
  }

  findScoped(tenantId: string, id: string): Promise<EquipmentModel | null> {
    return this.prisma.equipmentModel.findFirst({ where: { tenantId, id } });
  }

  create(tenantId: string, input: CreateEquipmentModelDto): Promise<EquipmentModel> {
    return this.prisma.equipmentModel.create({
      data: {
        tenantId,
        manufacturer: input.manufacturer,
        modelCode: input.modelCode,
        name: input.name,
        category: input.category ?? null,
        description: input.description ?? null,
      },
    });
  }

  update(
    tenantId: string,
    id: string,
    input: UpdateEquipmentModelDto,
  ): Promise<EquipmentModel> {
    return this.prisma.equipmentModel.update({
      where: { id, tenantId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.category !== undefined ? { category: input.category } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
      },
    });
  }
}

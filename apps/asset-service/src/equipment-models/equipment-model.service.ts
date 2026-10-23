import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { dataScope, type Principal } from '@pbl6/auth';
import { toPage, type Page } from '@pbl6/service-kit';
import type { EquipmentModel } from '../generated/prisma/client.js';
import type { CreateEquipmentModelDto } from './dto/create-equipment-model.dto';
import type { ListEquipmentModelsQueryDto } from './dto/list-equipment-models-query.dto';
import type { UpdateEquipmentModelDto } from './dto/update-equipment-model.dto';
import { EquipmentModelRepository } from './equipment-model.repository';

export interface EquipmentModelResponse {
  id: string;
  manufacturer: string;
  modelCode: string;
  name: string;
  category: string | null;
  description: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

function toResponse(row: EquipmentModel): EquipmentModelResponse {
  return {
    id: row.id,
    manufacturer: row.manufacturer,
    modelCode: row.modelCode,
    name: row.name,
    category: row.category,
    description: row.description,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

@Injectable()
export class EquipmentModelService {
  constructor(private readonly repository: EquipmentModelRepository) {}

  async list(
    principal: Principal,
    query: ListEquipmentModelsQueryDto,
  ): Promise<Page<EquipmentModelResponse>> {
    const { tenantId } = dataScope(principal);
    const { rows, total } = await this.repository.list(tenantId, query);
    return toPage(rows.map(toResponse), total, query);
  }

  async create(
    principal: Principal,
    input: CreateEquipmentModelDto,
  ): Promise<EquipmentModelResponse> {
    const { tenantId } = dataScope(principal);
    return toResponse(await this.repository.create(tenantId, input));
  }

  async update(
    principal: Principal,
    id: string,
    input: UpdateEquipmentModelDto,
  ): Promise<EquipmentModelResponse> {
    const { tenantId } = dataScope(principal);
    if (Object.values(input).every((value) => value === undefined)) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'At least one model field is required',
      });
    }
    if (!(await this.repository.findScoped(tenantId, id))) {
      throw new NotFoundException({ code: 'MODEL_NOT_FOUND', message: 'Model not found' });
    }
    return toResponse(await this.repository.update(tenantId, id, input));
  }
}

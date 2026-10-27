import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { dataScope, type Principal } from '@pbl6/auth';
import { toPage } from '@pbl6/service-kit';
import { ASSET_CLIENT, type AssetClient } from '../asset/asset.client';
import { dateText } from '../common/calendar';
import { invalid, sameId } from '../common/errors';
import type {
  MaintenancePlan,
  MaintenanceTask,
} from '../generated/prisma/client.js';
import type {
  CreatePlanDto,
  ListPlansDto,
  ListTasksDto,
  PatchPlanDto,
} from './dto';
import { PlansRepository } from './plans.repository';

export function planResponse(row: MaintenancePlan) {
  return {
    id: row.id,
    equipmentId: row.equipmentId,
    customerId: row.customerId,
    customerSiteId: row.customerSiteId,
    name: row.name,
    description: row.description,
    frequencyUnit: row.frequencyUnit,
    frequencyValue: row.frequencyValue,
    nextDueDate: dateText(row.nextDueDate),
    status: row.status,
    lastCompletedAt: row.lastCompletedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
export function taskResponse(
  row: MaintenanceTask & { maintenancePlan?: { equipmentId: string } },
) {
  return {
    id: row.id,
    equipmentId: row.maintenancePlan?.equipmentId ?? null,
    customerId: row.customerId,
    maintenancePlanId: row.maintenancePlanId,
    scheduledDate: dateText(row.scheduledDate),
    workOrderId: row.workOrderId,
    status: row.status,
    attemptCount: row.attemptCount,
    // Error diagnostics are operational; no database/transport messages in customer responses.
    lastError: row.lastError ? 'Work Order requires attention' : null,
    completedAt: row.completedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
@Injectable()
export class PlansService {
  constructor(
    private readonly repo: PlansRepository,
    @Inject(ASSET_CLIENT) private readonly asset: AssetClient,
  ) {}
  async list(p: Principal, q: ListPlansDto) {
    const { items, total } = await this.repo.list(dataScope(p), q);
    return toPage(items.map(planResponse), total, q);
  }
  async create(p: Principal, input: CreatePlanDto) {
    if (!input.name.trim())
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'Plan name cannot be blank',
      });
    const ref = await this.asset.equipment(input.equipmentId, p);
    if (!ref || !sameId(ref.id, input.equipmentId) || !ref.customerId)
      throw invalid(
        'EQUIPMENT_NOT_FOUND',
        'Equipment reference cannot be validated',
      );
    if (ref.status === 'RETIRED')
      throw invalid(
        'EQUIPMENT_RETIRED',
        'Retired equipment cannot have a new plan',
      );
    if (!Number.isSafeInteger(ref.snapshotVersion) || ref.snapshotVersion < 0)
      throw invalid(
        'EQUIPMENT_SNAPSHOT_INVALID',
        'Equipment snapshot version is missing or invalid',
      );
    try {
      return planResponse(
        await this.repo.create(
          dataScope(p).tenantId,
          input,
          ref,
          undefined,
          p.userId,
          p.roles,
        ),
      );
    } catch (error) {
      if (error instanceof RangeError)
        throw new BadRequestException({
          code: 'INVALID_SCHEDULE',
          message: error.message,
        });
      throw error;
    }
  }
  async detail(p: Principal, id: string) {
    return planResponse(await this.repo.detail(dataScope(p), id));
  }
  async patch(p: Principal, id: string, input: PatchPlanDto) {
    if (
      Object.values(input).every((v) => v === undefined) ||
      (input.name !== undefined && !input.name.trim())
    )
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'Provide at least one valid plan field',
      });
    try {
      return planResponse(
        await this.repo.patch(dataScope(p), id, input, p.userId, p.roles),
      );
    } catch (error) {
      if (error instanceof RangeError)
        throw new BadRequestException({
          code: 'INVALID_SCHEDULE',
          message: error.message,
        });
      throw error;
    }
  }
  async tasks(p: Principal, q: ListTasksDto) {
    const { items, total } = await this.repo.listTasks(dataScope(p), q);
    return toPage(items.map(taskResponse), total, q);
  }
  async task(p: Principal, id: string) {
    return taskResponse(await this.repo.task(dataScope(p), id));
  }
  async replacement(p: Principal, id: string, requestId: string) {
    const row = await this.repo.replacement(
      dataScope(p),
      id,
      requestId,
      p.userId,
      p.roles,
    );
    return {
      requestId: row.requestId,
      taskId: row.taskId,
      previousWorkOrderId: row.previousWorkOrderId,
      replacementWorkOrderId: row.replacementWorkOrderId,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
    };
  }
}

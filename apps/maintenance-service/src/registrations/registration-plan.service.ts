import { createHash } from 'node:crypto';
import {
  BadGatewayException,
  BadRequestException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { dataScope, type Principal } from '@pbl6/auth';
import { ServiceHttpClient } from '@pbl6/service-kit';
import { isUUID, validateSync } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { PrismaService } from '../prisma/prisma.service';
import type { MaintenancePlan } from '../generated/prisma/client.js';
import { ASSET_CLIENT, type AssetClient } from '../asset/asset.client';
import { PlansRepository, lockPlan } from '../plans/plans.repository';
import { CreatePlanDto } from '../plans/dto';
import { changes, recordHistory } from '../common/audit';
import { conflict, invalid, missing, sameId } from '../common/errors';
import { calendarDate, occurrence } from '../common/calendar';

interface Projection {
  registrationId: string;
  equipmentId: string;
  maintenance: Record<string, unknown>;
  inputHash: string;
}
const canonical = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, v]) => [key, canonical(v)]),
    );
  if (typeof value === 'string')
    return isUUID(value) ? value.toLowerCase() : value.trim();
  return value;
};
const sourceInvalid = () =>
  new BadGatewayException({
    code: 'INVALID_REGISTRATION_SOURCE',
    message: 'Invalid submitted equipment setup reference',
  });

@Injectable()
export class RegistrationPlanService {
  constructor(
    private readonly db: PrismaService,
    private readonly repo: PlansRepository,
    private readonly config: ConfigService,
    @Inject(ASSET_CLIENT) private readonly asset: AssetClient,
  ) {}
  private receipt(row: MaintenancePlan, replay: boolean) {
    return {
      registrationId: row.setupRegistrationId,
      equipmentId: row.equipmentId,
      planId: row.id,
      setupInputHash: row.setupInputHash,
      replay,
    };
  }
  async lookup(p: Principal, id: string) {
    const row = await this.db.maintenancePlan.findFirst({
      where: { tenantId: dataScope(p).tenantId, setupRegistrationId: id },
    });
    if (!row) throw missing();
    return this.receipt(row, true);
  }
  async ensure(p: Principal, id: string) {
    const tenantId = dataScope(p).tenantId;
    const http = new ServiceHttpClient({
      name: 'asset-service',
      baseUrl: this.config.getOrThrow<string>('ASSET_SERVICE_URL'),
    });
    const source = await http.get<Projection>(
      `/internal/equipment-registrations/${id}/maintenance-input`,
      { accessToken: p.accessToken },
    );
    if (
      !source ||
      !isUUID(source.registrationId) ||
      !sameId(source.registrationId, id) ||
      !isUUID(source.equipmentId) ||
      !/^[0-9a-f]{64}$/.test(source.inputHash) ||
      !source.maintenance ||
      typeof source.maintenance !== 'object' ||
      Array.isArray(source.maintenance)
    )
      throw sourceInvalid();
    const hash = createHash('sha256')
      .update(
        JSON.stringify(
          canonical({
            schema: 'registration-plan.v1',
            registrationId: id,
            equipmentId: source.equipmentId,
            maintenance: source.maintenance,
          }),
        ),
      )
      .digest('hex');
    if (hash !== source.inputHash) throw sourceInvalid();
    const { mode, ...fields } = source.maintenance;
    let input: CreatePlanDto | undefined;
    if (mode === 'CREATE') {
      input = plainToInstance(CreatePlanDto, {
        ...fields,
        equipmentId: source.equipmentId,
      });
      if (
        validateSync(input, { whitelist: true, forbidNonWhitelisted: true })
          .length ||
        !input.name.trim()
      )
        throw sourceInvalid();
      try {
        occurrence(
          calendarDate(input.nextDueDate),
          input.frequencyUnit,
          input.frequencyValue,
          1,
        );
      } catch {
        throw new BadRequestException({
          code: 'INVALID_SCHEDULE',
          message: 'Schedule exceeds the supported calendar',
        });
      }
    } else if (
      mode !== 'KEEP' ||
      Object.keys(fields).length !== 1 ||
      !isUUID(fields.planId)
    )
      throw sourceInvalid();

    // No outbound HTTP inside the write transaction or while holding setup locks.
    const prior = await this.db.maintenancePlan.findFirst({
      where: { tenantId, setupRegistrationId: id },
    });
    const equipment =
      !prior && mode === 'CREATE'
        ? await this.asset.equipment(source.equipmentId, p)
        : null;
    if (
      !prior &&
      mode === 'CREATE' &&
      (!equipment || !sameId(equipment.id, source.equipmentId))
    )
      throw invalid(
        'EQUIPMENT_NOT_FOUND',
        'Equipment reference cannot be validated',
      );
    if (equipment?.status === 'RETIRED')
      throw invalid(
        'EQUIPMENT_RETIRED',
        'Retired equipment cannot have a new plan',
      );
    if (
      equipment &&
      (!Number.isSafeInteger(equipment.snapshotVersion) ||
        equipment.snapshotVersion < 0)
    )
      throw invalid('EQUIPMENT_SNAPSHOT_INVALID', 'Invalid Equipment snapshot');

    return this.db.$transaction(async (tx) => {
      const key = `registration-plan:${tenantId.toLowerCase()}:${id.toLowerCase()}`;
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text`;
      const existing = await tx.maintenancePlan.findFirst({
        where: { tenantId, setupRegistrationId: id },
      });
      if (existing) {
        if (
          !sameId(existing.equipmentId, source.equipmentId) ||
          existing.setupInputHash !== hash
        )
          throw conflict(
            'REGISTRATION_PLAN_CONFLICT',
            'Setup identity or payload conflicts with the original plan',
          );
        return this.receipt(existing, true);
      }
      const setup = {
        setupRegistrationId: id,
        setupInputHash: hash,
        setupLinkedAt: new Date(),
      };
      if (mode === 'CREATE' && input && equipment) {
        const row = await this.repo.create(
          tenantId,
          input,
          equipment,
          undefined,
          p.userId,
          p.roles,
          tx,
          setup,
        );
        return this.receipt(row, false);
      }
      const planId = fields.planId as string;
      await lockPlan(tx, tenantId, planId);
      const plan = await tx.maintenancePlan.findFirst({
        where: { tenantId, id: planId, equipmentId: source.equipmentId },
      });
      if (!plan) throw missing();
      if (plan.setupRegistrationId)
        throw conflict(
          'REGISTRATION_PLAN_CONFLICT',
          'This plan already belongs to another setup',
        );
      const row = await tx.maintenancePlan.update({
        where: { id: plan.id },
        data: setup,
      });
      await recordHistory(
        tx,
        row,
        'INITIAL_SETUP_LINKED',
        changes({}, { registrationId: id }),
        { actorId: p.userId, roles: p.roles },
      );
      return this.receipt(row, false);
    });
  }
}

import {
  Injectable,
  ConflictException,
  BadGatewayException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { dataScope, type Principal } from '@pbl6/auth';
import { ServiceHttpClient } from '@pbl6/service-kit';
import {
  validMaintenanceProfile,
  validWarrantyPolicy,
  type MaintenanceProfileBody,
} from '@pbl6/event-contracts';
import { createHash } from 'node:crypto';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service';
import { PlansRepository, lockEquipment } from '../plans/plans.repository';
import { calendarDate, dateText, occurrence } from '../common/calendar';
const canonical = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === 'object'
      ? Object.fromEntries(
          Object.entries(value)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, v]) => [k, canonical(v)]),
        )
      : typeof value === 'string'
        ? /^[a-f\d-]{36}$/i.test(value)
          ? value.toLowerCase()
          : value.trim()
        : value;
const hash = (value: unknown) =>
  createHash('sha256')
    .update(JSON.stringify(canonical(value)))
    .digest('hex');
interface Source {
  registrationId: string;
  equipmentId: string;
  tenantId: string;
  inputHash: string;
  snapshot: {
    schema: string;
    modelId: string;
    handoverDate: string;
    hash: string;
    warranty: { body: unknown };
    maintenance: {
      revisionId: string;
      revision: number;
      body: MaintenanceProfileBody;
    };
  };
}
@Injectable()
export class RegistrationGroupService {
  private readonly asset: ServiceHttpClient;
  constructor(
    private readonly db: PrismaService,
    private readonly repo: PlansRepository,
    config: ConfigService,
  ) {
    this.asset = new ServiceHttpClient({
      name: 'asset-service',
      baseUrl: config.getOrThrow<string>('ASSET_SERVICE_URL'),
    });
  }
  async ensure(p: Principal, id: string) {
    const tenantId = dataScope(p).tenantId;
    const source = await this.asset.get<Source>(
      `/internal/equipment-registrations/${id}/model-policy-input`,
      { accessToken: p.accessToken },
    );
    const snap = source.snapshot;
    if (
      source.registrationId !== id ||
      source.tenantId !== tenantId ||
      !snap ||
      snap.schema !== 'model-setup.v1' ||
      snap.hash !== source.inputHash ||
      hash({ equipmentId: source.equipmentId, ...snap, hash: undefined }) !==
        source.inputHash ||
      !validMaintenanceProfile(snap.maintenance.body) ||
      !validWarrantyPolicy(snap.warranty.body) ||
      snap.maintenance.body.mode !== 'APPLY'
    )
      throw new BadGatewayException({
        code: 'INVALID_POLICY_SOURCE',
        message: 'Frozen setup source is invalid',
      });
    const prior = await this.db.maintenanceSetupGroup.findUnique({
      where: { tenantId_registrationId: { tenantId, registrationId: id } },
    });
    if (prior) {
      if (
        prior.inputHash !== source.inputHash ||
        prior.equipmentId !== source.equipmentId
      )
        throw new ConflictException({
          code: 'REGISTRATION_PLAN_CONFLICT',
          message: 'Setup identity changed',
        });
      return prior.receipt;
    }
    const eq = await this.asset.get<{
      id: string;
      customerId: string;
      customerSiteId: string | null;
      status: string;
      snapshotVersion: number;
    }>(`/internal/equipment/${source.equipmentId}`, {
      accessToken: p.accessToken,
    });
    if (eq.id !== source.equipmentId || eq.status === 'RETIRED')
      throw new ConflictException({
        code: 'EQUIPMENT_REFERENCE_INVALID',
        message: 'Equipment cannot receive this setup',
      });
    return this.db.$transaction(async (tx) => {
      const key = `registration-group:${tenantId}:${id}`;
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key},0))::text`;
      const existing = await tx.maintenanceSetupGroup.findUnique({
        where: { tenantId_registrationId: { tenantId, registrationId: id } },
      });
      if (existing) {
        if (
          existing.inputHash !== source.inputHash ||
          existing.equipmentId !== source.equipmentId
        )
          throw new ConflictException({
            code: 'REGISTRATION_PLAN_CONFLICT',
            message: 'Setup identity changed',
          });
        return existing.receipt;
      }
      await lockEquipment(tx, tenantId, eq.id);
      if (
        await tx.maintenancePlan.count({
          where: {
            tenantId,
            equipmentId: eq.id,
            status: { in: ['ACTIVE', 'PAUSED'] },
          },
        })
      )
        throw new ConflictException({
          code: 'EXISTING_MAINTENANCE_PLAN',
          message:
            'Keep or manage existing plans before applying a new programme',
        });
      await tx.maintenanceSetupGroup.create({
        data: {
          tenantId,
          registrationId: id,
          equipmentId: eq.id,
          inputHash: source.inputHash,
          receipt: { plans: [] },
        },
      });
      const plans: { itemId: string; planId: string }[] = [];
      for (const rule of snap.maintenance.body.rules) {
        const anchor = calendarDate(snap.handoverDate),
          first = occurrence(
            anchor,
            rule.frequencyUnit,
            rule.frequencyValue,
            rule.firstOccurrence,
          );
        const plan = await this.repo.create(
          tenantId,
          {
            equipmentId: eq.id,
            name: rule.name,
            description: snap.maintenance.body.terms,
            frequencyUnit: rule.frequencyUnit,
            frequencyValue: rule.frequencyValue,
            nextDueDate: dateText(first),
          },
          eq,
          undefined,
          p.userId,
          p.roles,
          tx,
        );
        await tx.maintenancePlan.update({
          where: { id: plan.id },
          data: {
            anchorDate: anchor,
            policyVersionId: snap.maintenance.revisionId,
            checklist: rule.checklist as unknown as Prisma.InputJsonValue,
            setupGroupId: id,
            setupItemId: rule.id,
          },
        });
        plans.push({ itemId: rule.id, planId: plan.id });
      }
      const receipt = {
        registrationId: id,
        equipmentId: eq.id,
        inputHash: source.inputHash,
        plans,
      };
      await tx.maintenanceSetupGroup.update({
        where: { tenantId_registrationId: { tenantId, registrationId: id } },
        data: { receipt },
      });
      return receipt;
    });
  }
}

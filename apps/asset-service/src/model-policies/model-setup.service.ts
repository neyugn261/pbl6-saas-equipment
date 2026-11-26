import { RegistrationHandoverService } from '../registrations/registration-handover.service';
import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { dataScope, scopeWhere, type Principal } from '@pbl6/auth';
import { ServiceHttpClient, UpstreamError } from '@pbl6/service-kit';
import {
  policyUuid,
  validWarrantyPolicy,
  validMaintenanceProfile,
  warrantyEnd,
  type PolicyRevision,
  type WarrantyPolicyBody,
  type MaintenanceProfileBody,
} from '@pbl6/event-contracts';
import { Prisma, type Equipment } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service';
import { WarrantyRepository } from '../warranties/warranty.repository';
import { todayInVietnam } from '../equipment/equipment.repository';
import { inputHash } from './policy-hash';
import { auditContext } from '../history/audit';
import { type ModelSetupSnapshot } from '@pbl6/event-contracts';
export { type ModelSetupSnapshot } from '@pbl6/event-contracts';
const bad = (code: string, message: string) =>
  new ConflictException({ code, message });
@Injectable()
export class ModelSetupService {
  constructor(
    private readonly db: PrismaService,
    private readonly config: ConfigService,
    private readonly warranties: WarrantyRepository,
    private readonly handovers: RegistrationHandoverService,
  ) {}
  private assertEnabled() {
    if (this.config.get<string>('MODEL_POLICIES_ENABLED') === 'false')
      throw new ServiceUnavailableException({
        code: 'MODEL_POLICIES_DISABLED',
        message:
          'New model policy setup is temporarily disabled; existing pending setup can still resume',
      });
  }
  private client() {
    const baseUrl = this.config.get<string>('MAINTENANCE_SERVICE_URL');
    if (!baseUrl)
      throw new ServiceUnavailableException({
        code: 'MAINTENANCE_UNAVAILABLE',
        message: 'Maintenance is not configured',
      });
    return new ServiceHttpClient({ name: 'maintenance-service', baseUrl });
  }
  private async registration(p: Principal, id: string) {
    const row = await this.db.equipmentRegistration.findFirst({
      where: { id, tenantId: dataScope(p).tenantId },
    });
    if (!row)
      throw new NotFoundException({
        code: 'REGISTRATION_NOT_FOUND',
        message: 'Registration not found',
      });
    return row;
  }
  async preview(
    p: Principal,
    id: string,
    input: {
      expectedVersion: number;
      warrantyRevisionId?: string | null;
      maintenanceRevisionId?: string | null;
      durationMonths?: number;
      reason?: string;
      maintenanceOverrides?: {
        itemId: string;
        frequencyValue: number;
        firstOccurrence: number;
      }[];
    },
  ) {
    this.assertEnabled();
    const row = await this.registration(p, id),
      tenantId = row.tenantId;
    if (row.status !== 'DRAFT' || row.version !== input.expectedVersion)
      throw bad('REGISTRATION_VERSION_CONFLICT', 'Reload the draft');
    const eq = await this.db.equipment.findFirstOrThrow({
      where: { id: row.equipmentId, tenantId },
    });
    const model = await this.db.equipmentModel.findFirst({
      where: { id: eq.modelId, tenantId, status: 'ACTIVE' },
    });
    if (!model || eq.status === 'RETIRED' || !eq.handoverDate)
      throw bad(
        'MODEL_POLICY_REFERENCE_INVALID',
        'An active model and actual handover date are required',
      );
    const { warrantyRevisionId, maintenanceRevisionId } = input;
    if (warrantyRevisionId === null && input.durationMonths !== undefined)
      throw new BadRequestException({
        code: 'WARRANTY_OVERRIDE_WITHOUT_POLICY',
        message: 'Select a warranty policy before adjusting its duration',
      });
    if (maintenanceRevisionId === null && input.maintenanceOverrides?.length)
      throw new BadRequestException({
        code: 'MAINTENANCE_OVERRIDE_WITHOUT_POLICY',
        message: 'Select a maintenance policy before adjusting schedules',
      });
    if (
      (input.durationMonths !== undefined ||
        input.maintenanceOverrides?.length) &&
      !input.reason?.trim()
    )
      throw new BadRequestException({
        code: 'OVERRIDE_REASON_REQUIRED',
        message: 'An override requires a reason',
      });
    const day = eq.handoverDate.toISOString().slice(0, 10);
    if (day > todayInVietnam())
      throw new BadRequestException({
        code: 'INVALID_HANDOVER_DATE',
        message: 'Actual handover cannot be in the future',
      });
    let warranty: ModelSetupSnapshot['warranty'];
    if (warrantyRevisionId === null) {
      warranty = {
        revisionId: null,
        revision: null,
        body: {
          mode: 'NONE',
          name: 'Không áp dụng bảo hành',
          terms: '',
          reason: 'Hồ sơ này không kèm bảo hành.',
          // Reuse the NONE policy body codec. A skipped warranty has no effective dates.
          durationMonths: 1,
          coveredCauses: [],
          exclusions: [],
        },
        startDate: null,
        endDate: null,
      };
    } else {
      const w = await this.db.modelWarrantyRevision.findFirst({
        where: {
          tenantId,
          modelId: eq.modelId,
          ...(warrantyRevisionId ? { id: warrantyRevisionId } : { isDefault: true }),
          status: 'PUBLISHED',
        },
      });
      const sourceBody: unknown = w?.body;
      if (!w || !validWarrantyPolicy(sourceBody))
        throw bad('MODEL_POLICIES_MISSING', 'Select a published warranty policy or skip warranty');
      const body: WarrantyPolicyBody = {
        ...sourceBody,
        ...(input.durationMonths === undefined ? {} : { durationMonths: input.durationMonths }),
      };
      warranty = {
        revisionId: w.id,
        revision: w.revision,
        body,
        startDate: day,
        endDate: warrantyEnd(day, body.durationMonths),
      };
    }
    let maintenance: ModelSetupSnapshot['maintenance'];
    if (maintenanceRevisionId === null) {
      maintenance = {
        revisionId: null,
        revision: null,
        body: {
          mode: 'NONE',
          name: 'Không áp dụng bảo trì',
          terms: '',
          reason: 'Hồ sơ này không kèm lịch bảo trì định kỳ.',
          rules: [],
        },
        sourceHash: null,
        firstDueDates: [],
      };
    } else {
      const m = await this.client().getOrNull<PolicyRevision<MaintenanceProfileBody>>(
        `/equipment-models/${eq.modelId}/maintenance-profiles/${maintenanceRevisionId ?? 'default'}`,
        { accessToken: p.accessToken },
      );
      if (!m || m.status !== 'PUBLISHED' || (!maintenanceRevisionId && !m.isDefault) ||
        !validMaintenanceProfile(m.body))
        throw bad('MODEL_POLICIES_MISSING', 'Select a published maintenance policy or skip maintenance');
      if (
        warranty.body.mode !== 'APPLY' &&
        m.body.rules.some((r) => r.term?.mode === 'WARRANTY_END')
      )
        throw new BadRequestException({
          code: 'MAINTENANCE_WARRANTY_REQUIRED',
          message:
            'Lịch bảo trì chọn hết cùng bảo hành cần có bảo hành áp dụng. Hãy chọn số năm hoặc vĩnh viễn trên Model.',
        });
      const calendar = await this.client()
        .request<{
          body: MaintenanceProfileBody;
          dates: { itemId: string; date: string; endDate?: string | null }[];
        }>(
          'POST',
          `/equipment-models/${eq.modelId}/maintenance-profiles/${m.id}/preview`,
          {
            accessToken: p.accessToken,
            body: {
              handoverDate: day,
              ...(warranty.body.mode === 'APPLY'
                ? { warrantyEndDate: warranty.endDate }
                : {}),
              overrides: input.maintenanceOverrides ?? [],
            },
          },
        )
        .catch((error: unknown) => {
          if (
            error instanceof UpstreamError &&
            error.status === 400 &&
            ['INVALID_SCHEDULE', 'MAINTENANCE_FIRST_DUE_AFTER_END'].includes(
              error.code ?? '',
            ) &&
            error.body &&
            typeof error.body === 'object'
          )
            throw new BadRequestException(error.body);
          throw error;
        });
      maintenance = {
        revisionId: m.id,
        revision: m.revision,
        body: calendar.body,
        sourceHash: inputHash(m.body),
        firstDueDates: calendar.dates,
      };
    }
    const snapshot: ModelSetupSnapshot = {
      schema: 'model-setup.v1',
      modelId: eq.modelId,
      handoverDate: day,
      warranty,
      maintenance,
      overrideReason: input.reason?.trim() ?? '',
      hash: '',
    };
    snapshot.hash = inputHash({
      equipmentId: eq.id,
      ...snapshot,
      hash: undefined,
    });
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM equipments WHERE id=${eq.id}::uuid AND tenant_id=${tenantId}::uuid FOR UPDATE`;
      const currentEq = await tx.equipment.findFirstOrThrow({
        where: { id: eq.id, tenantId },
      });
      if (
        currentEq.modelId !== eq.modelId ||
        currentEq.handoverDate?.toISOString() !== eq.handoverDate?.toISOString()
      )
        throw bad('EQUIPMENT_REFERENCE_CHANGED', 'Reload equipment');
      const updated = await tx.equipmentRegistration.updateMany({
        where: {
          id,
          tenantId,
          status: 'DRAFT',
          version: input.expectedVersion,
        },
        data: {
          policyPreview: snapshot as unknown as Prisma.InputJsonValue,
          version: { increment: 1 },
          updatedBy: p.userId,
        },
      });
      if (!updated.count)
        throw bad('REGISTRATION_VERSION_CONFLICT', 'Reload draft');
      return this.registrationView(
        await tx.equipmentRegistration.findUniqueOrThrow({ where: { id } }),
      );
    });
  }
  private registrationView(row: {
    id: string;
    version: number;
    policyPreview: Prisma.JsonValue | null;
  }) {
    return {
      id: row.id,
      version: row.version,
      policyPreview: row.policyPreview,
    };
  }
  async submit(
    p: Principal,
    id: string,
    version: number,
    preflight: Equipment,
    customerName = '',
  ) {
    this.assertEnabled();
    const initial = await this.registration(p, id),
      snapshot = initial.policyPreview as unknown as ModelSetupSnapshot;
    if (
      !snapshot ||
      snapshot.hash !==
        inputHash({
          equipmentId: initial.equipmentId,
          ...snapshot,
          hash: undefined,
        })
    )
      throw bad('POLICY_PREVIEW_INVALID', 'Refresh policy preview');
    // Network validation finishes before taking local locks. No latest resolution.
    if (snapshot.maintenance.revisionId !== null) {
      const m = await this.client().get<PolicyRevision<MaintenanceProfileBody>>(
        `/equipment-models/${snapshot.modelId}/maintenance-profiles/${snapshot.maintenance.revisionId}`,
        { accessToken: p.accessToken },
      );
      if (
        m.status !== 'PUBLISHED' ||
        inputHash(m.body) !== snapshot.maintenance.sourceHash
      )
        throw bad('POLICY_RETIRED', 'Refresh policy preview');
      for (const status of ['ACTIVE', 'PAUSED']) {
        const page = await this.client().get<{ total: number }>(
          `/maintenance-plans`,
          {
            accessToken: p.accessToken,
            query: { equipmentId: initial.equipmentId, status, pageSize: 1 },
          },
        );
        if (page.total > 0)
          throw bad(
            'EXISTING_MAINTENANCE_PLAN',
            'Keep or manage existing plans before applying a new programme',
          );
      }
    }
    const saved = await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM equipments WHERE id=${initial.equipmentId}::uuid AND tenant_id=${initial.tenantId}::uuid FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM equipment_registrations WHERE id=${id}::uuid AND tenant_id=${initial.tenantId}::uuid FOR UPDATE`;
      const row = await tx.equipmentRegistration.findUniqueOrThrow({
          where: { id },
        }),
        eq = await tx.equipment.findUniqueOrThrow({
          where: { id: row.equipmentId },
        });
      if (
        row.status !== 'DRAFT' ||
        row.version !== version ||
        inputHash(row.policyPreview) !== inputHash(snapshot)
      )
        throw bad('REGISTRATION_VERSION_CONFLICT', 'Reload draft');
      await tx.$queryRaw`SELECT id FROM equipment_models WHERE id=${eq.modelId}::uuid AND tenant_id=${eq.tenantId}::uuid FOR SHARE`;
      const model = await tx.equipmentModel.findFirst({
        where: { id: eq.modelId, tenantId: eq.tenantId, status: 'ACTIVE' },
      });
      const warranty = snapshot.warranty;
      if (warranty.revisionId !== null) {
        await tx.$queryRaw`SELECT id FROM model_warranty_revisions WHERE id=${warranty.revisionId}::uuid AND tenant_id=${eq.tenantId}::uuid FOR SHARE`;
        const policy = await tx.modelWarrantyRevision.findFirst({
          where: {
            id: warranty.revisionId,
            tenantId: eq.tenantId,
            modelId: eq.modelId,
            status: 'PUBLISHED',
          },
        });
        if (!policy)
          throw bad('POLICY_REFERENCE_CHANGED', 'Refresh equipment and policy preview');
      }
      if (
        !model ||
        eq.status === 'RETIRED' ||
        eq.modelId !== snapshot.modelId ||
        eq.handoverDate?.toISOString().slice(0, 10) !== snapshot.handoverDate ||
        eq.customerId !== preflight.customerId ||
        eq.customerSiteId !== preflight.customerSiteId ||
        eq.locationId !== preflight.locationId
      )
        throw bad(
          'POLICY_REFERENCE_CHANGED',
          'Refresh equipment and policy preview',
        );
      if (row.deliveryMethod === 'CUSTOMER_SITE') {
        return this.handovers.submit(tx, row, eq, p, customerName);
      }
      let warrantyId: string | null = null;
      if (warranty.revisionId !== null && warranty.body.mode === 'APPLY')
        warrantyId = (
          await this.warranties.add(
            dataScope(p),
            eq.id,
            p.userId,
            {
              startDate: warranty.startDate,
              endDate: warranty.endDate,
              warrantyType: 'MODEL_POLICY',
              terms: warranty.body.terms,
            },
            p.roles,
            tx,
            {
              versionId: warranty.revisionId,
              snapshot: warranty.body as unknown as Prisma.InputJsonValue,
            },
          )
        ).id;
      else if (
        await tx.warranty.findFirst({
          where: {
            tenantId: eq.tenantId,
            equipmentId: eq.id,
            status: 'ACTIVE',
          },
        })
      )
        throw bad(
          'EXISTING_WARRANTY',
          'Keep or manage the existing warranty first',
        );
      const needsPlan = snapshot.maintenance.body.mode === 'APPLY';
      const updated = await tx.equipmentRegistration.update({
        where: { id },
        data: {
          warrantyId,
          status: needsPlan ? 'PENDING_MAINTENANCE' : 'COMPLETED',
          maintenanceInputHash: snapshot.hash,
          submittedBy: p.userId,
          submittedAt: new Date(),
          version: { increment: 1 },
          ...(!needsPlan
            ? { completedBy: p.userId, completedAt: new Date() }
            : {}),
          updatedBy: p.userId,
        },
      });
      await tx.equipmentHistory.create({
        data: {
          tenantId: eq.tenantId,
          equipmentId: eq.id,
          eventType: 'MODEL_POLICIES_APPLIED',
          referenceType: 'EQUIPMENT_REGISTRATION',
          referenceId: id,
          ...auditContext(eq, p.userId, p.roles),
          changes: { snapshot: row.policyPreview },
          reasonInternal: snapshot.overrideReason || null,
        },
      });
      if (row.deliveryMethod === 'STORE' && !needsPlan) {
        await tx.equipment.update({
          where: { id: eq.id },
          data: { status: 'ACTIVE' },
        });
        await tx.equipmentHistory.create({
          data: {
            tenantId: eq.tenantId,
            equipmentId: eq.id,
            eventType: 'REGISTRATION_STAFF_COMPLETED',
            referenceType: 'EQUIPMENT_REGISTRATION',
            referenceId: id,
            ...auditContext(eq, p.userId, p.roles),
            changes: { deliveryMethod: 'STORE' },
          },
        });
      }
      return updated;
    });
    return saved.status === 'PENDING_MAINTENANCE' ? this.resume(p, id) : saved;
  }
  async disclosure(p: Principal, id: string) {
    const scope = dataScope(p),
      eq = await this.db.equipment.findFirst({
        where: { ...scopeWhere(scope), id },
      });
    if (!eq)
      throw new NotFoundException({
        code: 'EQUIPMENT_NOT_FOUND',
        message: 'Equipment not found',
      });
    const row = await this.db.equipmentRegistration.findFirst({
        where: { tenantId: eq.tenantId, equipmentId: id },
      }),
      warranties = await this.db.warranty.findMany({
        where: { tenantId: eq.tenantId, equipmentId: id },
        orderBy: { startDate: 'desc' },
      });
    const source =
      row?.status !== 'DRAFT'
        ? (row?.policyPreview as unknown as ModelSetupSnapshot)
        : null;
    return {
      legacy: !source,
      state:
        row?.status === 'PENDING_CUSTOMER_CONFIRMATION'
          ? 'AWAITING_CUSTOMER'
          : row?.status === 'PENDING_MAINTENANCE' ||
              row?.maintenanceProvisioning === 'PENDING'
            ? 'SETUP_PENDING'
            : 'APPLIED',
      snapshot: source
        ? {
            warranty: {
              revision: source.warranty.revision,
              body: source.warranty.body,
              startDate: source.warranty.startDate,
              endDate: source.warranty.endDate,
            },
            maintenance: {
              revision: source.maintenance.revision,
              body: source.maintenance.body,
              firstDueDates: source.maintenance.firstDueDates,
            },
          }
        : null,
      warranties: warranties.map((w) => ({
        id: w.id,
        startDate: w.startDate.toISOString().slice(0, 10),
        endDate: w.endDate.toISOString().slice(0, 10),
        terms: w.terms,
      })),
    };
  }
  async projection(p: Principal, id: string) {
    const row = await this.registration(p, id);
    if (
      row.status === 'DRAFT' ||
      row.status === 'PENDING_CUSTOMER_CONFIRMATION' ||
      !row.policyPreview
    )
      throw bad('REGISTRATION_NOT_SUBMITTED', 'Submit the draft first');
    return {
      registrationId: id,
      equipmentId: row.equipmentId,
      tenantId: row.tenantId,
      snapshot: row.policyPreview,
      inputHash: row.maintenanceInputHash,
    };
  }
  async resume(p: Principal, id: string) {
    const row = await this.registration(p, id);
    if (row.status === 'COMPLETED' && row.maintenanceProvisioning !== 'PENDING')
      return row;
    if (
      row.status !== 'PENDING_MAINTENANCE' &&
      row.maintenanceProvisioning !== 'PENDING'
    )
      throw bad('REGISTRATION_NOT_SUBMITTED', 'Submit the draft first');
    const snapshot = row.policyPreview as unknown as ModelSetupSnapshot;
    try {
      const receipt = await this.client().request<{
        registrationId: string;
        equipmentId: string;
        inputHash: string;
        plans: { itemId: string; planId: string }[];
      }>('PUT', `/internal/equipment-registrations/${id}/maintenance-group`, {
        accessToken: p.accessToken,
      });
      const expected = snapshot.maintenance.body.rules.map((r) => r.id).sort(),
        actual = receipt.plans.map((r) => r.itemId).sort();
      if (
        receipt.registrationId !== id ||
        receipt.equipmentId !== row.equipmentId ||
        receipt.inputHash !== row.maintenanceInputHash ||
        JSON.stringify(actual) !== JSON.stringify(expected) ||
        new Set(receipt.plans.map((r) => r.planId)).size !== expected.length ||
        receipt.plans.some((r) => !policyUuid(r.planId))
      )
        throw new Error('Invalid group receipt');
      await this.db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM equipments WHERE id=${row.equipmentId}::uuid AND tenant_id=${row.tenantId}::uuid FOR UPDATE`;
        const changed = await tx.equipmentRegistration.updateMany({
          where: {
            id,
            tenantId: row.tenantId,
            ...(row.deliveryMethod === 'CUSTOMER_SITE'
              ? { status: 'COMPLETED', maintenanceProvisioning: 'PENDING' }
              : { status: 'PENDING_MAINTENANCE' }),
            maintenanceInputHash: receipt.inputHash,
          },
          data: {
            status: 'COMPLETED',
            maintenancePlanIds: receipt.plans.map((r) => r.planId),
            maintenancePlanId:
              receipt.plans.length === 1 ? receipt.plans[0].planId : null,
            ...(row.deliveryMethod === 'CUSTOMER_SITE'
              ? { maintenanceProvisioning: 'READY' }
              : { completedBy: p.userId, completedAt: new Date() }),
            lastErrorCode: null,
            lastAttemptAt: new Date(),
            version: { increment: 1 },
          },
        });
        if (changed.count) {
          if (row.deliveryMethod === 'STORE')
            await tx.equipment.update({
              where: { id: row.equipmentId },
              data: { status: 'ACTIVE' },
            });
          const equipment = await tx.equipment.findUniqueOrThrow({
            where: { id: row.equipmentId },
          });
          await tx.equipmentHistory.create({
            data: {
              tenantId: row.tenantId,
              equipmentId: row.equipmentId,
              eventType:
                row.deliveryMethod === 'STORE'
                  ? 'REGISTRATION_STAFF_COMPLETED'
                  : 'SERVICE_SETUP_COMPLETED',
              referenceType: 'EQUIPMENT_REGISTRATION',
              referenceId: id,
              ...auditContext(equipment, p.userId, p.roles),
              changes: {
                maintenancePlanIds: receipt.plans.map((r) => r.planId),
              },
            },
          });
        }
      });
    } catch {
      await this.db.equipmentRegistration.updateMany({
        where: {
          id,
          tenantId: row.tenantId,
          ...(row.deliveryMethod === 'CUSTOMER_SITE'
            ? { status: 'COMPLETED', maintenanceProvisioning: 'PENDING' }
            : { status: 'PENDING_MAINTENANCE' }),
        },
        data: {
          lastErrorCode: 'MAINTENANCE_GROUP_UNCONFIRMED',
          lastAttemptAt: new Date(),
        },
      });
    }
    return this.registration(p, id);
  }
}

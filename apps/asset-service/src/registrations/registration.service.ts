import { createHash } from 'node:crypto';
import {
  BadGatewayException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { dataScope, scopeWhere, type Principal } from '@pbl6/auth';
import { ServiceHttpClient, toPage, UpstreamError } from '@pbl6/service-kit';
import { isUUID } from 'class-validator';
import {
  Prisma,
  type EquipmentRegistration,
  type Equipment,
} from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service';
import {
  EquipmentRepository,
  todayInVietnam,
} from '../equipment/equipment.repository';
import { EquipmentService } from '../equipment/equipment.service';
import { WarrantyRepository } from '../warranties/warranty.repository';
import {
  ORGANIZATION_CLIENT,
  type OrganizationClient,
} from '../organization/organization-client';
import { auditContext, json } from '../history/audit';
import {
  equipmentSource,
  warrantyChoice,
  maintenanceChoice,
  invalidInput,
  type WarrantyChoice,
  type MaintenanceChoice,
  type CreateRegistrationDto,
  type PatchRegistrationDto,
  type RegistrationQuery,
} from './registration.dto';

type Tx = Prisma.TransactionClient;
export function canonical(value: unknown): unknown {
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
}
export const inputHash = (value: unknown) =>
  createHash('sha256')
    .update(JSON.stringify(canonical(value)))
    .digest('hex');
const conflict = (code: string, message: string) =>
  new ConflictException({ code, message });
const missing = () =>
  new NotFoundException({
    code: 'REGISTRATION_NOT_FOUND',
    message: 'Registration not found',
  });
const referenceError = (code: string) =>
  new UnprocessableEntityException({
    code,
    message: 'Reference cannot be used for this registration',
  });
const permitted = (
  p: Principal,
  code: 'warranty:manage' | 'maintenance:manage',
) => {
  if (!p.permissions.has(code))
    throw new ForbiddenException({
      code: 'FORBIDDEN',
      message: 'Missing permission',
      details: { required: [code] },
    });
};

@Injectable()
export class RegistrationService {
  constructor(
    private readonly db: PrismaService,
    private readonly equipment: EquipmentService,
    private readonly equipmentRepo: EquipmentRepository,
    private readonly warrantyRepo: WarrantyRepository,
    private readonly config: ConfigService,
    @Inject(ORGANIZATION_CLIENT)
    private readonly organization: OrganizationClient,
  ) {}

  private client() {
    const baseUrl = this.config.get<string>('MAINTENANCE_SERVICE_URL');
    if (!baseUrl)
      throw new ServiceUnavailableException({
        code: 'MAINTENANCE_NOT_CONFIGURED',
        message: 'Maintenance service is not configured',
      });
    return new ServiceHttpClient({ name: 'maintenance-service', baseUrl });
  }
  private choices(p: Principal, w?: unknown, m?: unknown) {
    const warranty = warrantyChoice(canonical(w ?? { mode: 'UNCONFIRMED' }));
    const maintenance = maintenanceChoice(
      canonical(m ?? { mode: 'UNCONFIRMED' }),
    );
    if (warranty.mode !== 'UNCONFIRMED') permitted(p, 'warranty:manage');
    if (maintenance.mode !== 'UNCONFIRMED') permitted(p, 'maintenance:manage');
    return { warranty, maintenance };
  }
  private choiceData(w: WarrantyChoice, m: MaintenanceChoice) {
    return {
      warrantyDecision: w.mode,
      warrantyPayload: ['CREATE', 'KEEP'].includes(w.mode)
        ? json(w)
        : Prisma.DbNull,
      warrantyReason: w.mode === 'NONE' ? w.reason : null,
      maintenanceDecision: m.mode,
      maintenancePayload: ['CREATE', 'KEEP'].includes(m.mode)
        ? json(m)
        : Prisma.DbNull,
      maintenanceReason: m.mode === 'NONE' ? m.reason : null,
    };
  }
  private storedWarranty(row: EquipmentRegistration): WarrantyChoice {
    return warrantyChoice(
      row.warrantyPayload ??
        (row.warrantyDecision === 'NONE'
          ? { mode: 'NONE', reason: row.warrantyReason }
          : { mode: 'UNCONFIRMED' }),
    );
  }
  private storedMaintenance(row: EquipmentRegistration): MaintenanceChoice {
    return maintenanceChoice(
      row.maintenancePayload ??
        (row.maintenanceDecision === 'NONE'
          ? { mode: 'NONE', reason: row.maintenanceReason }
          : { mode: 'UNCONFIRMED' }),
    );
  }
  view(row: EquipmentRegistration, p: Principal) {
    const canSubmit =
      p.permissions.has('warranty:manage') &&
      p.permissions.has('maintenance:manage');
    return {
      id: row.id,
      equipmentId: row.equipmentId,
      status: row.status,
      version: row.version,
      warranty: this.storedWarranty(row),
      maintenance: this.storedMaintenance(row),
      warrantyId: row.warrantyId,
      maintenancePlanId: row.maintenancePlanId,
      lastErrorCode: row.lastErrorCode,
      lastAttemptAt: row.lastAttemptAt,
      submittedAt: row.submittedAt,
      completedAt: row.completedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      allowedActions:
        row.status === 'DRAFT'
          ? ['edit', ...(canSubmit ? ['submit'] : [])]
          : row.status === 'PENDING_MAINTENANCE' && canSubmit
            ? ['resume']
            : [],
    };
  }
  private async load(p: Principal, id: string, tx: Tx = this.db) {
    const row = await tx.equipmentRegistration.findFirst({
      where: { id, tenantId: dataScope(p).tenantId },
    });
    if (!row) throw missing();
    return row;
  }
  async detail(p: Principal, id: string) {
    return this.view(await this.load(p, id), p);
  }
  async list(p: Principal, q: RegistrationQuery) {
    const where = {
      tenantId: dataScope(p).tenantId,
      ...(q.status ? { status: q.status } : {}),
      ...(q.equipmentId ? { equipmentId: q.equipmentId } : {}),
      ...(q.createKey
        ? { createKey: q.createKey, createActorId: p.userId }
        : {}),
    };
    const [rows, total] = await this.db.$transaction([
      this.db.equipmentRegistration.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
        take: q.pageSize,
        skip: (q.page - 1) * q.pageSize,
      }),
      this.db.equipmentRegistration.count({ where }),
    ]);
    return toPage(
      rows.map((row) => this.view(row, p)),
      total,
      q,
    );
  }
  private checkDates(
    row: {
      installationDate?: string | null;
      handoverDate?: string | null;
      commissionedDate?: string | null;
    },
    complete = false,
  ) {
    if (complete && !row.handoverDate)
      invalidInput(
        'Record the actual handover date before completing registration',
      );
    const today = todayInVietnam();
    if (
      [row.installationDate, row.handoverDate, row.commissionedDate].some(
        (d) => d && d > today,
      )
    )
      invalidInput('Actual equipment dates cannot be in the future');
  }
  async create(p: Principal, raw: CreateRegistrationDto, key: string) {
    if (!isUUID(key)) invalidInput('Idempotency-Key must be a UUID');
    const normalized = canonical(raw) as CreateRegistrationDto;
    const source = equipmentSource(normalized.equipment);
    const { warranty, maintenance } = this.choices(
      p,
      normalized.warranty,
      normalized.maintenance,
    );
    const tenantId = dataScope(p).tenantId;
    const hash = inputHash({ equipment: source, warranty, maintenance });
    // Replay precedes dependency validation: a formerly active model can now be inactive.
    const prior = await this.db.equipmentRegistration.findUnique({
      where: {
        tenantId_createActorId_createKey: {
          tenantId,
          createActorId: p.userId,
          createKey: key,
        },
      },
    });
    if (prior) {
      if (prior.createRequestHash !== hash)
        throw conflict(
          'IDEMPOTENCY_KEY_REUSED',
          'This key belongs to another request',
        );
      return this.view(prior, p);
    }
    if (source.mode === 'NEW') {
      this.checkDates(source.data);
      await this.equipment.validateCreate(p, source.data);
    }
    const row = await this.db.$transaction(async (tx) => {
      const lock = `registration-create:${tenantId}:${p.userId}:${key.toLowerCase()}`;
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lock}, 0))::text`;
      const replay = await tx.equipmentRegistration.findUnique({
        where: {
          tenantId_createActorId_createKey: {
            tenantId,
            createActorId: p.userId,
            createKey: key,
          },
        },
      });
      if (replay) {
        if (replay.createRequestHash !== hash)
          throw conflict(
            'IDEMPOTENCY_KEY_REUSED',
            'This key belongs to another request',
          );
        return replay;
      }
      const eq =
        source.mode === 'NEW'
          ? await this.equipmentRepo.createWithHistory(
              tenantId,
              p.userId,
              source.data,
              p.roles,
              tx,
            )
          : await this.lockEquipment(p, source.id, tx);
      if (eq.status === 'RETIRED') throw referenceError('EQUIPMENT_RETIRED');
      const existing = await tx.equipmentRegistration.findUnique({
        where: { tenantId_equipmentId: { tenantId, equipmentId: eq.id } },
      });
      if (existing)
        throw new ConflictException({
          code: 'REGISTRATION_ALREADY_EXISTS',
          message: 'Open the existing registration',
          details: { registrationId: existing.id },
        });
      const created = await tx.equipmentRegistration.create({
        data: {
          tenantId,
          equipmentId: eq.id,
          createActorId: p.userId,
          createKey: key,
          createRequestHash: hash,
          updatedBy: p.userId,
          ...this.choiceData(warranty, maintenance),
        },
      });
      await this.audit(tx, eq, p, 'SERVICE_SETUP_DRAFT_CREATED', created.id);
      return created;
    });
    return this.view(row, p);
  }
  private async lockEquipment(p: Principal, id: string, tx: Tx) {
    const scope = dataScope(p);
    await tx.$queryRaw`SELECT id FROM equipments WHERE tenant_id = ${scope.tenantId}::uuid AND id = ${id}::uuid FOR UPDATE`;
    const eq = await tx.equipment.findFirst({
      where: { ...scopeWhere(scope), id },
    });
    if (!eq)
      throw new NotFoundException({
        code: 'EQUIPMENT_NOT_FOUND',
        message: 'Equipment not found',
      });
    return eq;
  }
  private async locked(p: Principal, id: string, tx: Tx) {
    const ref = await this.load(p, id, tx);
    const eq = await this.lockEquipment(p, ref.equipmentId, tx);
    await tx.$queryRaw`SELECT id FROM equipment_registrations WHERE tenant_id = ${eq.tenantId}::uuid AND id = ${id}::uuid FOR UPDATE`;
    return { row: await this.load(p, id, tx), eq };
  }
  private assertDraft(row: EquipmentRegistration, version: number) {
    if (row.status !== 'DRAFT')
      throw conflict(
        'REGISTRATION_INPUT_FROZEN',
        'Submitted choices cannot be changed; check or resume the existing request',
      );
    if (row.version !== version)
      throw conflict(
        'REGISTRATION_VERSION_CONFLICT',
        'The draft changed; reload it before saving',
      );
  }
  async patch(p: Principal, id: string, input: PatchRegistrationDto) {
    if (input.warranty === undefined && input.maintenance === undefined)
      invalidInput('Provide at least one decision');
    const row = await this.db.$transaction(async (tx) => {
      const { row, eq } = await this.locked(p, id, tx);
      this.assertDraft(row, input.expectedVersion);
      if (eq.status === 'RETIRED') throw referenceError('EQUIPMENT_RETIRED');
      const validated = this.choices(p, input.warranty, input.maintenance);
      const warranty =
        input.warranty === undefined
          ? this.storedWarranty(row)
          : validated.warranty;
      const maintenance =
        input.maintenance === undefined
          ? this.storedMaintenance(row)
          : validated.maintenance;
      const updated = await tx.equipmentRegistration.update({
        where: { id },
        data: {
          ...this.choiceData(warranty, maintenance),
          version: { increment: 1 },
          updatedBy: p.userId,
        },
      });
      await this.audit(tx, eq, p, 'SERVICE_SETUP_DRAFT_UPDATED', id);
      return updated;
    });
    return this.view(row, p);
  }
  async submit(p: Principal, id: string, expectedVersion: number) {
    permitted(p, 'warranty:manage');
    permitted(p, 'maintenance:manage');
    const preflight = await this.load(p, id);
    this.assertDraft(preflight, expectedVersion);
    const eq = await this.db.equipment.findFirstOrThrow({
      where: { tenantId: preflight.tenantId, id: preflight.equipmentId },
    });
    const customer = await this.organization.getCustomer(eq.customerId, p);
    const site = await this.organization.getSite(
      eq.customerId,
      eq.customerSiteId,
      eq.locationId ?? undefined,
      p,
    );
    if (
      !customer ||
      customer.status !== 'ACTIVE' ||
      !site ||
      site.siteStatus !== 'ACTIVE'
    )
      throw referenceError('CUSTOMER_SITE_INACTIVE');
    if (preflight.maintenanceDecision === 'NONE') {
      const client = this.client();
      for (const status of ['ACTIVE', 'PAUSED']) {
        const page = await client.get<{ items: unknown[]; total: number }>(
          '/maintenance-plans',
          {
            accessToken: p.accessToken,
            query: { equipmentId: eq.id, status, pageSize: 1 },
          },
        );
        if (!Array.isArray(page.items) || !Number.isSafeInteger(page.total))
          throw new BadGatewayException({
            code: 'UPSTREAM_ERROR',
            message: 'Invalid Maintenance response',
          });
        if (page.total > 0)
          throw conflict(
            'EXISTING_MAINTENANCE_PLAN',
            'Choose KEEP or manage the existing plan first',
          );
      }
    }
    const saved = await this.db.$transaction(async (tx) => {
      const { row, eq } = await this.locked(p, id, tx);
      this.assertDraft(row, expectedVersion);
      if (eq.status === 'RETIRED') throw referenceError('EQUIPMENT_RETIRED');
      // A location validated before the transaction must still describe this equipment.
      if (
        eq.customerSiteId !== site!.siteId ||
        eq.customerId !== customer!.id ||
        eq.locationId !== (site!.locationId ?? null)
      )
        throw conflict(
          'EQUIPMENT_REFERENCE_CHANGED',
          'Equipment location changed; reload before submitting',
        );
      this.checkDates(
        {
          handoverDate: eq.handoverDate?.toISOString().slice(0, 10),
          installationDate: eq.installationDate?.toISOString().slice(0, 10),
          commissionedDate: eq.commissionedDate?.toISOString().slice(0, 10),
        },
        true,
      );
      const w = this.storedWarranty(row),
        m = this.storedMaintenance(row);
      if (w.mode === 'UNCONFIRMED' || m.mode === 'UNCONFIRMED')
        invalidInput('Confirm both warranty and maintenance decisions');
      let warrantyId: string | null = null;
      if (w.mode === 'CREATE')
        warrantyId = (
          await this.warrantyRepo.add(
            dataScope(p),
            eq.id,
            p.userId,
            w,
            p.roles,
            tx,
          )
        ).id;
      if (w.mode === 'KEEP') {
        const existing = await tx.warranty.findFirst({
          where: {
            tenantId: eq.tenantId,
            equipmentId: eq.id,
            id: w.warrantyId,
            status: 'ACTIVE',
          },
        });
        if (!existing) throw referenceError('WARRANTY_NOT_FOUND');
        warrantyId = existing.id;
      }
      if (
        w.mode === 'NONE' &&
        (await tx.warranty.findFirst({
          where: {
            tenantId: eq.tenantId,
            equipmentId: eq.id,
            status: 'ACTIVE',
          },
        }))
      )
        throw conflict(
          'EXISTING_WARRANTY',
          'Keep or manage the existing warranty first',
        );
      const needsPlan = m.mode !== 'NONE';
      const updated = await tx.equipmentRegistration.update({
        where: { id },
        data: {
          warrantyId,
          status: needsPlan ? 'PENDING_MAINTENANCE' : 'COMPLETED',
          maintenanceInputHash: needsPlan
            ? inputHash({
                schema: 'registration-plan.v1',
                registrationId: id,
                equipmentId: eq.id,
                maintenance: m,
              })
            : null,
          submittedBy: p.userId,
          submittedAt: new Date(),
          updatedBy: p.userId,
          version: { increment: 1 },
          ...(!needsPlan
            ? { completedBy: p.userId, completedAt: new Date() }
            : {}),
        },
      });
      await this.audit(
        tx,
        eq,
        p,
        needsPlan ? 'SERVICE_SETUP_SUBMITTED' : 'SERVICE_SETUP_COMPLETED',
        id,
      );
      return updated;
    });
    return saved.status === 'COMPLETED'
      ? this.view(saved, p)
      : this.resume(p, id);
  }
  async projection(p: Principal, id: string) {
    const row = await this.load(p, id);
    if (row.status === 'DRAFT' || !row.maintenanceInputHash)
      throw conflict(
        'REGISTRATION_NOT_SUBMITTED',
        'Maintenance input has not been submitted',
      );
    return {
      registrationId: row.id,
      equipmentId: row.equipmentId,
      maintenance: this.storedMaintenance(row),
      inputHash: row.maintenanceInputHash,
    };
  }
  async resume(p: Principal, id: string) {
    permitted(p, 'warranty:manage');
    permitted(p, 'maintenance:manage');
    const source = await this.load(p, id);
    if (source.status === 'COMPLETED') return this.view(source, p);
    if (source.status !== 'PENDING_MAINTENANCE')
      throw conflict('REGISTRATION_NOT_SUBMITTED', 'Submit the draft first');
    let receipt: {
      registrationId: string;
      equipmentId: string;
      planId: string;
      setupInputHash: string;
    };
    try {
      receipt = await this.client().request(
        'PUT',
        `/internal/equipment-registrations/${id}/maintenance-plan`,
        { accessToken: p.accessToken },
      );
      if (
        receipt.registrationId?.toLowerCase() !== id.toLowerCase() ||
        receipt.equipmentId?.toLowerCase() !== source.equipmentId ||
        !isUUID(receipt.planId) ||
        receipt.setupInputHash !== source.maintenanceInputHash
      )
        throw new Error('Invalid receipt');
    } catch (error) {
      const code =
        error instanceof UpstreamError
          ? [401, 403].includes(error.status)
            ? 'MAINTENANCE_AUTHORIZATION_REQUIRED'
            : error.status === 409
              ? 'REGISTRATION_PLAN_CONFLICT'
              : error.status === 422
                ? 'MAINTENANCE_REFERENCE_INVALID'
                : 'MAINTENANCE_UNAVAILABLE'
          : 'MAINTENANCE_RESULT_UNKNOWN';
      await this.db.equipmentRegistration.updateMany({
        where: { id, tenantId: source.tenantId, status: 'PENDING_MAINTENANCE' },
        data: { lastAttemptAt: new Date(), lastErrorCode: code },
      });
      return this.detail(p, id);
    }
    const updated = await this.db.$transaction(async (tx) => {
      const { row, eq } = await this.locked(p, id, tx);
      if (row.status === 'COMPLETED') return row;
      if (
        row.status !== 'PENDING_MAINTENANCE' ||
        row.maintenanceInputHash !== receipt.setupInputHash
      )
        throw conflict(
          'REGISTRATION_PLAN_CONFLICT',
          'The receipt does not match the submitted input',
        );
      const updated = await tx.equipmentRegistration.update({
        where: { id },
        data: {
          status: 'COMPLETED',
          maintenancePlanId: receipt.planId,
          completedBy: p.userId,
          completedAt: new Date(),
          updatedBy: p.userId,
          version: { increment: 1 },
          lastAttemptAt: new Date(),
          lastErrorCode: null,
        },
      });
      await this.audit(tx, eq, p, 'SERVICE_SETUP_COMPLETED', id);
      return updated;
    });
    return this.view(updated, p);
  }
  private audit(
    tx: Tx,
    eq: Equipment,
    p: Principal,
    eventType: string,
    id: string,
  ) {
    return tx.equipmentHistory.create({
      data: {
        tenantId: eq.tenantId,
        equipmentId: eq.id,
        eventType,
        referenceType: 'EQUIPMENT_REGISTRATION',
        referenceId: id,
        ...auditContext(eq, p.userId, p.roles),
      },
    });
  }
}

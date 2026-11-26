import { ModelSetupService } from '../model-policies/model-setup.service';
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
  dateString,
  dbDate,
  todayInVietnam,
} from '../equipment/equipment.repository';
import { EquipmentService } from '../equipment/equipment.service';
import { EQUIPMENT_STATUSES } from '../equipment/dto/equipment.dto';
import { WarrantyRepository } from '../warranties/warranty.repository';
import {
  ORGANIZATION_CLIENT,
  type OrganizationClient,
} from '../organization/organization-client';
import { auditContext, changedFields, json } from '../history/audit';
import {
  equipmentSource,
  dto,
  DraftHandoverDetailsDto,
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
export { canonical, inputHash } from '../model-policies/policy-hash';
import { canonical, inputHash } from '../model-policies/policy-hash';
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
    private readonly modelSetup: ModelSetupService,
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
      deliveryMethod: row.deliveryMethod,
      handoverDetails: row.handoverDetails,
      handoverId: row.handoverId,
      maintenanceProvisioning: row.maintenanceProvisioning,
      version: row.version,
      warranty: this.storedWarranty(row),
      maintenance: this.storedMaintenance(row),
      warrantyId: row.warrantyId,
      maintenancePlanId: row.maintenancePlanId,
      maintenancePlanIds: row.maintenancePlanIds ?? [],
      policyPreview: row.policyPreview ?? null,
      lastErrorCode: row.lastErrorCode,
      lastAttemptAt: row.lastAttemptAt,
      submittedAt: row.submittedAt,
      completedAt: row.completedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      allowedActions:
        row.status === 'DRAFT'
          ? [
              'edit',
              ...(row.createdWithEquipment && !row.handoverId ? ['editEquipmentIdentity'] : []),
              ...(canSubmit ? ['submit'] : []),
            ]
          : (row.status === 'PENDING_MAINTENANCE' ||
                row.maintenanceProvisioning === 'PENDING') &&
              canSubmit
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
    const { tenantId } = dataScope(p);
    const currentHandover = { supersededById: null };
    const equipmentFilter = q.handoverStatus
      ? { handovers: { some: { ...currentHandover, status: q.handoverStatus } } }
      : {};
    const baseWhere: Prisma.EquipmentRegistrationWhereInput = {
      tenantId,
      ...(q.status ? { status: q.status } : {}),
      ...(q.equipmentId ? { equipmentId: q.equipmentId } : {}),
      ...(q.createKey
        ? { createKey: q.createKey, createActorId: p.userId }
        : {}),
      equipment: { is: equipmentFilter },
    };
    const where: Prisma.EquipmentRegistrationWhereInput = q.equipmentStatus
      ? { ...baseWhere, equipment: { is: { ...equipmentFilter, status: q.equipmentStatus } } }
      : baseWhere;
    const [rows, total, grouped] = await this.db.$transaction([
      this.db.equipmentRegistration.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
        take: q.pageSize,
        skip: (q.page - 1) * q.pageSize,
        include: {
          equipment: {
            select: {
              status: true,
              displayName: true,
              assetCode: true,
              serialNumber: true,
              model: { select: { name: true } },
              handovers: {
                where: currentHandover,
                orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
                take: 1,
                select: { id: true, status: true },
              },
            },
          },
        },
      }),
      this.db.equipmentRegistration.count({ where }),
      this.db.equipment.groupBy({
        by: ['status'],
        where: { tenantId, registration: { is: baseWhere } },
        _count: { _all: true },
      }),
    ], { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
    const counts = new Map(grouped.map((row) => [row.status, row._count._all]));
    const page = toPage(
      rows.map((row) => {
        const { handovers, ...equipment } = row.equipment;
        return { ...this.view(row, p), equipment, handover: handovers[0] ?? null };
      }),
      total,
      q,
    );
    return {
      ...page,
      summary: {
        total: grouped.reduce((sum, row) => sum + row._count._all, 0),
        byEquipmentStatus: Object.fromEntries(
          EQUIPMENT_STATUSES.map((status) => [status, counts.get(status) ?? 0]),
        ),
      },
    };
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
  async create(p: Principal, raw: CreateRegistrationDto, key: string, transaction?: Tx) {
    if (!isUUID(key)) invalidInput('Idempotency-Key must be a UUID');
    const normalized = canonical(raw) as CreateRegistrationDto;
    const source = equipmentSource(normalized.equipment);
    const { warranty, maintenance } = this.choices(
      p,
      normalized.warranty,
      normalized.maintenance,
    );
    const tenantId = dataScope(p).tenantId;
    const deliveryMethod = normalized.deliveryMethod;
    const details =
      normalized.handoverDetails === undefined
        ? undefined
        : dto(DraftHandoverDetailsDto, normalized.handoverDetails);
    if (details && deliveryMethod !== 'CUSTOMER_SITE')
      invalidInput('Only customer-site handovers have confirmation details');
    if (
      deliveryMethod === 'STORE' &&
      source.mode === 'NEW' &&
      (source.data.installationDate ||
        source.data.commissionedDate ||
        source.data.handoverRequired)
    )
      invalidInput(
        'Store handovers do not have installation, commissioning or customer acceptance',
      );
    const hash = inputHash({
      equipment: source,
      warranty,
      maintenance,
      ...(deliveryMethod ? { deliveryMethod } : {}),
      ...(details ? { handoverDetails: details } : {}),
    });
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
      // Batch callers prevalidate every row before opening their Asset transaction.
      if (!transaction) await this.equipment.validateCreate(p, source.data);
    }
    const write = async (tx: Tx) => {
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
              deliveryMethod
                ? {
                    ...source.data,
                    handoverRequired: deliveryMethod === 'CUSTOMER_SITE',
                  }
                : source.data,
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
      if (deliveryMethod) {
        if (
          eq.status === 'IN_SERVICE' ||
          (deliveryMethod === 'STORE' && eq.handoverRequired)
        )
          throw referenceError('EQUIPMENT_HANDOVER_CONFLICT');
        if (
          deliveryMethod === 'STORE' &&
          (eq.installationDate || eq.commissionedDate)
        )
          invalidInput(
            'Store handovers do not include installation or commissioning',
          );
        await tx.equipment.update({
          where: { id: eq.id },
          data: {
            status: 'OUT_OF_SERVICE',
            handoverRequired: deliveryMethod === 'CUSTOMER_SITE',
          },
        });
      }
      const created = await tx.equipmentRegistration.create({
        data: {
          tenantId,
          equipmentId: eq.id,
          deliveryMethod,
          createdWithEquipment: source.mode === 'NEW',
          handoverDetails: details ? json(details) : Prisma.DbNull,
          createActorId: p.userId,
          createKey: key,
          createRequestHash: hash,
          updatedBy: p.userId,
          ...this.choiceData(warranty, maintenance),
        },
      });
      await this.audit(tx, eq, p, 'SERVICE_SETUP_DRAFT_CREATED', created.id);
      return created;
    };
    const row = transaction ? await write(transaction) : await this.db.$transaction(write);
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
    const { expectedVersion, deliveryMethod, handoverDetails, warranty, maintenance, ...fields } = input;
    if ([deliveryMethod, handoverDetails, warranty, maintenance, ...Object.values(fields)].every((value) => value === undefined))
      invalidInput('Provide at least one draft field');

    const changingLocation = fields.customerId !== undefined ||
      fields.customerSiteId !== undefined || fields.locationId !== undefined;
    const locationFor = (eq: Equipment) => {
      const customerId = fields.customerId?.toLowerCase() ?? eq.customerId;
      const customerSiteId = fields.customerSiteId?.toLowerCase() ?? eq.customerSiteId;
      const sameSite = customerId === eq.customerId && customerSiteId === eq.customerSiteId;
      return {
        customerId,
        customerSiteId,
        locationId: fields.locationId !== undefined
          ? fields.locationId?.toLowerCase() ?? null
          : sameSite ? eq.locationId : null,
      };
    };
    let validatedLocation: ReturnType<typeof locationFor> | undefined;
    if (changingLocation) {
      const draft = await this.load(p, id);
      this.assertDraft(draft, expectedVersion);
      const eq = await this.db.equipment.findFirst({
        where: { ...scopeWhere(dataScope(p)), id: draft.equipmentId },
      });
      if (!eq) throw referenceError('EQUIPMENT_NOT_FOUND');
      this.assertDraftIdentity(draft, eq);
      validatedLocation = locationFor(eq);
      const { customerId, customerSiteId, locationId } = validatedLocation;
      const [customer, site] = await Promise.all([
        this.organization.getCustomer(customerId, p),
        this.organization.getSite(customerId, customerSiteId, locationId ?? undefined, p),
      ]);
      if (!customer || customer.id !== customerId || customer.status !== 'ACTIVE')
        throw referenceError('CUSTOMER_NOT_FOUND');
      if (!site || site.customerId !== customerId || site.siteId !== customerSiteId || site.siteStatus !== 'ACTIVE')
        throw referenceError('SITE_NOT_OF_CUSTOMER');
      if ((site.locationId ?? null) !== locationId)
        throw referenceError('LOCATION_NOT_IN_SITE');
    }

    const row = await this.db.$transaction(async (tx) => {
      const { row, eq } = await this.locked(p, id, tx);
      this.assertDraft(row, expectedVersion);
      if (eq.status === 'RETIRED') throw referenceError('EQUIPMENT_RETIRED');
      const nextDelivery = deliveryMethod ?? row.deliveryMethod;
      const deliveryChanged = nextDelivery !== row.deliveryMethod;
      if (changingLocation || deliveryChanged || fields.assetCode !== undefined || fields.serialNumber !== undefined)
        this.assertDraftIdentity(row, eq);
      if (validatedLocation && Object.keys(changedFields(validatedLocation, locationFor(eq))).length)
        throw conflict('EQUIPMENT_REFERENCE_CHANGED', 'Reload the draft');

      const modelId = fields.modelId?.toLowerCase() ?? eq.modelId;
      const modelChanged = modelId !== eq.modelId;
      if (modelChanged) {
        if (eq.status === 'IN_SERVICE') throw referenceError('EQUIPMENT_HANDOVER_CONFLICT');
        await this.equipmentRepo.lockActiveModel(tx, eq.tenantId, modelId);
      }

      if (handoverDetails && nextDelivery !== 'CUSTOMER_SITE')
        invalidInput('Only customer-site handovers have confirmation details');
      if (nextDelivery === 'STORE' && (fields.installationDate || fields.commissionedDate))
        invalidInput('Store handovers do not have installation or commissioning dates');
      this.checkDates(fields);
      if (fields.purchaseDate && fields.purchaseDate > todayInVietnam())
        invalidInput('Purchase date cannot be in the future');
      const details = handoverDetails ? dto(DraftHandoverDetailsDto, handoverDetails) : null;
      const normalizeDate = (value: string | null | undefined) =>
        value === undefined ? undefined : value === null ? null : dbDate(value);
      const handoverChanged = fields.handoverDate !== undefined && fields.handoverDate !== dateString(eq.handoverDate);
      const validated = this.choices(p, warranty, maintenance);
      const updated = await tx.equipmentRegistration.update({
        where: { id },
        data: {
          ...this.choiceData(
            warranty === undefined ? this.storedWarranty(row) : validated.warranty,
            maintenance === undefined ? this.storedMaintenance(row) : validated.maintenance,
          ),
          ...(deliveryChanged ? { deliveryMethod: nextDelivery } : {}),
          ...(handoverDetails !== undefined || deliveryChanged
            ? { handoverDetails: details ? json(details) : Prisma.DbNull } : {}),
          ...(modelChanged || handoverChanged || warranty !== undefined || maintenance !== undefined
            ? { policyPreview: Prisma.DbNull } : {}),
          version: { increment: 1 },
          updatedBy: p.userId,
        },
      });
      let equipment = eq;
      if (Object.values(fields).some((value) => value !== undefined) || deliveryChanged) {
        equipment = await tx.equipment.update({
          where: { id: eq.id, tenantId: eq.tenantId },
          data: {
            ...validatedLocation,
            ...(modelChanged ? { modelId } : {}),
            assetCode: fields.assetCode?.trim(),
            serialNumber: fields.serialNumber?.trim(),
            displayName: fields.displayName === null ? null : fields.displayName?.trim(),
            handoverDate: normalizeDate(fields.handoverDate),
            purchaseDate: normalizeDate(fields.purchaseDate),
            installationDate: deliveryChanged && nextDelivery === 'STORE' ? null : normalizeDate(fields.installationDate),
            commissionedDate: deliveryChanged && nextDelivery === 'STORE' ? null : normalizeDate(fields.commissionedDate),
            ...(validatedLocation && Object.keys(changedFields(validatedLocation, {
              customerId: eq.customerId, customerSiteId: eq.customerSiteId, locationId: eq.locationId,
            })).length ? { snapshotVersion: { increment: 1 } } : {}),
            ...(deliveryChanged ? {
              status: 'OUT_OF_SERVICE',
              handoverRequired: nextDelivery === 'CUSTOMER_SITE',
            } : {}),
          },
        });
      }
      await this.audit(tx, equipment, p, 'SERVICE_SETUP_DRAFT_UPDATED', id);
      return updated;
    });
    return this.view(row, p);
  }

  private assertDraftIdentity(row: EquipmentRegistration, eq: Equipment) {
    if (!row.createdWithEquipment || row.handoverId || eq.currentHandoverId || eq.status === 'IN_SERVICE' || eq.status === 'RETIRED')
      throw conflict('REGISTRATION_IDENTITY_FROZEN', 'Equipment identity and delivery method can only be edited before its first handover');
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
    this.checkDates(
      {
        handoverDate: eq.handoverDate?.toISOString().slice(0, 10),
        installationDate: eq.installationDate?.toISOString().slice(0, 10),
        commissionedDate: eq.commissionedDate?.toISOString().slice(0, 10),
      },
      true,
    );
    if (preflight.policyPreview)
      return this.view(
        await this.modelSetup.submit(p, id, expectedVersion, eq, customer.name),
        p,
      );
    if (preflight.deliveryMethod)
      invalidInput('Apply Model policies before submitting this handover');
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
    if (source.policyPreview)
      return this.view(await this.modelSetup.resume(p, id), p);
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

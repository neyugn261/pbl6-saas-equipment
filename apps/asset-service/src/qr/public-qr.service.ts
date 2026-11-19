import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import {
  assertBranchAccess,
  dataScope,
  staffBranchId,
  type Principal,
} from '@pbl6/auth';
import { toPage, toSkipTake } from '@pbl6/service-kit';
import { PrismaService } from '../prisma/prisma.service';
import {
  EquipmentRepository,
  todayInVietnam,
} from '../equipment/equipment.repository';
import {
  ORGANIZATION_CLIENT,
  type OrganizationClient,
} from '../organization/organization-client';
import { inputHash } from '../model-policies/policy-hash';
import { auditContext } from '../history/audit';
import {
  type InquiryDecision,
  type InquiryQuery,
  type PublicInquiryInput,
} from './public-qr.dto';

const missing = () =>
  new NotFoundException({
    code: 'PUBLIC_QR_UNAVAILABLE',
    message: 'This public QR is unavailable',
  });
const digest = (value: string) =>
  createHash('sha256').update(value).digest('hex');
@Injectable()
export class PublicQrService {
  constructor(
    private readonly db: PrismaService,
    private readonly config: ConfigService,
    private readonly equipment: EquipmentRepository,
    @Inject(ORGANIZATION_CLIENT)
    private readonly organization: OrganizationClient,
  ) {}
  private sign(value: string) {
    return createHmac(
      'sha256',
      this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
    )
      .update(`pbl6.public-qr-intake.v1:${value}`)
      .digest('base64url');
  }
  async settings(p: Principal, id: string) {
    const eq = await this.db.equipment.findFirst({
      where: { id, tenantId: dataScope(p).tenantId },
    });
    if (!eq) throw missing();
    const site = await this.organization.getSite(
      eq.customerId,
      eq.customerSiteId,
      eq.locationId ?? undefined,
      p,
    );
    if (!site) throw missing();
    assertBranchAccess(p, site.defaultServicingBranchId);
    const qr = await this.db.equipmentQrCode.findFirst({
      where: { tenantId: eq.tenantId, equipmentId: id, revokedAt: null },
    });
    return {
      enabled:
        !!qr?.publicEnabled &&
        qr.publicEquipmentVersion === eq.snapshotVersion &&
        eq.status !== 'RETIRED',
      hasQr: !!qr,
      eligible: eq.status !== 'RETIRED' && site.siteStatus === 'ACTIVE' && !!site.defaultServicingBranchId,
      routingReady: site.siteStatus === 'ACTIVE' && !!site.defaultServicingBranchId,
      name: eq.displayName ?? eq.assetCode,
      publicUrl: qr
        ? new URL(
            `portal/qr/${qr.token}`,
            this.config
              .getOrThrow<string>('ASSET_QR_PORTAL_BASE_URL')
              .replace(/\/?$/, '/'),
          ).toString()
        : null,
    };
  }
  async setting(p: Principal, id: string, enabled: boolean) {
    const tenantId = dataScope(p).tenantId;
    const eq = await this.db.equipment.findFirst({ where: { tenantId, id } });
    if (!eq || eq.status === 'RETIRED') throw missing();
    const site = await this.organization.getSite(
      eq.customerId,
      eq.customerSiteId,
      eq.locationId ?? undefined,
      p,
    );
    if (!site) throw missing();
    assertBranchAccess(p, site.defaultServicingBranchId);
    if (enabled && (site.siteStatus !== 'ACTIVE' || !site.defaultServicingBranchId))
      throw new UnprocessableEntityException({ code: 'PUBLIC_QR_ROUTING_REQUIRED', message: 'Assign an active customer site to a servicing branch before enabling public intake' });
    const qr = await this.db.equipmentQrCode.findFirst({
      where: { tenantId, equipmentId: id, revokedAt: null },
    });
    if (!qr) throw missing();
    const updated = await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM equipments WHERE tenant_id=${tenantId}::uuid AND id=${id}::uuid FOR UPDATE`;
      const current = await tx.equipment.findFirst({
        where: {
          tenantId,
          id,
          snapshotVersion: eq.snapshotVersion,
          status: { not: 'RETIRED' },
        },
      });
      if (!current)
        throw new ConflictException({
          code: 'EQUIPMENT_CHANGED',
          message: 'Reload equipment before enabling public access',
        });
      const changed = await tx.equipmentQrCode.updateMany({
        where: { id: qr.id, tenantId, revokedAt: null },
        data: {
          publicEnabled: enabled,
          publicBranchId: site.defaultServicingBranchId,
          publicEquipmentVersion: eq.snapshotVersion,
        },
      });
      if (!changed.count) throw missing();
      await tx.equipmentHistory.create({
        data: {
          tenantId,
          equipmentId: id,
          eventType: enabled ? 'PUBLIC_QR_ENABLED' : 'PUBLIC_QR_DISABLED',
          referenceType: 'QR_CODE',
          referenceId: qr.id,
          ...auditContext(current, p.userId, p.roles),
          changes: {
            publicEnabled: { before: qr.publicEnabled, after: enabled },
          },
        },
      });
      return {
        enabled,
        publicUrl: enabled
          ? new URL(
              `portal/qr/${qr.token}`,
              this.config
                .getOrThrow<string>('ASSET_QR_PORTAL_BASE_URL')
                .replace(/\/?$/, '/'),
            ).toString()
          : null,
      };
    });
    return updated;
  }
  private async load(token: string) {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw missing();
    const qr = await this.db.equipmentQrCode.findFirst({
      where: { token, revokedAt: null, publicEnabled: true },
      include: { equipment: { include: { model: true } } },
    });
    if (
      !qr ||
      qr.equipment.status === 'RETIRED' ||
      qr.publicEquipmentVersion !== qr.equipment.snapshotVersion
    )
      throw missing();
    return qr;
  }
  async lookup(token: string) {
    const qr = await this.load(token),
      day = todayInVietnam();
    const warranty = await this.equipment.warrantyAt(
      qr.tenantId,
      qr.equipmentId,
      day,
    );
    const nonce = randomBytes(24).toString('base64url'),
      expiresAt = Date.now() + 15 * 60 * 1000;
    const body = Buffer.from(
      JSON.stringify({ qrId: qr.id, exp: expiresAt, nonce }),
    ).toString('base64url');
    return {
      name: qr.equipment.model.name,
      model: qr.equipment.model.modelCode,
      warrantyStatus: !warranty
        ? 'NO_WARRANTY'
        : warranty.endDate.toISOString().slice(0, 10) >= day
          ? 'IN_WARRANTY'
          : 'OUT_OF_WARRANTY',
      formToken: `${body}.${this.sign(body)}`,
      formExpiresAt: new Date(expiresAt).toISOString(),
      notice:
        'Warranty eligibility is assessed after verification; submitting this form does not create a Work Order.',
    };
  }
  async inquire(token: string, input: PublicInquiryInput) {
    const qr = await this.load(token);
    const [body, signature, extra] = input.formToken.split('.');
    const expected = this.sign(body ?? ''),
      actual = signature ?? '';
    if (
      extra ||
      !/^[A-Za-z0-9_-]+$/.test(body ?? '') ||
      !/^[A-Za-z0-9_-]{43}$/.test(actual) ||
      !timingSafeEqual(Buffer.from(actual), Buffer.from(expected))
    )
      throw missing();
    let decoded: { qrId: string; exp: number; nonce: string };
    try {
      decoded = JSON.parse(Buffer.from(body, 'base64url').toString());
    } catch {
      throw missing();
    }
    if (
      decoded.qrId !== qr.id ||
      !Number.isSafeInteger(decoded.exp) ||
      typeof decoded.nonce !== 'string'
    )
      throw missing();
    const tokenHash = digest(input.formToken),
      requestHash = inputHash({
        contactName: input.contactName,
        contactPhone: input.contactPhone,
        description: input.description,
      });
    return this.db.$transaction(async (tx) => {
      // Same lock order as revoke/rotation; a form cannot create an inquiry after revocation commits.
      await tx.$queryRaw`SELECT id FROM equipments WHERE tenant_id=${qr.tenantId}::uuid AND id=${qr.equipmentId}::uuid FOR UPDATE`;
      const active = await tx.equipmentQrCode.findFirst({
        where: { id: qr.id, publicEnabled: true, revokedAt: null },
        include: { equipment: true },
      });
      if (
        !active ||
        active.equipment.status === 'RETIRED' ||
        active.equipment.snapshotVersion !== active.publicEquipmentVersion
      )
        throw missing();
      const existing = await tx.publicQrInquiry.findUnique({
        where: { tokenHash },
      });
      if (existing) {
        if (existing.requestHash !== requestHash)
          throw new ConflictException({
            code: 'FORM_ALREADY_SUBMITTED',
            message: 'This form was already used',
          });
        return { reference: existing.id, status: 'PENDING_VERIFICATION' };
      }
      if (decoded.exp < Date.now() || decoded.exp > Date.now() + 16 * 60 * 1000)
        throw missing();
      const created = await tx.publicQrInquiry.create({
        data: {
          tenantId: qr.tenantId,
          equipmentId: qr.equipmentId,
          branchId: qr.publicBranchId,
          tokenHash,
          requestHash,
          contactName: input.contactName,
          contactPhone: input.contactPhone,
          description: input.description,
        },
      });
      return { reference: created.id, status: 'PENDING_VERIFICATION' };
    });
  }
  async list(p: Principal, query: InquiryQuery) {
    const where = {
      tenantId: dataScope(p).tenantId,
      ...(staffBranchId(p) ? { branchId: staffBranchId(p) } : {}),
      status: query.status,
    };
    const [rows, total] = await this.db.$transaction([
      this.db.publicQrInquiry.findMany({
        where,
        ...toSkipTake(query),
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
      this.db.publicQrInquiry.count({ where }),
    ]);
    return toPage(
      rows.map(
        ({ tokenHash: _tokenHash, requestHash: _requestHash, ...row }) => row,
      ),
      total,
      query,
    );
  }
  async decide(p: Principal, id: string, input: InquiryDecision) {
    const existing = await this.db.publicQrInquiry.findFirst({
      where: { id, tenantId: dataScope(p).tenantId },
    });
    if (!existing) throw new NotFoundException();
    assertBranchAccess(p, existing.branchId);
    if (!p.permissions.has('service_request:review'))
      throw new ForbiddenException();
    const changed = await this.db.publicQrInquiry.updateMany({
      where: { id, tenantId: existing.tenantId, status: 'NEW' },
      data: {
        status: input.status,
        resolutionNote: input.note,
        resolvedBy: p.userId,
        resolvedAt: new Date(),
      },
    });
    if (!changed.count)
      throw new ConflictException({
        code: 'INQUIRY_ALREADY_HANDLED',
        message: 'Reload inquiry',
      });
    return { id, status: input.status };
  }
}

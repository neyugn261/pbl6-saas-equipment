import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { isUUID } from 'class-validator';
import {
  assertInScope,
  dataScope,
  type PermissionCode,
  type Principal,
} from '@pbl6/auth';
import { Events, enqueueEvent } from '@pbl6/event-contracts';
import { getCorrelationId } from '@pbl6/service-kit';
import type { Page } from '@pbl6/service-kit';
import { Prisma, type ServiceRequest } from '../generated/prisma/client.js';
import {
  ASSET_CLIENT,
  type AssetClient,
  type WarrantyStatus,
} from '../asset/asset-client';
import { PrismaService } from '../prisma/prisma.service';
import {
  type AddCommentDto,
  type CommentVisibility,
  type CreateServiceRequestDto,
  type CostEstimateInputDto,
  type ListServiceRequestsDto,
  type OptionalReasonDto,
  type RequestPriority,
  type RequestStatus,
  type RequestType,
  REQUEST_STATUSES,
  type UpdateServiceRequestDto,
} from './dto';

type Tx = Prisma.TransactionClient;

const CUSTOMER_CANCEL_STATUSES: RequestStatus[] = [
  'NEW',
  'AWAITING_INFO',
  'AWAITING_CUSTOMER_APPROVAL',
  'COST_REJECTED',
];
const STAFF_CANCEL_STATUSES: RequestStatus[] = [
  ...CUSTOMER_CANCEL_STATUSES,
  'REVIEWING',
  'ACCEPTED',
];
const REJECT_STATUSES: RequestStatus[] = ['NEW', 'REVIEWING', 'AWAITING_INFO'];
const PRIORITY_ORDER: RequestPriority[] = ['LOW', 'NORMAL', 'HIGH', 'URGENT'];
const MONEY_LIMIT = new Prisma.Decimal('999999999999.99');

type EstimateWithItems = Prisma.CostEstimateGetPayload<{
  include: { items: true };
}>;

function hasPermission(
  principal: Principal,
  permission: PermissionCode,
): boolean {
  return principal.permissions.has(permission);
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

function publicRequest(request: ServiceRequest) {
  return {
    id: request.id,
    requestNo: request.requestNo,
    customerId: request.customerId,
    equipmentId: request.equipmentId,
    requesterId: request.requesterId,
    type: request.type,
    priority: request.priority,
    title: request.title,
    description: request.description,
    status: request.status,
    resolutionResult: request.resolutionResult,
    resolutionSummary: request.resolutionSummary,
    resolvedWorkOrderNo: request.resolvedWorkOrderNo,
    resolutionCompletedAt: request.resolutionCompletedAt,
    createdAt: request.createdAt,
    updatedAt: request.updatedAt,
    resolvedAt: request.resolvedAt,
    closedAt: request.closedAt,
  };
}

function publicEstimate(estimate: EstimateWithItems) {
  return {
    id: estimate.id,
    requestId: estimate.requestId,
    revisionNo: estimate.revisionNo,
    currency: estimate.currency.trim(),
    totalAmount: estimate.totalAmount.toFixed(2),
    status: estimate.status,
    validUntil: estimate.validUntil?.toISOString().slice(0, 10) ?? null,
    notes: estimate.notes,
    createdBy: estimate.createdBy,
    respondedBy: estimate.respondedBy,
    respondedAt: estimate.respondedAt,
    items: estimate.items.map((item) => ({
      id: item.id,
      itemType: item.itemType,
      description: item.description,
      quantity: item.quantity.toFixed(2),
      unitPrice: item.unitPrice.toFixed(2),
      amount: item.amount?.toFixed(2) ?? '0.00',
    })),
  };
}

function invalidTransition(from: string, action: string): ConflictException {
  return new ConflictException({
    code: 'INVALID_STATE_TRANSITION',
    message: 'The requested action is not allowed from the current status',
    details: { from, action },
  });
}

function allowedActions(
  request: ServiceRequest,
  principal: Principal,
  estimateStatus: string | null = null,
): string[] {
  const status = request.status as RequestStatus;
  const actions: string[] = [];
  const isCustomer = principal.userType === 'CUSTOMER';
  const canReview = hasPermission(principal, 'service_request:review');
  const canCreate = hasPermission(principal, 'service_request:create');
  const canManageEstimate = hasPermission(principal, 'cost_estimate:manage');
  const canRespondToEstimate = hasPermission(
    principal,
    'cost_estimate:respond',
  );
  const canComment =
    hasPermission(principal, 'service_request:read') &&
    (isCustomer ||
      hasPermission(principal, 'service_request:comment_internal'));

  if (canCreate && ['NEW', 'AWAITING_INFO'].includes(status)) {
    actions.push('edit');
  }
  if (canReview && status === 'NEW') actions.push('review');
  if (canReview && status === 'REVIEWING') {
    actions.push('request-info', 'warranty-check');
    if (request.warrantyCheckResult === 'IN_WARRANTY') actions.push('accept');
  }
  if (canReview && REJECT_STATUSES.includes(status)) actions.push('reject');
  if (
    canManageEstimate &&
    ['REVIEWING', 'COST_REJECTED'].includes(status) &&
    estimateStatus === null &&
    request.warrantyCheckResult !== null &&
    request.warrantyCheckResult !== 'IN_WARRANTY'
  ) {
    actions.push('create-estimate');
  }
  if (
    canManageEstimate &&
    estimateStatus === 'DRAFT' &&
    ['REVIEWING', 'COST_REJECTED'].includes(status)
  ) {
    actions.push('edit-estimate', 'delete-estimate', 'send-estimate');
  }
  if (
    canManageEstimate &&
    status === 'AWAITING_CUSTOMER_APPROVAL' &&
    estimateStatus === 'SENT'
  ) {
    actions.push('revise-estimate');
  }
  if (
    isCustomer &&
    canRespondToEstimate &&
    status === 'AWAITING_CUSTOMER_APPROVAL' &&
    estimateStatus === 'SENT'
  ) {
    actions.push('approve-estimate', 'reject-estimate');
  }

  if (
    (isCustomer && CUSTOMER_CANCEL_STATUSES.includes(status)) ||
    (!isCustomer && canReview && STAFF_CANCEL_STATUSES.includes(status))
  ) {
    actions.push('cancel');
  }
  if (canComment) actions.push('add-comment');
  if (status === 'RESOLVED' && (isCustomer ? canCreate : canReview)) {
    actions.push('confirm', 'reopen');
  }
  return actions;
}

@Injectable()
export class ServiceRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(ASSET_CLIENT) private readonly assets: AssetClient,
  ) {}

  async list(
    principal: Principal,
    query: ListServiceRequestsDto,
  ): Promise<Page<ReturnType<typeof publicRequest>>> {
    const scope = dataScope(principal);
    const statuses = query.status?.split(',').map((status) => status.trim());
    if (
      statuses?.some(
        (status) => !REQUEST_STATUSES.includes(status as RequestStatus),
      )
    ) {
      throw new BadRequestException({
        code: 'INVALID_STATUS_FILTER',
        message: 'One or more request statuses are invalid',
      });
    }

    const where: Prisma.ServiceRequestWhereInput = {
      tenantId: scope.tenantId,
      ...(scope.customerId ? { customerId: scope.customerId } : {}),
      ...(scope.customerId === null && query.customerId
        ? { customerId: query.customerId }
        : {}),
      ...(query.equipmentId ? { equipmentId: query.equipmentId } : {}),
      ...(query.priority ? { priority: query.priority } : {}),
      ...(statuses?.length ? { status: { in: statuses } } : {}),
      ...(query.q
        ? {
            OR: [
              {
                requestNo: {
                  contains: escapeLike(query.q),
                  mode: 'insensitive',
                },
              },
              { title: { contains: escapeLike(query.q), mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const skip = (query.page - 1) * query.pageSize;
    let requests: ServiceRequest[];
    let total: number;
    if (query.sort === 'priority' || query.sort === '-priority') {
      const priorities =
        query.sort === 'priority'
          ? PRIORITY_ORDER
          : [...PRIORITY_ORDER].reverse();
      const counts = await Promise.all(
        priorities.map((priority) =>
          this.prisma.serviceRequest.count({ where: { ...where, priority } }),
        ),
      );
      total = counts.reduce((sum, count) => sum + count, 0);
      requests = [];
      let remainingSkip = skip;
      for (const [index, priority] of priorities.entries()) {
        const count = counts[index];
        if (remainingSkip >= count) {
          remainingSkip -= count;
          continue;
        }
        requests.push(
          ...(await this.prisma.serviceRequest.findMany({
            where: { ...where, priority },
            skip: remainingSkip,
            take: query.pageSize - requests.length,
            orderBy: { createdAt: 'desc' },
          })),
        );
        remainingSkip = 0;
        if (requests.length === query.pageSize) break;
      }
    } else {
      [requests, total] = await Promise.all([
        this.prisma.serviceRequest.findMany({
          where,
          skip,
          take: query.pageSize,
          orderBy: this.orderBy(query.sort),
        }),
        this.prisma.serviceRequest.count({ where }),
      ]);
    }

    return {
      page: query.page,
      pageSize: query.pageSize,
      total,
      items: requests.map(publicRequest),
    };
  }

  async create(principal: Principal, input: CreateServiceRequestDto) {
    const scope = dataScope(principal);
    const isCustomer = principal.userType === 'CUSTOMER';
    const equipment = await this.assets.getEquipment(
      input.equipmentId,
      principal.accessToken,
    );
    if (!equipment) {
      throw new UnprocessableEntityException({
        code: 'EQUIPMENT_NOT_FOUND',
        message: 'The equipment is not available in the caller scope',
      });
    }
    if (
      equipment.id !== input.equipmentId ||
      !isUUID(equipment.customerId) ||
      !['ACTIVE', 'IN_SERVICE', 'OUT_OF_SERVICE', 'RETIRED'].includes(
        equipment.status,
      )
    ) {
      throw new BadGatewayException({
        code: 'INVALID_UPSTREAM_RESPONSE',
        message: 'Asset Service returned an invalid equipment reference',
      });
    }
    if (equipment.status === 'RETIRED') {
      throw new UnprocessableEntityException({
        code: 'EQUIPMENT_RETIRED',
        message: 'A service request cannot be created for retired equipment',
      });
    }
    const customerId = isCustomer
      ? scope.customerId
      : (input.customerId ?? equipment.customerId);
    if (!customerId) {
      throw new UnprocessableEntityException({
        code: 'CUSTOMER_REQUIRED',
        message: 'A customer is required to create a service request',
      });
    }
    if (equipment.customerId !== customerId) {
      if (isCustomer) {
        throw new NotFoundException({
          code: 'NOT_FOUND',
          message: 'Resource not found',
        });
      }
      throw new UnprocessableEntityException({
        code: 'EQUIPMENT_CUSTOMER_MISMATCH',
        message: 'The equipment does not belong to the supplied customer',
      });
    }

    const year = new Intl.DateTimeFormat('en', {
      timeZone: 'Asia/Ho_Chi_Minh',
      year: 'numeric',
    }).format(new Date());
    const request = await this.prisma.$transaction(async (tx) => {
      const sequence = await tx.$queryRawUnsafe<
        Array<{ last_value: bigint | number }>
      >(
        `INSERT INTO document_sequences (tenant_id, sequence_key, last_value)
         VALUES ($1::uuid, $2, 1)
         ON CONFLICT (tenant_id, sequence_key)
         DO UPDATE SET last_value = document_sequences.last_value + 1
         RETURNING last_value`,
        scope.tenantId,
        `SR-${year}`,
      );
      const requestNo = `SR-${year}-${String(sequence[0].last_value).padStart(4, '0')}`;
      const created = await tx.serviceRequest.create({
        data: {
          tenantId: scope.tenantId,
          requestNo,
          customerId,
          equipmentId: equipment.id,
          requesterId: principal.userId,
          type: input.type,
          priority: input.priority ?? 'NORMAL',
          title: input.title,
          description: input.description,
        },
      });
      await tx.requestStatusHistory.create({
        data: {
          tenantId: scope.tenantId,
          requestId: created.id,
          oldStatus: null,
          newStatus: 'NEW',
          changedBy: principal.userId,
        },
      });
      await enqueueEvent(tx, Events.ServiceRequestCreated, {
        tenantId: scope.tenantId,
        aggregateId: created.id,
        correlationId: getCorrelationId(),
        payload: {
          serviceRequestId: created.id,
          requestNo: created.requestNo,
          customerId: created.customerId,
          equipmentId: created.equipmentId,
          requesterId: created.requesterId,
          type: created.type as RequestType,
          priority: created.priority as RequestPriority,
        },
      });
      await this.enqueueStatusChanged(
        tx,
        created,
        null,
        'NEW',
        principal.userId,
        null,
      );
      return created;
    });

    return this.detail(principal, request.id);
  }

  async detail(principal: Principal, requestId: string) {
    const request = await this.findRequest(principal, requestId);
    await this.expireEstimateIfDue(principal, request.id);
    const liveEstimate = await this.prisma.costEstimate.findFirst({
      where: {
        tenantId: request.tenantId,
        requestId: request.id,
        status: {
          in:
            principal.userType === 'CUSTOMER'
              ? ['SENT', 'APPROVED']
              : ['DRAFT', 'SENT', 'APPROVED'],
        },
      },
      include: { items: true },
    });
    return {
      ...publicRequest(request),
      warrantyCheck: request.warrantyCheckResult
        ? {
            result: request.warrantyCheckResult,
            warrantyId: request.warrantyId,
            warrantyEndDate:
              request.warrantyEndDate?.toISOString().slice(0, 10) ?? null,
            checkedBy: request.warrantyCheckedBy,
            checkedAt: request.warrantyCheckedAt,
          }
        : null,
      liveEstimate: liveEstimate ? publicEstimate(liveEstimate) : null,
      allowedActions: allowedActions(
        request,
        principal,
        liveEstimate?.status ?? null,
      ),
    };
  }

  async listEstimates(principal: Principal, requestId: string) {
    const request = await this.findRequest(principal, requestId);
    await this.expireEstimateIfDue(principal, request.id);
    const estimates = await this.prisma.costEstimate.findMany({
      where: {
        tenantId: request.tenantId,
        requestId: request.id,
        ...(principal.userType === 'CUSTOMER'
          ? { status: { not: 'DRAFT' } }
          : {}),
      },
      include: { items: true },
      orderBy: [{ revisionNo: 'desc' }, { id: 'desc' }],
    });
    return estimates.map(publicEstimate);
  }

  async createEstimate(
    principal: Principal,
    requestId: string,
    input: CostEstimateInputDto,
  ) {
    const scope = dataScope(principal);
    const values = this.validateEstimateInput(input);
    const estimate = await this.prisma.$transaction(async (tx) => {
      const request = await this.lockRequest(tx, scope, requestId);
      if (!['REVIEWING', 'COST_REJECTED'].includes(request.status)) {
        throw invalidTransition(request.status, 'create-estimate');
      }
      if (!request.warrantyCheckResult) {
        throw new UnprocessableEntityException({
          code: 'WARRANTY_CHECK_REQUIRED',
          message: 'Record a warranty decision before creating an estimate',
        });
      }
      if (request.warrantyCheckResult === 'IN_WARRANTY') {
        throw new UnprocessableEntityException({
          code: 'ESTIMATE_NOT_REQUIRED',
          message: 'An estimate is not required for in-warranty requests',
        });
      }
      const liveEstimate = await tx.costEstimate.findFirst({
        where: {
          tenantId: scope.tenantId,
          requestId: request.id,
          status: { in: ['DRAFT', 'SENT', 'APPROVED'] },
        },
        select: { id: true },
      });
      if (liveEstimate) {
        throw new ConflictException({
          code: 'LIVE_ESTIMATE_EXISTS',
          message: 'A live estimate already exists for this service request',
        });
      }
      const latest = await tx.costEstimate.findFirst({
        where: { tenantId: scope.tenantId, requestId: request.id },
        orderBy: { revisionNo: 'desc' },
        select: { revisionNo: true },
      });
      return tx.costEstimate.create({
        data: {
          tenantId: scope.tenantId,
          requestId: request.id,
          revisionNo: (latest?.revisionNo ?? 0) + 1,
          currency: input.currency ?? 'VND',
          totalAmount: values.total,
          validUntil: this.dateOnly(input.validUntil),
          notes: input.notes ?? null,
          createdBy: principal.userId,
          items: {
            create: values.items,
          },
        },
        include: { items: true },
      });
    });
    return publicEstimate(estimate);
  }

  async updateEstimate(
    principal: Principal,
    estimateId: string,
    input: CostEstimateInputDto,
  ) {
    const scope = dataScope(principal);
    const values = this.validateEstimateInput(input);
    const estimate = await this.prisma.$transaction(async (tx) => {
      const current = await this.lockEstimate(tx, scope, estimateId);
      if (current.status !== 'DRAFT') {
        throw invalidTransition(current.status, 'edit-estimate');
      }
      await tx.costEstimateItem.deleteMany({
        where: { tenantId: scope.tenantId, estimateId: current.id },
      });
      return tx.costEstimate.update({
        where: { id: current.id },
        data: {
          currency: input.currency ?? 'VND',
          validUntil: this.dateOnly(input.validUntil),
          notes: input.notes ?? null,
          totalAmount: values.total,
          items: { create: values.items },
        },
        include: { items: true },
      });
    });
    return publicEstimate(estimate);
  }

  async deleteEstimate(
    principal: Principal,
    estimateId: string,
  ): Promise<void> {
    const scope = dataScope(principal);
    await this.prisma.$transaction(async (tx) => {
      const current = await this.lockEstimate(tx, scope, estimateId);
      if (current.status !== 'DRAFT') {
        throw invalidTransition(current.status, 'delete-estimate');
      }
      await tx.costEstimate.delete({ where: { id: current.id } });
    });
  }

  async sendEstimate(principal: Principal, estimateId: string) {
    const scope = dataScope(principal);
    const updated = await this.prisma.$transaction(async (tx) => {
      const current = await this.lockEstimate(tx, scope, estimateId);
      if (current.status !== 'DRAFT') {
        throw invalidTransition(current.status, 'send-estimate');
      }
      const request = await tx.serviceRequest.findFirstOrThrow({
        where: { id: current.requestId, tenantId: scope.tenantId },
      });
      if (!['REVIEWING', 'COST_REJECTED'].includes(request.status)) {
        throw invalidTransition(request.status, 'send-estimate');
      }
      if (!request.warrantyCheckResult) {
        throw new UnprocessableEntityException({
          code: 'WARRANTY_CHECK_REQUIRED',
          message: 'Record a warranty decision before sending an estimate',
        });
      }
      if (request.warrantyCheckResult === 'IN_WARRANTY') {
        throw new UnprocessableEntityException({
          code: 'ESTIMATE_NOT_REQUIRED',
          message: 'An estimate is not required for in-warranty requests',
        });
      }
      if (current.items.length === 0) {
        throw new UnprocessableEntityException({
          code: 'ESTIMATE_ITEMS_REQUIRED',
          message: 'An estimate must contain at least one item',
        });
      }
      if (
        current.validUntil &&
        current.validUntil.toISOString().slice(0, 10) < this.todayInVietnam()
      ) {
        throw new UnprocessableEntityException({
          code: 'ESTIMATE_VALID_UNTIL_PAST',
          message: 'An estimate cannot be sent after its validity date',
        });
      }

      await tx.costEstimate.update({
        where: { id: current.id },
        data: { status: 'SENT' },
      });
      const requestAfterSend = await tx.serviceRequest.update({
        where: { id: request.id },
        data: { status: 'AWAITING_CUSTOMER_APPROVAL' },
      });
      await this.recordEstimateRequestTransition(
        tx,
        requestAfterSend,
        request.status as RequestStatus,
        'AWAITING_CUSTOMER_APPROVAL',
        principal.userId,
      );
      return tx.costEstimate.findUniqueOrThrow({
        where: { id: current.id },
        include: { items: true },
      });
    });
    return publicEstimate(updated);
  }

  async reviseEstimate(principal: Principal, estimateId: string) {
    const scope = dataScope(principal);
    const result = await this.prisma.$transaction(async (tx) => {
      const current = await this.lockEstimate(tx, scope, estimateId);
      if (current.status !== 'SENT') {
        throw invalidTransition(current.status, 'revise-estimate');
      }
      if (await this.expireLockedEstimate(tx, current)) {
        return { expired: true as const };
      }
      const request = await tx.serviceRequest.findFirstOrThrow({
        where: { id: current.requestId, tenantId: scope.tenantId },
      });
      if (request.status !== 'AWAITING_CUSTOMER_APPROVAL') {
        throw invalidTransition(request.status, 'revise-estimate');
      }
      await tx.costEstimate.update({
        where: { id: current.id },
        data: { status: 'SUPERSEDED' },
      });
      const draft = await tx.costEstimate.create({
        data: {
          tenantId: current.tenantId,
          requestId: current.requestId,
          revisionNo: current.revisionNo + 1,
          currency: current.currency,
          totalAmount: current.totalAmount,
          validUntil: current.validUntil,
          notes: current.notes,
          createdBy: principal.userId,
          items: {
            create: current.items.map((item) => ({
              itemType: item.itemType,
              description: item.description,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
            })),
          },
        },
        include: { items: true },
      });
      const requestAfterRevise = await tx.serviceRequest.update({
        where: { id: request.id },
        data: { status: 'REVIEWING' },
      });
      await this.recordEstimateRequestTransition(
        tx,
        requestAfterRevise,
        'AWAITING_CUSTOMER_APPROVAL',
        'REVIEWING',
        principal.userId,
      );
      return { expired: false as const, estimate: draft };
    });
    return this.estimateAfterExpirationCheck(result);
  }

  async approveEstimate(principal: Principal, estimateId: string) {
    const scope = dataScope(principal);
    const result = await this.prisma.$transaction(async (tx) => {
      const current = await this.lockEstimate(tx, scope, estimateId);
      if (current.status !== 'SENT') {
        throw invalidTransition(current.status, 'approve-estimate');
      }
      if (await this.expireLockedEstimate(tx, current)) {
        return { expired: true as const };
      }
      const request = await tx.serviceRequest.findFirstOrThrow({
        where: { id: current.requestId, tenantId: scope.tenantId },
      });
      if (
        request.status !== 'AWAITING_CUSTOMER_APPROVAL' ||
        request.warrantyCheckResult === 'IN_WARRANTY'
      ) {
        throw invalidTransition(request.status, 'approve-estimate');
      }
      await tx.costEstimate.update({
        where: { id: current.id },
        data: {
          status: 'APPROVED',
          respondedBy: principal.userId,
          respondedAt: new Date(),
        },
      });
      const requestAfterApprove = await tx.serviceRequest.update({
        where: { id: request.id },
        data: { status: 'ACCEPTED' },
      });
      await this.recordEstimateRequestTransition(
        tx,
        requestAfterApprove,
        'AWAITING_CUSTOMER_APPROVAL',
        'ACCEPTED',
        principal.userId,
      );
      return {
        expired: false as const,
        estimate: await tx.costEstimate.findUniqueOrThrow({
          where: { id: current.id },
          include: { items: true },
        }),
      };
    });
    return this.estimateAfterExpirationCheck(result);
  }

  async rejectEstimate(
    principal: Principal,
    estimateId: string,
    input: OptionalReasonDto,
  ) {
    const scope = dataScope(principal);
    const result = await this.prisma.$transaction(async (tx) => {
      const current = await this.lockEstimate(tx, scope, estimateId);
      if (current.status !== 'SENT') {
        throw invalidTransition(current.status, 'reject-estimate');
      }
      if (await this.expireLockedEstimate(tx, current)) {
        return { expired: true as const };
      }
      const request = await tx.serviceRequest.findFirstOrThrow({
        where: { id: current.requestId, tenantId: scope.tenantId },
      });
      if (request.status !== 'AWAITING_CUSTOMER_APPROVAL') {
        throw invalidTransition(request.status, 'reject-estimate');
      }
      await tx.costEstimate.update({
        where: { id: current.id },
        data: {
          status: 'REJECTED',
          respondedBy: principal.userId,
          respondedAt: new Date(),
        },
      });
      const requestAfterReject = await tx.serviceRequest.update({
        where: { id: request.id },
        data: { status: 'COST_REJECTED' },
      });
      if (input.reason) {
        await tx.requestComment.create({
          data: {
            tenantId: scope.tenantId,
            requestId: request.id,
            authorUserId: principal.userId,
            visibility: 'CUSTOMER',
            content: input.reason,
          },
        });
      }
      await this.recordEstimateRequestTransition(
        tx,
        requestAfterReject,
        'AWAITING_CUSTOMER_APPROVAL',
        'COST_REJECTED',
        principal.userId,
        input.reason ?? null,
      );
      return {
        expired: false as const,
        estimate: await tx.costEstimate.findUniqueOrThrow({
          where: { id: current.id },
          include: { items: true },
        }),
      };
    });
    return this.estimateAfterExpirationCheck(result);
  }

  private estimateAfterExpirationCheck(
    result: { expired: true } | { expired: false; estimate: EstimateWithItems },
  ) {
    // Throw only after the transaction committed the EXPIRED status.
    if (result.expired) {
      throw new ConflictException({
        code: 'ESTIMATE_EXPIRED',
        message: 'This estimate has expired',
      });
    }
    return publicEstimate(result.estimate);
  }

  private async expireLockedEstimate(
    tx: Tx,
    estimate: EstimateWithItems,
  ): Promise<boolean> {
    if (
      !estimate.validUntil ||
      estimate.validUntil.toISOString().slice(0, 10) >= this.todayInVietnam()
    ) {
      return false;
    }
    await tx.costEstimate.update({
      where: { id: estimate.id },
      data: { status: 'EXPIRED' },
    });
    return true;
  }

  private async lockEstimate(
    tx: Tx,
    scope: ReturnType<typeof dataScope>,
    estimateId: string,
  ): Promise<EstimateWithItems> {
    const reference = await tx.costEstimate.findFirst({
      where: {
        id: estimateId,
        tenantId: scope.tenantId,
        ...(scope.customerId ? { status: { not: 'DRAFT' } } : {}),
      },
      select: { requestId: true },
    });
    if (!reference) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Resource not found',
      });
    }
    await this.lockRequest(tx, scope, reference.requestId);
    await tx.$queryRawUnsafe(
      `SELECT id FROM cost_estimates
       WHERE id = $1::uuid AND tenant_id = $2::uuid
       FOR UPDATE`,
      estimateId,
      scope.tenantId,
    );
    const estimate = await tx.costEstimate.findFirst({
      where: {
        id: estimateId,
        tenantId: scope.tenantId,
        requestId: reference.requestId,
        ...(scope.customerId ? { status: { not: 'DRAFT' } } : {}),
      },
      include: { items: true },
    });
    if (!estimate) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Resource not found',
      });
    }
    return estimate;
  }

  private validateEstimateInput(input: CostEstimateInputDto): {
    total: Prisma.Decimal;
    items: {
      itemType: string;
      description: string;
      quantity: Prisma.Decimal;
      unitPrice: Prisma.Decimal;
    }[];
  } {
    const items = input.items.map((item) => {
      if (!/^\d{1,10}(?:\.\d{1,2})?$/.test(item.quantity)) {
        throw new BadRequestException({
          code: 'INVALID_ESTIMATE_QUANTITY',
          message: 'Quantity must fit NUMERIC(12,2)',
        });
      }
      if (!/^\d{1,12}(?:\.\d{1,2})?$/.test(item.unitPrice)) {
        throw new BadRequestException({
          code: 'INVALID_ESTIMATE_UNIT_PRICE',
          message: 'Unit price must fit NUMERIC(14,2)',
        });
      }
      const quantity = new Prisma.Decimal(item.quantity);
      const unitPrice = new Prisma.Decimal(item.unitPrice);
      if (!quantity.greaterThan(0)) {
        throw new BadRequestException({
          code: 'INVALID_ESTIMATE_QUANTITY',
          message: 'Quantity must be greater than zero',
        });
      }
      const amount = quantity
        .mul(unitPrice)
        .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
      if (amount.greaterThan(MONEY_LIMIT)) {
        throw new BadRequestException({
          code: 'ESTIMATE_AMOUNT_OVERFLOW',
          message: 'Estimate item amount exceeds the supported range',
        });
      }
      return {
        itemType: item.itemType,
        description: item.description,
        quantity,
        unitPrice,
        amount,
      };
    });
    const total = items.reduce(
      (sum, item) => sum.plus(item.amount),
      new Prisma.Decimal(0),
    );
    if (total.greaterThan(MONEY_LIMIT)) {
      throw new BadRequestException({
        code: 'ESTIMATE_TOTAL_OVERFLOW',
        message: 'Estimate total exceeds the supported range',
      });
    }
    if (input.validUntil !== undefined && !this.isDateOnly(input.validUntil)) {
      throw new BadRequestException({
        code: 'INVALID_VALID_UNTIL',
        message: 'validUntil must be a valid YYYY-MM-DD date',
      });
    }
    if (input.currency !== undefined && !/^[A-Za-z]{3}$/.test(input.currency)) {
      throw new BadRequestException({
        code: 'INVALID_ESTIMATE_CURRENCY',
        message: 'Currency must be a three-letter code',
      });
    }
    return {
      total,
      items: items.map(({ itemType, description, quantity, unitPrice }) => ({
        itemType,
        description,
        quantity,
        unitPrice,
      })),
    };
  }

  private dateOnly(value: string | undefined): Date | null {
    if (value === undefined) return null;
    if (!this.isDateOnly(value)) {
      throw new BadRequestException({
        code: 'INVALID_VALID_UNTIL',
        message: 'validUntil must be a valid YYYY-MM-DD date',
      });
    }
    return new Date(`${value}T00:00:00.000Z`);
  }

  private todayInVietnam(): string {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Ho_Chi_Minh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());
    const values = Object.fromEntries(
      parts.map(({ type, value }) => [type, value]),
    );
    return `${values.year}-${values.month}-${values.day}`;
  }

  private async expireEstimateIfDue(
    principal: Principal,
    requestId: string,
  ): Promise<boolean> {
    const scope = dataScope(principal);
    const candidate = await this.prisma.costEstimate.findFirst({
      where: {
        tenantId: scope.tenantId,
        requestId,
        status: 'SENT',
      },
      select: { id: true, validUntil: true },
    });
    if (
      !candidate?.validUntil ||
      candidate.validUntil.toISOString().slice(0, 10) >= this.todayInVietnam()
    ) {
      return false;
    }
    return this.prisma.$transaction(async (tx) => {
      const request = await this.lockRequest(tx, scope, requestId);
      const sentEstimate = await tx.costEstimate.findFirst({
        where: {
          tenantId: scope.tenantId,
          requestId: request.id,
          id: candidate.id,
          status: 'SENT',
        },
      });
      if (
        sentEstimate?.validUntil &&
        sentEstimate.validUntil.toISOString().slice(0, 10) <
          this.todayInVietnam()
      ) {
        await tx.costEstimate.update({
          where: { id: sentEstimate.id },
          data: { status: 'EXPIRED' },
        });
        return true;
      }
      return false;
    });
  }

  private async recordEstimateRequestTransition(
    tx: Tx,
    request: ServiceRequest,
    fromStatus: RequestStatus,
    toStatus: RequestStatus,
    changedBy: string,
    reason: string | null = null,
  ): Promise<void> {
    await tx.requestStatusHistory.create({
      data: {
        tenantId: request.tenantId,
        requestId: request.id,
        oldStatus: fromStatus,
        newStatus: toStatus,
        changedBy,
        reason,
      },
    });
    await this.enqueueStatusChanged(
      tx,
      request,
      fromStatus,
      toStatus,
      changedBy,
      reason,
    );
  }

  async update(
    principal: Principal,
    requestId: string,
    input: UpdateServiceRequestDto,
  ) {
    if (!input.title && input.description === undefined && !input.priority) {
      throw new BadRequestException({
        code: 'EMPTY_UPDATE',
        message: 'At least one field must be provided',
      });
    }
    const scope = dataScope(principal);
    const updated = await this.prisma.$transaction(async (tx) => {
      const request = await this.lockRequest(tx, scope, requestId);
      if (!['NEW', 'AWAITING_INFO'].includes(request.status)) {
        throw invalidTransition(request.status, 'edit');
      }
      return tx.serviceRequest.update({
        where: { id: request.id },
        data: {
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.description !== undefined
            ? { description: input.description }
            : {}),
          ...(input.priority ? { priority: input.priority } : {}),
        },
      });
    });
    return publicRequest(updated);
  }

  async history(principal: Principal, requestId: string) {
    const request = await this.findRequest(principal, requestId);
    const canReadInternal =
      principal.userType !== 'CUSTOMER' &&
      hasPermission(principal, 'service_request:comment_internal');
    const [statusChanges, comments] = await Promise.all([
      this.prisma.requestStatusHistory.findMany({
        where: { tenantId: request.tenantId, requestId: request.id },
        orderBy: [{ changedAt: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          oldStatus: true,
          newStatus: true,
          changedBy: true,
          reason: true,
          changedAt: true,
        },
      }),
      this.prisma.requestComment.findMany({
        where: {
          tenantId: request.tenantId,
          requestId: request.id,
          ...(!canReadInternal ? { visibility: 'CUSTOMER' } : {}),
        },
        select: {
          id: true,
          authorUserId: true,
          visibility: true,
          content: true,
          createdAt: true,
        },
      }),
    ]);
    return [
      ...statusChanges.map((change) => ({
        kind: 'STATUS_CHANGED' as const,
        ...change,
      })),
      ...comments.map((comment) => ({
        kind: 'COMMENT_ADDED' as const,
        id: comment.id,
        authorUserId: comment.authorUserId,
        visibility: comment.visibility,
        content: comment.content,
        occurredAt: comment.createdAt,
      })),
    ].sort((a, b) => {
      const timeDifference =
        ('changedAt' in a ? a.changedAt : a.occurredAt).getTime() -
        ('changedAt' in b ? b.changedAt : b.occurredAt).getTime();
      return timeDifference || a.id.localeCompare(b.id);
    });
  }

  async review(principal: Principal, requestId: string) {
    const scope = dataScope(principal);
    const initial = await this.findRequest(principal, requestId);
    if (initial.status !== 'NEW') {
      throw invalidTransition(initial.status, 'review');
    }
    const warranty = await this.assets.getWarrantyStatus(
      initial.equipmentId,
      principal.accessToken,
    );
    if (!warranty) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Resource not found',
      });
    }
    this.validateWarrantyStatus(warranty, initial.equipmentId);

    const updated = await this.prisma.$transaction(async (tx) => {
      const current = await this.lockRequest(tx, scope, requestId);
      if (current.status !== 'NEW') {
        throw invalidTransition(current.status, 'review');
      }
      const checkedAt = new Date();
      const reviewing = await tx.serviceRequest.update({
        where: { id: current.id },
        data: {
          status: 'REVIEWING',
          reviewStartedAt: checkedAt,
          warrantyCheckResult: warranty.result,
          warrantyId: warranty.warrantyId,
          warrantyEndDate: warranty.endDate
            ? new Date(`${warranty.endDate}T00:00:00.000Z`)
            : null,
          warrantyCheckedBy: principal.userId,
          warrantyCheckedAt: checkedAt,
        },
      });
      await tx.requestStatusHistory.create({
        data: {
          tenantId: scope.tenantId,
          requestId: current.id,
          oldStatus: 'NEW',
          newStatus: 'REVIEWING',
          changedBy: principal.userId,
        },
      });
      await this.enqueueStatusChanged(
        tx,
        reviewing,
        'NEW',
        'REVIEWING',
        principal.userId,
        null,
      );
      return reviewing;
    });
    return {
      ...publicRequest(updated),
      warrantyCheck: {
        result: updated.warrantyCheckResult,
        warrantyId: updated.warrantyId,
        warrantyEndDate:
          updated.warrantyEndDate?.toISOString().slice(0, 10) ?? null,
        checkedBy: updated.warrantyCheckedBy,
        checkedAt: updated.warrantyCheckedAt,
      },
      allowedActions: allowedActions(updated, principal),
    };
  }

  async internalReference(principal: Principal, requestId: string) {
    const request = await this.findRequest(principal, requestId);
    return {
      id: request.id,
      requestNo: request.requestNo,
      status: request.status,
      title: request.title,
      customerId: request.customerId,
      equipmentId: request.equipmentId,
      type: request.type,
      priority: request.priority,
    };
  }

  async requestInfo(principal: Principal, requestId: string, reason: string) {
    return this.transition(
      principal,
      requestId,
      'request-info',
      ['REVIEWING'],
      'AWAITING_INFO',
      {},
      reason,
    );
  }

  async warrantyCheck(principal: Principal, requestId: string) {
    const scope = dataScope(principal);
    const current = await this.findRequest(principal, requestId);
    if (current.status !== 'REVIEWING') {
      throw invalidTransition(current.status, 'warranty-check');
    }
    const warranty = await this.assets.getWarrantyStatus(
      current.equipmentId,
      principal.accessToken,
    );
    if (!warranty) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Resource not found',
      });
    }
    this.validateWarrantyStatus(warranty, current.equipmentId);
    const updated = await this.prisma.$transaction(async (tx) => {
      const locked = await this.lockRequest(tx, scope, requestId);
      if (locked.status !== 'REVIEWING') {
        throw invalidTransition(locked.status, 'warranty-check');
      }
      return tx.serviceRequest.update({
        where: { id: locked.id },
        data: {
          warrantyCheckResult: warranty.result,
          warrantyId: warranty.warrantyId,
          warrantyEndDate: warranty.endDate
            ? new Date(`${warranty.endDate}T00:00:00.000Z`)
            : null,
          warrantyCheckedBy: principal.userId,
          warrantyCheckedAt: new Date(),
        },
      });
    });
    return {
      ...publicRequest(updated),
      warrantyCheck: {
        result: updated.warrantyCheckResult,
        warrantyId: updated.warrantyId,
        warrantyEndDate:
          updated.warrantyEndDate?.toISOString().slice(0, 10) ?? null,
        checkedBy: updated.warrantyCheckedBy,
        checkedAt: updated.warrantyCheckedAt,
      },
      allowedActions: allowedActions(updated, principal),
    };
  }

  async accept(principal: Principal, requestId: string) {
    return this.transition(
      principal,
      requestId,
      'accept',
      ['REVIEWING'],
      'ACCEPTED',
      {},
      null,
      (request) => {
        if (!request.warrantyCheckResult) {
          throw new UnprocessableEntityException({
            code: 'WARRANTY_CHECK_REQUIRED',
            message: 'Record a warranty check before accepting the request',
          });
        }
        if (request.warrantyCheckResult !== 'IN_WARRANTY') {
          throw new UnprocessableEntityException({
            code: 'ESTIMATE_REQUIRED',
            message:
              'Out-of-warranty requests require an approved cost estimate',
          });
        }
      },
    );
  }

  async reject(principal: Principal, requestId: string, reason: string) {
    return this.transition(
      principal,
      requestId,
      'reject',
      REJECT_STATUSES,
      'REJECTED',
      {},
      reason,
    );
  }

  async cancel(principal: Principal, requestId: string, reason?: string) {
    const isCustomer = principal.userType === 'CUSTOMER';
    const canReview = hasPermission(principal, 'service_request:review');
    if (!isCustomer && !canReview) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Missing permission',
      });
    }
    const statuses = isCustomer
      ? CUSTOMER_CANCEL_STATUSES
      : STAFF_CANCEL_STATUSES;
    return this.transition(
      principal,
      requestId,
      'cancel',
      statuses,
      'CANCELLED',
      {},
      reason,
    );
  }

  async confirm(principal: Principal, requestId: string) {
    this.assertRequesterOrReviewer(principal);
    const data = {
      confirmedBy: principal.userId,
      confirmedAt: new Date(),
      closedAt: new Date(),
    };
    return this.transition(
      principal,
      requestId,
      'confirm',
      ['RESOLVED'],
      'CLOSED',
      data,
    );
  }

  async reopen(principal: Principal, requestId: string, reason: string) {
    this.assertRequesterOrReviewer(principal);
    return this.transition(
      principal,
      requestId,
      'reopen',
      ['RESOLVED'],
      'ACCEPTED',
      {},
      reason,
    );
  }

  async comments(principal: Principal, requestId: string) {
    const request = await this.findRequest(principal, requestId);
    const canReadInternal =
      principal.userType !== 'CUSTOMER' &&
      hasPermission(principal, 'service_request:comment_internal');
    return this.prisma.requestComment.findMany({
      where: {
        tenantId: request.tenantId,
        requestId: request.id,
        ...(!canReadInternal ? { visibility: 'CUSTOMER' } : {}),
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        authorUserId: true,
        visibility: true,
        content: true,
        createdAt: true,
      },
    });
  }

  async addComment(
    principal: Principal,
    requestId: string,
    input: AddCommentDto,
  ) {
    const isCustomer = principal.userType === 'CUSTOMER';
    const visibility: CommentVisibility = isCustomer
      ? 'CUSTOMER'
      : (input.visibility ?? 'INTERNAL');
    if (
      visibility === 'INTERNAL' &&
      !hasPermission(principal, 'service_request:comment_internal')
    ) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Missing permission to write internal comments',
      });
    }
    const scope = dataScope(principal);
    return this.prisma.$transaction(async (tx) => {
      const request = await this.lockRequest(tx, scope, requestId);
      const comment = await tx.requestComment.create({
        data: {
          tenantId: scope.tenantId,
          requestId: request.id,
          authorUserId: principal.userId,
          visibility,
          content: input.content,
        },
        select: {
          id: true,
          authorUserId: true,
          visibility: true,
          content: true,
          createdAt: true,
        },
      });
      if (
        request.status === 'AWAITING_INFO' &&
        visibility === 'CUSTOMER' &&
        (isCustomer || hasPermission(principal, 'service_request:review'))
      ) {
        const updated = await tx.serviceRequest.update({
          where: { id: request.id },
          data: { status: 'REVIEWING' },
        });
        await tx.requestStatusHistory.create({
          data: {
            tenantId: scope.tenantId,
            requestId: request.id,
            oldStatus: 'AWAITING_INFO',
            newStatus: 'REVIEWING',
            changedBy: principal.userId,
          },
        });
        await this.enqueueStatusChanged(
          tx,
          updated,
          'AWAITING_INFO',
          'REVIEWING',
          principal.userId,
          null,
        );
      }
      return comment;
    });
  }

  private async transition(
    principal: Principal,
    requestId: string,
    action: string,
    fromStatuses: readonly RequestStatus[],
    toStatus: RequestStatus,
    extraData: Prisma.ServiceRequestUpdateInput = {},
    reason: string | null = null,
    validate?: (request: ServiceRequest) => void,
  ) {
    const scope = dataScope(principal);
    return this.prisma.$transaction(async (tx) => {
      const current = await this.lockRequest(tx, scope, requestId);
      if (action === 'cancel' && current.status === 'PROCESSING') {
        throw new ConflictException({
          code: 'WORK_ORDER_CANCELLATION_REQUIRED',
          message:
            'Cancel the active work order before cancelling this service request',
        });
      }
      if (!fromStatuses.includes(current.status as RequestStatus)) {
        throw invalidTransition(current.status, action);
      }
      validate?.(current);

      const updated = await tx.serviceRequest.update({
        where: { id: current.id },
        data: { ...extraData, status: toStatus },
      });
      if (reason && ['request-info', 'reject', 'reopen'].includes(action)) {
        await tx.requestComment.create({
          data: {
            tenantId: scope.tenantId,
            requestId: current.id,
            authorUserId: principal.userId,
            visibility: 'CUSTOMER',
            content: reason,
          },
        });
      }
      await tx.requestStatusHistory.create({
        data: {
          tenantId: scope.tenantId,
          requestId: current.id,
          oldStatus: current.status,
          newStatus: toStatus,
          changedBy: principal.userId,
          reason,
        },
      });
      await this.enqueueStatusChanged(
        tx,
        updated,
        current.status as RequestStatus,
        toStatus,
        principal.userId,
        reason,
      );
      return publicRequest(updated);
    });
  }

  private async findRequest(
    principal: Principal,
    requestId: string,
  ): Promise<ServiceRequest> {
    const scope = dataScope(principal);
    const request = await this.prisma.serviceRequest.findFirst({
      where: {
        id: requestId,
        tenantId: scope.tenantId,
        ...(scope.customerId ? { customerId: scope.customerId } : {}),
      },
    });
    return assertInScope(scope, request);
  }

  private async lockRequest(
    tx: Tx,
    scope: ReturnType<typeof dataScope>,
    requestId: string,
  ): Promise<ServiceRequest> {
    await tx.$queryRawUnsafe(
      `SELECT id FROM service_requests
       WHERE id = $1::uuid AND tenant_id = $2::uuid
       ${scope.customerId ? 'AND customer_id = $3::uuid' : ''}
       FOR UPDATE`,
      ...(scope.customerId
        ? [requestId, scope.tenantId, scope.customerId]
        : [requestId, scope.tenantId]),
    );
    const request = await tx.serviceRequest.findFirst({
      where: {
        id: requestId,
        tenantId: scope.tenantId,
        ...(scope.customerId ? { customerId: scope.customerId } : {}),
      },
    });
    return assertInScope(scope, request);
  }

  private async enqueueStatusChanged(
    tx: Tx,
    request: ServiceRequest,
    fromStatus: RequestStatus | null,
    toStatus: RequestStatus,
    changedBy: string | null,
    reason: string | null,
  ) {
    await enqueueEvent(tx, Events.ServiceRequestStatusChanged, {
      tenantId: request.tenantId,
      aggregateId: request.id,
      correlationId: getCorrelationId(),
      payload: {
        serviceRequestId: request.id,
        requestNo: request.requestNo,
        customerId: request.customerId,
        equipmentId: request.equipmentId,
        fromStatus,
        toStatus,
        changedBy,
        reason,
      },
    });
  }

  private orderBy(sort: ListServiceRequestsDto['sort']) {
    if (sort === 'priority' || sort === '-priority') {
      return [
        {
          priority: sort === 'priority' ? ('asc' as const) : ('desc' as const),
        },
        { createdAt: 'desc' as const },
      ];
    }
    return {
      createdAt: sort === 'createdAt' ? ('asc' as const) : ('desc' as const),
    };
  }

  private validateWarrantyStatus(
    warranty: WarrantyStatus,
    equipmentId: string,
  ): void {
    if (
      warranty.equipmentId !== equipmentId ||
      !this.isDateOnly(warranty.date) ||
      (warranty.endDate !== null && !this.isDateOnly(warranty.endDate)) ||
      !['IN_WARRANTY', 'OUT_OF_WARRANTY', 'NO_WARRANTY'].includes(
        warranty.result,
      ) ||
      (warranty.warrantyId !== null && !isUUID(warranty.warrantyId)) ||
      (warranty.result !== 'NO_WARRANTY' &&
        (!warranty.warrantyId || !warranty.endDate)) ||
      (warranty.result === 'NO_WARRANTY' &&
        (warranty.warrantyId !== null || warranty.endDate !== null))
    ) {
      throw new ConflictException({
        code: 'INVALID_UPSTREAM_RESPONSE',
        message: 'Asset Service returned an invalid warranty decision',
      });
    }
  }

  private isDateOnly(value: string): boolean {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00.000Z`);
    return (
      !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
    );
  }

  private assertRequesterOrReviewer(principal: Principal): void {
    if (
      principal.userType !== 'CUSTOMER' &&
      !hasPermission(principal, 'service_request:review')
    ) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Missing permission',
      });
    }
  }
}

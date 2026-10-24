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
  type ListServiceRequestsDto,
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
): string[] {
  const status = request.status as RequestStatus;
  const actions: string[] = [];
  const isCustomer = principal.userType === 'CUSTOMER';
  const canReview = hasPermission(principal, 'service_request:review');
  const canCreate = hasPermission(principal, 'service_request:create');
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
            warrantyEndDate: request.warrantyEndDate,
            checkedBy: request.warrantyCheckedBy,
            checkedAt: request.warrantyCheckedAt,
          }
        : null,
      liveEstimate: liveEstimate
        ? {
            id: liveEstimate.id,
            requestId: liveEstimate.requestId,
            revisionNo: liveEstimate.revisionNo,
            currency: liveEstimate.currency,
            totalAmount: liveEstimate.totalAmount,
            status: liveEstimate.status,
            validUntil: liveEstimate.validUntil,
            notes: liveEstimate.notes,
            createdBy: liveEstimate.createdBy,
            respondedBy: liveEstimate.respondedBy,
            respondedAt: liveEstimate.respondedAt,
            items: liveEstimate.items.map((item) => ({
              id: item.id,
              itemType: item.itemType,
              description: item.description,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              amount: item.amount,
            })),
          }
        : null,
      allowedActions: allowedActions(request, principal),
    };
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
        warrantyEndDate: updated.warrantyEndDate,
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
        warrantyEndDate: updated.warrantyEndDate,
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

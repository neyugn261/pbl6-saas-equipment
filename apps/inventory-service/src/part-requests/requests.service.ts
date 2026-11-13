import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import {
  assertBranchAccess,
  requireTenantId,
  staffBranchId,
  type Principal,
} from '@pbl6/auth';
import { isUUID } from 'class-validator';
import { InventoryRepository } from '../inventory/inventory.repository';
import { InventoryService } from '../inventory/inventory.service';
import {
  ReferencesClient,
  type WorkOrderReference,
} from '../inventory/references.client';
import {
  decimal,
  fingerprint,
  invalid,
  json,
  notFound,
} from '../inventory/policy';
import {
  InventoryRequestsRepository,
  partRequestView,
  returnRequestView,
  type RequestScope,
} from './requests.repository';
import {
  requireDecisionActor,
  requireRequestableWorkOrder,
  requireRequestCreator,
  wideRequestRead,
  type RequestAction,
} from './requests.policy';
import type {
  CreatePartRequestInput,
  CreateReturnRequestInput,
  FulfillmentInput,
  RequestDecisionInput,
  RequestQuery,
  ReturnReceiptInput,
} from './requests.dto';

@Injectable()
export class InventoryRequestsService {
  constructor(
    private readonly repo: InventoryRequestsRepository,
    private readonly inventoryRepo: InventoryRepository,
    private readonly inventory: InventoryService,
    private readonly refs: ReferencesClient,
  ) {}
  private scope(p: Principal): RequestScope {
    if (p.userType !== 'TENANT_STAFF')
      throw new ForbiddenException({
        code: 'STAFF_REQUIRED',
        message: 'Internal inventory requests require tenant staff',
      });
    const branchId = staffBranchId(p);
    return {
      tenantId: requireTenantId(p).toLowerCase(),
      ...(branchId ? { branchId: branchId.toLowerCase() } : {}),
    };
  }
  private command(p: Principal, key: string, kind: string, payload: unknown) {
    const scope = this.scope(p);
    if (typeof key !== 'string' || !isUUID(key))
      throw new BadRequestException({
        code: 'INVALID_IDEMPOTENCY_KEY',
        message: 'Idempotency-Key must be a UUID',
      });
    return {
      tenantId: scope.tenantId,
      actorId: p.userId.toLowerCase(),
      key: key.toLowerCase(),
      fingerprint: fingerprint(kind, {
        actorId: p.userId.toLowerCase(),
        payload,
      }),
    };
  }
  private async workOrder(p: Principal, id: string) {
    const wo = await this.refs.workOrderDetail(id, p);
    if (!wo || wo.id.toLowerCase() !== id) throw notFound();
    assertBranchAccess(p, wo.branchId);
    return wo;
  }
  private assigned(p: Principal, wo: WorkOrderReference) {
    return (
      wo.currentAssignment?.technicianUserId.toLowerCase() ===
        p.userId.toLowerCase() && wo.currentAssignment.status === 'ACCEPTED'
    );
  }
  async createPartRequest(
    p: Principal,
    key: string,
    workOrderId: string,
    input: CreatePartRequestInput,
  ) {
    requireRequestCreator(p);
    workOrderId = workOrderId.toLowerCase();
    const normalized = {
      reason: input.reason,
      lines: input.lines
        .map((line) => ({
          partId: line.partId.toLowerCase(),
          quantity: decimal(line.quantity, true).toFixed(2),
        }))
        .sort((a, b) => a.partId.localeCompare(b.partId)),
    };
    const ctx = this.command(p, key, 'CREATE_PART_REQUEST', {
      workOrderId,
      ...normalized,
    });
    const cached = await this.repo.cachedCommand(ctx);
    if (cached) {
      assertBranchAccess(p, cached.branchId as string);
      return cached;
    }
    const wo = await this.workOrder(p, workOrderId);
    requireRequestableWorkOrder(wo.status);
    if (!p.permissions.has('work_order:manage') && !this.assigned(p, wo))
      throw new ForbiddenException({
        code: 'ASSIGNED_TECHNICIAN_REQUIRED',
        message: 'Only the current accepted Technician may request these parts',
      });
    if (!wo.branchId || !wo.equipmentId || !wo.customerId || !wo.workOrderNo)
      throw invalid(
        'INVALID_WORK_ORDER_REFERENCE',
        'Work Order must supply branch, equipment, customer and business number',
      );
    return this.repo.createPartRequest(ctx, wo, normalized);
  }
  private async readablePart(p: Principal, id: string) {
    const row = await this.repo.partRequest(this.scope(p), id.toLowerCase());
    if (!wideRequestRead(p) && row.requestedBy !== p.userId.toLowerCase()) {
      if (!p.permissions.has('work_order:execute')) throw notFound();
      const wo = await this.workOrder(p, row.workOrderId);
      if (!this.assigned(p, wo)) throw notFound();
    }
    return row;
  }
  async partRequest(p: Principal, id: string) {
    const row = await this.readablePart(p, id);
    const view = partRequestView(row);
    const actions: string[] = [];
    if (row.status === 'OPEN' && !view.pendingRecovery) {
      if (p.permissions.has('inventory:issue')) actions.push('fulfill');
      if (
        p.permissions.has('inventory:issue') ||
        p.permissions.has('work_order:manage')
      )
        actions.push('close');
      if (view.fulfillmentStatus === 'NOT_ISSUED') {
        if (
          p.permissions.has('inventory:issue') ||
          p.permissions.has('work_order:manage')
        )
          actions.push('reject');
        if (
          p.permissions.has('work_order:manage') ||
          (p.permissions.has('work_order:execute') &&
            row.requestedBy === p.userId.toLowerCase())
        )
          actions.push('cancel');
      }
    }
    return json({
      ...view,
      allowedActions: actions,
      fulfillmentRequiresLiveWorkOrderValidation: true,
    });
  }
  async partRequests(p: Principal, q: RequestQuery) {
    const scope = this.scope(p);
    if (!wideRequestRead(p)) {
      scope.requestedBy = p.userId.toLowerCase();
      if (q.workOrderId && p.permissions.has('work_order:execute')) {
        const wo = await this.workOrder(p, q.workOrderId.toLowerCase());
        if (this.assigned(p, wo)) delete scope.requestedBy;
      }
    }
    return this.repo.partRequests(scope, q);
  }
  async fulfill(
    p: Principal,
    key: string,
    id: string,
    input: FulfillmentInput,
  ) {
    const row = await this.readablePart(p, id);
    const line = row.lines.find(
      (item) => item.id === input.lineId.toLowerCase(),
    );
    if (!line) throw notFound();
    return this.inventory.issue(
      p,
      key,
      row.workOrderId,
      {
        warehouseId: input.warehouseId,
        partId: line.partId,
        quantity: input.quantity,
        ...(input.note ? { note: input.note } : {}),
      },
      {
        partRequestId: row.id,
        partRequestLineId: line.id,
        requestVersion: input.expectedVersion,
        custodianUserId: input.custodianUserId.toLowerCase(),
        handoverReference: input.handoverReference,
      },
    );
  }
  async decidePart(
    p: Principal,
    id: string,
    action: RequestAction,
    input: RequestDecisionInput,
  ) {
    const row = await this.readablePart(p, id);
    requireDecisionActor(p, action, row.requestedBy);
    await this.repo.decidePartRequest(
      this.scope(p),
      p.userId.toLowerCase(),
      row.id,
      action,
      input,
    );
    return this.partRequest(p, row.id);
  }
  async createReturnRequest(
    p: Principal,
    key: string,
    usageId: string,
    input: CreateReturnRequestInput,
  ) {
    requireRequestCreator(p);
    usageId = usageId.toLowerCase();
    const scope = this.scope(p);
    const normalized = {
      ...input,
      quantity: decimal(input.quantity, true).toFixed(2),
    };
    const ctx = this.command(p, key, 'CREATE_RETURN_REQUEST', {
      usageId,
      ...normalized,
    });
    const cached = await this.repo.cachedCommand(ctx);
    if (cached) {
      assertBranchAccess(p, cached.branchId as string);
      return cached;
    }
    const usage = await this.inventoryRepo.usage(scope.tenantId, usageId);
    const warehouse = await this.inventoryRepo.warehouse(
      scope.tenantId,
      usage.warehouseId,
    );
    assertBranchAccess(p, warehouse.branchId);
    if (
      !p.permissions.has('work_order:manage') &&
      usage.custodianUserId !== p.userId.toLowerCase()
    )
      throw new ForbiddenException({
        code: 'ORIGINAL_CUSTODIAN_REQUIRED',
        message:
          'The original recorded recipient remains responsible for return after reassignment',
      });
    return this.repo.createReturnRequest(
      ctx,
      usageId,
      normalized,
      scope.branchId,
    );
  }
  private returnScope(p: Principal) {
    return {
      ...this.scope(p),
      ...(!wideRequestRead(p) ? { requestedBy: p.userId.toLowerCase() } : {}),
    };
  }
  async returnRequest(p: Principal, id: string) {
    const row = await this.repo.returnRequest(
      this.returnScope(p),
      id.toLowerCase(),
    );
    const view = returnRequestView(row);
    const actions: string[] = [];
    if (row.status === 'OPEN') {
      if (
        p.permissions.has('inventory:issue') &&
        view.quantityReceivableNow.gt(0)
      )
        actions.push('receive');
      if (
        p.permissions.has('inventory:issue') ||
        p.permissions.has('work_order:manage')
      )
        actions.push('close');
      if (
        view.quantityReceived.eq(0) &&
        (p.permissions.has('work_order:manage') ||
          (p.permissions.has('work_order:execute') &&
            row.custodianUserId === p.userId.toLowerCase()))
      )
        actions.push('cancel');
    }
    return json({ ...view, allowedActions: actions });
  }
  returnRequests(p: Principal, q: RequestQuery) {
    return this.repo.returnRequests(this.returnScope(p), q);
  }
  async receipt(
    p: Principal,
    key: string,
    id: string,
    input: ReturnReceiptInput,
  ) {
    const row = await this.repo.returnRequest(
      this.returnScope(p),
      id.toLowerCase(),
    );
    return this.inventory.returnPart(
      p,
      key,
      row.workOrderPartId,
      {
        quantity: input.quantity,
        condition: input.condition,
        note: input.note,
      },
      { returnRequestId: row.id, requestVersion: input.expectedVersion },
    );
  }
  async decideReturn(
    p: Principal,
    id: string,
    action: 'cancel' | 'close',
    input: RequestDecisionInput,
  ) {
    const row = await this.repo.returnRequest(
      this.returnScope(p),
      id.toLowerCase(),
    );
    requireDecisionActor(p, action, row.custodianUserId);
    await this.repo.decideReturnRequest(
      this.scope(p),
      p.userId.toLowerCase(),
      row.id,
      action,
      input,
    );
    return this.returnRequest(p, row.id);
  }
  async history(
    p: Principal,
    kind: 'PART_REQUEST' | 'RETURN_REQUEST',
    id: string,
    q: RequestQuery,
  ) {
    if (kind === 'PART_REQUEST') await this.readablePart(p, id);
    else await this.repo.returnRequest(this.returnScope(p), id.toLowerCase());
    return this.repo.history(this.scope(p).tenantId, kind, id.toLowerCase(), q);
  }
}

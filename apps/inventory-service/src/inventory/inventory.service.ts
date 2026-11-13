import { assertBranchAccess, staffBranchId } from '@pbl6/auth';
import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  Injectable,
  Optional,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { requireTenantId, type Principal } from '@pbl6/auth';
import { DisplayNameLookup, type Page } from '@pbl6/service-kit';
import { isUUID } from 'class-validator';
import type { InventoryOperation } from '../generated/prisma/client.js';
import {
  InventoryRepository,
  type Movement,
  type OperationContext,
  type OperationName,
  type RequestBusinessContext,
} from './inventory.repository';
import { ReferencesClient } from './references.client';
import {
  conflict,
  decimal,
  fingerprint,
  invalid,
  json,
  nonEmptyPatch,
  notFound,
} from './policy';
import type {
  AdjustInput,
  InventoryQuery,
  IssueInput,
  PartInput,
  PartPatch,
  ReturnInput,
  StockMutation,
  WarehouseInput,
  WarehousePatch,
  ConfirmUseInput,
  ReverseUseInput,
  InspectionInput,
  AuditQuery,
} from './dto';
import { requireRequestableWorkOrder } from '../part-requests/requests.policy';

type FulfillmentLink = Required<Pick<RequestBusinessContext, 'partRequestId' | 'partRequestLineId' | 'requestVersion' | 'custodianUserId' | 'handoverReference'>>;
type ReceiptLink = Required<Pick<RequestBusinessContext, 'returnRequestId' | 'requestVersion'>>;

@Injectable()
export class InventoryService {
  private readonly logger = new Logger(InventoryService.name);
  constructor(
    private readonly repo: InventoryRepository,
    private readonly refs: ReferencesClient,
    @Optional() private readonly names?: DisplayNameLookup,
  ) {}
  private tenant(p: Principal) {
    if (p.userType !== 'TENANT_STAFF')
      throw new ForbiddenException({
        code: 'STAFF_REQUIRED',
        message: 'Inventory is available to tenant staff only',
      });
    return requireTenantId(p).toLowerCase();
  }
  private async scopedWarehouse(p: Principal, id: string) {
    const warehouse = await this.repo.warehouse(this.tenant(p), id);
    assertBranchAccess(p, warehouse.branchId);
    return warehouse;
  }
  private async operationWarehouse(p: Principal, row: InventoryOperation) {
    const request = row.request as unknown as Movement;
    await this.scopedWarehouse(p, request.warehouseId);
  }
  private key(key: string) {
    if (typeof key !== 'string' || !isUUID(key))
      throw new BadRequestException({
        code: 'INVALID_IDEMPOTENCY_KEY',
        message: 'Idempotency-Key must be a UUID',
      });
    return key.toLowerCase();
  }
  private context(
    p: Principal,
    key: string,
    operation: OperationName,
    request: Movement,
  ): OperationContext {
    return {
      tenantId: this.tenant(p),
      actorId: p.userId,
      key: this.key(key),
      operation,
      request,
    };
  }
  private movement(input: StockMutation): Movement {
    return {
      warehouseId: input.warehouseId.toLowerCase(),
      partId: input.partId.toLowerCase(),
      quantity: decimal(input.quantity, true).toFixed(2),
      ...(input.note === undefined ? {} : { note: input.note }),
      ...(input.documentReference === undefined
        ? {}
        : { documentReference: input.documentReference }),
    };
  }
  parts(p: Principal, q: InventoryQuery) {
    return this.repo.parts(this.tenant(p), q);
  }
  async part(p: Principal, id: string) {
    return json(await this.repo.part(this.tenant(p), id));
  }
  async createPart(p: Principal, input: PartInput) {
    const aliases: Record<string, string> = {
      cái: 'cái',
      chiếc: 'cái',
      pc: 'cái',
      pcs: 'cái',
      piece: 'cái',
      pieces: 'cái',
      mét: 'm',
      meter: 'm',
      litre: 'l',
      liter: 'l',
      lít: 'l',
    };
    const unit = input.unit.trim().toLowerCase();
    const normalizedUnit = aliases[unit] ?? unit;
    if (
      input.allowFractional &&
      ['cái', 'bộ', 'hộp', 'chiếc'].includes(normalizedUnit)
    )
      throw invalid(
        'INVALID_FRACTIONAL_UNIT',
        'Countable units require whole quantities',
      );
    return json(
      await this.repo.createPart(
        this.tenant(p),
        { ...input, unit: normalizedUnit },
        p.userId,
      ),
    );
  }
  async updatePart(p: Principal, id: string, input: PartPatch) {
    nonEmptyPatch(input);
    return json(
      await this.repo.updatePart(this.tenant(p), id, input, p.userId),
    );
  }
  async warehouses(p: Principal, q: InventoryQuery) {
    const page = (await this.repo.warehouses(this.tenant(p), q,
      staffBranchId(p),
    )) as unknown as Page<Record<string, unknown> & { branchId: string }>;
    const branches = await this.names?.lookup('branches', page.items.map((row) => row.branchId), p,
    );
    return { ...page, items: page.items.map((row) => ({ ...row,
      branchName: branches?.get(row.branchId.toLowerCase())?.name ?? null,
      branchCode: branches?.get(row.branchId.toLowerCase())?.code ?? null,
      })),
    };
  }
  async warehouse(p: Principal, id: string) {
    return json(await this.scopedWarehouse(p, id));
  }
  private async activeBranch(id: string, p: Principal) {
    assertBranchAccess(p, id);
    const branch = await this.refs.branch(id, p);
    if (
      !branch ||
      branch.id.toLowerCase() !== id.toLowerCase() ||
      branch.status !== 'ACTIVE'
    )
      throw invalid(
        'INVALID_BRANCH',
        'Branch must exist in this tenant and be ACTIVE',
      );
  }
  async createWarehouse(p: Principal, input: WarehouseInput) {
    const tenantId = this.tenant(p);
    await this.activeBranch(input.branchId, p);
    return json(
      await this.repo.createWarehouse(
        tenantId,
        {
          ...input,
          branchId: input.branchId.toLowerCase(),
        },
        p.userId,
      ),
    );
  }
  async updateWarehouse(p: Principal, id: string, input: WarehousePatch) {
    nonEmptyPatch(input);
    const tenantId = this.tenant(p);
    const existing = await this.scopedWarehouse(p, id);
    if (input.status === 'ACTIVE')
      await this.activeBranch(existing.branchId, p);
    return json(await this.repo.updateWarehouse(tenantId, id, input, p.userId));
  }
  stocks(p: Principal, q: InventoryQuery) {
    return this.repo.stocks(this.tenant(p), q, staffBranchId(p));
  }
  ledger(p: Principal, q: InventoryQuery) {
    return this.repo.ledger(this.tenant(p), q, staffBranchId(p));
  }
  async threshold(
    p: Principal,
    warehouseId: string,
    partId: string,
    minimum: string,
  ) {
    await this.scopedWarehouse(p, warehouseId);
    return this.repo.threshold(
      this.tenant(p),
      warehouseId,
      partId,
      decimal(minimum).toFixed(2),
      p.userId,
    );
  }
  async receive(p: Principal, key: string, input: StockMutation) {
    await this.scopedWarehouse(p, input.warehouseId);
    if (!input.documentReference?.trim() && !input.note?.trim())
      throw new BadRequestException({
        code: 'RECEIPT_REFERENCE_REQUIRED',
        message: 'A receipt needs a document reference or explanatory note',
      });
    return (
      await this.repo.transact(
        this.context(p, key, 'RECEIVE', this.movement(input)),
      )
    ).response;
  }
  async adjust(p: Principal, key: string, input: AdjustInput) {
    await this.scopedWarehouse(p, input.warehouseId);
    if (!input.note?.trim())
      throw new BadRequestException({
        code: 'ADJUSTMENT_REASON_REQUIRED',
        message: 'Adjustment requires a reason',
      });
    if (
      (input.reasonCode === 'CORRECTION') !==
      Boolean(input.relatedTransactionId)
    )
      throw invalid(
        'CORRECTION_REFERENCE_REQUIRED',
        'Only CORRECTION must reference an original transaction',
      );
    return (
      await this.repo.transact(
        this.context(p, key, 'ADJUST', {
          ...this.movement(input),
          direction: input.direction,
          reasonCode: input.reasonCode,
          ...(input.relatedTransactionId
            ? { relatedTransactionId: input.relatedTransactionId.toLowerCase() }
            : {}),
        }),
      )
    ).response;
  }
  private async scopedWorkOrder(id: string, p: Principal) {
    const wo = await this.refs.workOrder(id, p);
    if (!wo || wo.id.toLowerCase() !== id.toLowerCase()) throw notFound();
    return wo;
  }
  async usages(p: Principal, workOrderId: string) {
    const tenantId = this.tenant(p);
    await this.scopedWorkOrder(workOrderId, p);
    return this.repo.usages(tenantId, workOrderId, staffBranchId(p));
  }
  async returnPart(p: Principal, key: string, id: string, input: ReturnInput, link?: ReceiptLink) {
    const tenantId = this.tenant(p);
    const usage = await this.repo.usage(tenantId, id);
    await this.scopedWarehouse(p, usage.warehouseId);
    const ctx = this.context(p, key, 'RETURN', {
      warehouseId: usage.warehouseId,
      partId: usage.partId,
      workOrderId: usage.workOrderId,
      workOrderPartId: usage.id,
      quantity: decimal(input.quantity, true).toFixed(2),
      note: input.note,
      condition: input.condition,
    });
    ctx.businessContext = link;
    // Successful retry remains available during an upstream outage; permission
    // is checked afresh by the controller. An uncached return validates scoped WO.
    const cached = await this.repo.cached(ctx);
    if (!cached) await this.scopedWorkOrder(usage.workOrderId, p);
    return (await this.repo.transact(ctx)).response;
  }
  auditHistory(p: Principal, q: AuditQuery) {
    return this.repo.auditHistory(this.tenant(p), q, staffBranchId(p));
  }
  async inspect(p: Principal, key: string, id: string, input: InspectionInput) {
    const original = await this.repo.transaction(this.tenant(p), id);
    await this.scopedWarehouse(p, original.warehouseId);
    const ctx = this.context(p, key, 'INSPECT', {
      warehouseId: original.warehouseId,
      partId: original.partId,
      quantity: decimal(input.quantity, true).toFixed(2),
      relatedTransactionId: original.id,
      ...(original.referenceType === 'WORK_ORDER' && original.referenceId
        ? { workOrderId: original.referenceId }
        : {}),
      disposition: input.disposition,
      note: input.note,
    });
    return (await this.repo.transact(ctx)).response;
  }
  async confirmUse(
    p: Principal,
    key: string,
    id: string,
    input: ConfirmUseInput,
  ) {
    const tenantId = this.tenant(p);
    const usage = await this.repo.usage(tenantId, id);
    await this.scopedWarehouse(p, usage.warehouseId);
    const ctx = this.context(p, key, 'CONFIRM_USE', {
      warehouseId: usage.warehouseId,
      partId: usage.partId,
      workOrderPartId: usage.id,
      workOrderId: usage.workOrderId,
      quantity: decimal(input.quantity, true).toFixed(2),
      serviceReportId: input.serviceReportId.toLowerCase(),
      customerReason: input.customerReason,
      removedPartDisposition: input.removedPartDisposition,
      ...(input.removedPartNote
        ? { removedPartNote: input.removedPartNote }
        : {}),
      ...(input.note ? { note: input.note } : {}),
    });
    const wo = await this.refs.workOrderDetail(usage.workOrderId, p);
    if (!wo || wo.id !== usage.workOrderId) throw notFound();
    const assignments = await this.refs.assignments(usage.workOrderId, p);
    const assignment = Array.isArray(assignments)
      ? assignments.find(
          (row) =>
            row.technicianUserId === p.userId &&
            row.status ===
              (wo.status === 'COMPLETED' ? 'COMPLETED' : 'ACCEPTED'),
        )
      : undefined;
    if (!assignment)
      throw new ForbiddenException({
        code: 'ASSIGNED_TECHNICIAN_REQUIRED',
        message:
          'Only the technician assigned to the completed report may confirm actual use',
      });
    const cached = await this.repo.cached(ctx);
    if (cached) return cached.response;
    if (wo.status !== 'COMPLETED')
      throw conflict(
        'COMPLETED_REPORT_REQUIRED',
        'Confirm actual use against a completed work order and report',
      );
    const report = await this.refs.serviceReport(usage.workOrderId, p);
    if (
      !report ||
      report.id !== ctx.request.serviceReportId ||
      report.workOrderId !== usage.workOrderId ||
      report.technicianId !== assignment.technicianId
    )
      throw invalid(
        'INVALID_SERVICE_REPORT',
        'Service Report must belong to this Work Order and assigned technician',
      );
    if (!wo.equipmentId || !wo.customerId || !wo.workOrderNo)
      throw invalid(
        'INVALID_WORK_ORDER_REFERENCE',
        'Equipment and customer association must be supplied by Work Order',
      );
    if (
      input.removedPartDisposition !== 'NOT_APPLICABLE' &&
      !input.removedPartNote
    )
      throw invalid(
        'REMOVED_PART_NOTE_REQUIRED',
        'Describe the removed component and its disposition',
      );
    return (
      await this.repo.recordUse(ctx, {
        workOrderId: wo.id,
        equipmentId: wo.equipmentId,
        customerId: wo.customerId,
        workOrderNo: wo.workOrderNo,
        serviceReportId: report.id,
      })
    ).response;
  }
  async reverseUse(
    p: Principal,
    key: string,
    id: string,
    input: ReverseUseInput,
  ) {
    const original = await this.repo.confirmation(this.tenant(p), id);
    const usage = await this.repo.usage(
      this.tenant(p),
      original.workOrderPartId,
    );
    await this.scopedWarehouse(p, usage.warehouseId);
    const ctx = this.context(p, key, 'REVERSE_USE', {
      warehouseId: usage.warehouseId,
      partId: usage.partId,
      workOrderId: usage.workOrderId,
      workOrderPartId: usage.id,
      quantity: original.quantity.toFixed(2),
      reversesId: original.id,
      note: input.note,
    });
    const cached = await this.repo.cached(ctx);
    if (cached) return cached.response;
    await this.scopedWorkOrder(usage.workOrderId, p);
    return (
      await this.repo.recordUse(ctx, {
        workOrderId: original.workOrderId,
        equipmentId: original.equipmentId,
        customerId: original.customerId,
        serviceReportId: original.serviceReportId,
        workOrderNo: original.workOrderNo,
      })
    ).response;
  }
  async serviceParts(p: Principal, equipmentId: string, q: InventoryQuery) {
    equipmentId = equipmentId.toLowerCase();
    const tenantId = requireTenantId(p).toLowerCase();
    const equipment = await this.refs.equipment(equipmentId, p);
    if (
      !equipment ||
      equipment.id.toLowerCase() !== equipmentId ||
      (p.userType === 'CUSTOMER' &&
        equipment.customerId.toLowerCase() !== p.customerId?.toLowerCase())
    )
      throw notFound();
    return this.repo.serviceParts(
      tenantId,
      equipmentId,
      equipment.customerId.toLowerCase(),
      q,
    );
  }
  async issue(
    p: Principal,
    key: string,
    workOrderId: string,
    input: IssueInput,
    link?: FulfillmentLink,
  ) {
    if (
      (input.unitCost !== undefined) !==
      (input.unitCostCurrency !== undefined)
    )
      throw invalid(
        'COST_CURRENCY_REQUIRED',
        'Internal reference cost and currency must be supplied together; omit both when unknown',
      );
    const warehouse = await this.scopedWarehouse(p, input.warehouseId);
    const ctx = this.context(p, key, 'ISSUE', {
      ...this.movement(input),
      workOrderId: workOrderId.toLowerCase(),
      ...(input.unitCost === undefined
        ? {}
        : {
            unitCost: decimal(input.unitCost, false, true).toFixed(2),
            unitCostCurrency: input.unitCostCurrency,
          }),
    });
    ctx.businessContext = link;
    const cached = await this.repo.cached(ctx);
    if (cached && cached.state !== 'PENDING') return this.settle(p, cached);
    const wo = await this.scopedWorkOrder(workOrderId, p);
    if (wo.branchId !== warehouse.branchId)
      throw invalid(
        'WAREHOUSE_BRANCH_MISMATCH',
        'Choose a warehouse from the Work Order branch',
      );
    if (link) await this.validateFulfillmentRecipient(p, ctx);
    await this.repo.prepareIssue(ctx);
    return this.runIssue(p, ctx);
  }
  private async validateFulfillmentRecipient(p: Principal, ctx: OperationContext) {
    const request = ctx.request;
    const wo = await this.refs.workOrderDetail(request.workOrderId!, p);
    if (!wo || wo.id.toLowerCase() !== request.workOrderId) throw notFound();
    assertBranchAccess(p, wo.branchId);
    requireRequestableWorkOrder(wo.status);
    if (wo.currentAssignment?.status !== 'ACCEPTED' ||
      wo.currentAssignment.technicianUserId.toLowerCase() !== ctx.businessContext?.custodianUserId)
      throw conflict('CUSTODIAN_NOT_CURRENT_TECHNICIAN', 'Record the actual current accepted Technician receiving the parts; reconcile an old pending issue before creating a replacement');
  }
  private async runIssue(p: Principal, ctx: OperationContext) {
    let row: InventoryOperation;
    try {
      row = await this.repo.issue({ ...ctx, executedBy: p.userId }, async (operation) => {
        if (ctx.businessContext?.partRequestId) await this.validateFulfillmentRecipient(p, ctx);
        const reservation = await this.refs.reserve(
          operation.workOrderId!,
          { requestId: operation.key, fingerprint: operation.fingerprint },
          p,
        );
        if (reservation.state !== 'HELD')
          throw new ServiceUnavailableException({
            code: 'RESERVATION_STATE_CONFLICT',
            message:
              'Reservation is not held; reconcile this operation before starting another issue',
          });
      });
    } catch (error) {
      if (
        error instanceof HttpException &&
        [400, 404, 409, 422].includes(error.getStatus())
      ) {
        row = await this.repo.abortIssue(
          { ...ctx, executedBy: p.userId },
          error.getStatus(),
          json(error.getResponse()),
        );
      } else throw error; // Timeouts/unknown commit outcomes stay PENDING; never release on a timer.
    }
    return this.settle(p, row);
  }
  private async settle(p: Principal, row: InventoryOperation) {
    if (row.state === 'PENDING' || row.reservationSettledAt) return row;
    try {
      const result = await this.refs.settle(
        row.workOrderId!,
        {
          requestId: row.key,
          fingerprint: row.fingerprint,
          outcome: row.state as 'COMMITTED' | 'ABORTED',
        },
        p,
      );
      const expected = row.state === 'COMMITTED' ? 'COMMITTED' : 'RELEASED';
      if (result.state !== expected)
        throw new Error('Reservation settlement state mismatch');
      await this.repo.settled(row, p.userId);
      return this.repo.operation(row.tenantId, row.key);
    } catch {
      // Stock success stays success. The proof/read endpoint exposes the durable
      // pending settlement; WO must continue blocking terminal transitions.
      this.logger.warn({
        msg: 'Inventory reservation settlement requires retry',
        key: row.key,
        workOrderId: row.workOrderId,
        state: row.state,
      });
      return row;
    }
  }
  async operation(p: Principal, key: string) {
    const row = await this.repo.operation(this.tenant(p), this.key(key));
    await this.operationWarehouse(p, row);
    if (row.operation !== 'ISSUE') throw notFound();
    return json(this.repo.proof(row));
  }
  operations(p: Principal, q: InventoryQuery) {
    return this.repo.operations(this.tenant(p), q, staffBranchId(p));
  }
  async retry(p: Principal, key: string) {
    const row = await this.repo.operation(this.tenant(p), this.key(key));
    await this.operationWarehouse(p, row);
    if (row.operation !== 'ISSUE')
      throw conflict(
        'NOT_AN_ISSUE_OPERATION',
        'Only issue reservations require recovery',
      );
    return this.runIssue(p, {
      tenantId: row.tenantId,
      key: row.key,
      actorId: row.actorId,
      operation: 'ISSUE',
      request: row.request as unknown as Movement,
      businessContext: (row.businessContext as RequestBusinessContext | null) ?? undefined,
    });
  }
  async abort(p: Principal, key: string) {
    const row = await this.repo.operation(this.tenant(p), this.key(key));
    await this.operationWarehouse(p, row);
    if (row.operation !== 'ISSUE' || row.state === 'COMMITTED')
      throw conflict(
        'OPERATION_NOT_ABORTABLE',
        'Committed stock cannot be cancelled; use a return transaction',
      );
    const request = row.request as unknown as Movement;
    if (fingerprint('ISSUE', request) !== row.fingerprint)
      throw conflict(
        'OPERATION_CORRUPT',
        'Operation must be reconciled by an operator',
      );
    const aborted = await this.repo.abortIssue(
      {
        tenantId: row.tenantId,
        key: row.key,
        actorId: row.actorId,
        operation: 'ISSUE',
        request,
        businessContext: (row.businessContext as RequestBusinessContext | null) ?? undefined,
        executedBy: p.userId,
      },
      409,
      {
        code: 'OPERATION_ABORTED',
        message: 'Issue was aborted before stock commit',
      },
    );
    if (aborted.state === 'COMMITTED')
      throw conflict(
        'OPERATION_NOT_ABORTABLE',
        'Issue already committed; use a return transaction',
      );
    return this.settle(p, aborted);
  }
}

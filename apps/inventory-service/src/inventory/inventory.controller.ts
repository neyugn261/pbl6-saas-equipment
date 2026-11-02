import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Res,
} from '@nestjs/common';
import {
  AllowUserTypes,
  CurrentUser,
  RequirePermissions,
  type Principal,
} from '@pbl6/auth';
import type { Response } from 'express';
import type { InventoryOperation } from '../generated/prisma/client.js';
import {
  AdjustInput,
  PartQuery,
  WarehouseQuery,
  StockQuery,
  LedgerQuery,
  OperationQuery,
  IssueInput,
  PartInput,
  PartPatch,
  ReturnInput,
  StockMutation,
  ThresholdInput,
  WarehouseInput,
  WarehousePatch,
} from './dto';
import { PaginationQueryDto } from '@pbl6/service-kit';
import {
  AuditQuery,
  ConfirmUseInput,
  ReverseUseInput,
  InspectionInput,
} from './dto';
import { InventoryService } from './inventory.service';

@Controller()
@AllowUserTypes('TENANT_STAFF')
export class InventoryController {
  constructor(private readonly service: InventoryService) {}
  @Get('inventory-audit')
  @RequirePermissions('inventory:read')
  audit(@CurrentUser() p: Principal, @Query() q: AuditQuery) {
    return this.service.auditHistory(p, q);
  }
  @Post('stock-transactions/:id/inspect')
  @RequirePermissions('inventory:manage')
  inspect(
    @CurrentUser() p: Principal,
    @Headers('idempotency-key') key: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: InspectionInput,
  ) {
    return this.service.inspect(p, key, id, input);
  }
  @Post('usage-confirmations/:id/reverse')
  @RequirePermissions('inventory:issue')
  reverseUse(
    @CurrentUser() p: Principal,
    @Headers('idempotency-key') key: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: ReverseUseInput,
  ) {
    return this.service.reverseUse(p, key, id, input);
  }
  @Get('parts')
  @RequirePermissions('inventory:read')
  parts(@CurrentUser() p: Principal, @Query() q: PartQuery) {
    return this.service.parts(p, q);
  }
  @Get('parts/:id')
  @RequirePermissions('inventory:read')
  part(@CurrentUser() p: Principal, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.part(p, id);
  }
  @Post('parts')
  @RequirePermissions('inventory:manage')
  createPart(@CurrentUser() p: Principal, @Body() input: PartInput) {
    return this.service.createPart(p, input);
  }
  @Patch('parts/:id')
  @RequirePermissions('inventory:manage')
  updatePart(
    @CurrentUser() p: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: PartPatch,
  ) {
    return this.service.updatePart(p, id, input);
  }
  @Get('warehouses')
  @RequirePermissions('inventory:read')
  warehouses(@CurrentUser() p: Principal, @Query() q: WarehouseQuery) {
    return this.service.warehouses(p, q);
  }
  @Get('warehouses/:id')
  @RequirePermissions('inventory:read')
  warehouse(
    @CurrentUser() p: Principal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.warehouse(p, id);
  }
  @Post('warehouses')
  @RequirePermissions('inventory:manage')
  createWarehouse(@CurrentUser() p: Principal, @Body() input: WarehouseInput) {
    return this.service.createWarehouse(p, input);
  }
  @Patch('warehouses/:id')
  @RequirePermissions('inventory:manage')
  updateWarehouse(
    @CurrentUser() p: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: WarehousePatch,
  ) {
    return this.service.updateWarehouse(p, id, input);
  }
  @Get('stocks')
  @RequirePermissions('inventory:read')
  stocks(@CurrentUser() p: Principal, @Query() q: StockQuery) {
    return this.service.stocks(p, q);
  }
  @Put('warehouses/:warehouseId/stocks/:partId')
  @RequirePermissions('inventory:manage')
  threshold(
    @CurrentUser() p: Principal,
    @Param('warehouseId', ParseUUIDPipe) warehouse: string,
    @Param('partId', ParseUUIDPipe) part: string,
    @Body() body: ThresholdInput,
  ) {
    return this.service.threshold(p, warehouse, part, body.minQuantity);
  }
  @Get('stock-transactions')
  @RequirePermissions('inventory:read')
  ledger(@CurrentUser() p: Principal, @Query() q: LedgerQuery) {
    return this.service.ledger(p, q);
  }
  @Post('stock-transactions/receive')
  @RequirePermissions('inventory:manage')
  receive(
    @CurrentUser() p: Principal,
    @Headers('idempotency-key') key: string,
    @Body() input: StockMutation,
  ) {
    return this.service.receive(p, key, input);
  }
  @Post('stock-transactions/adjust')
  @RequirePermissions('inventory:manage')
  adjust(
    @CurrentUser() p: Principal,
    @Headers('idempotency-key') key: string,
    @Body() input: AdjustInput,
  ) {
    return this.service.adjust(p, key, input);
  }
  @Get('work-orders/:workOrderId/parts')
  @RequirePermissions('inventory:read')
  usages(
    @CurrentUser() p: Principal,
    @Param('workOrderId', ParseUUIDPipe) id: string,
  ) {
    return this.service.usages(p, id);
  }
  @Post('work-orders/:workOrderId/parts')
  @RequirePermissions('inventory:issue')
  async issue(
    @CurrentUser() p: Principal,
    @Param('workOrderId', ParseUUIDPipe) id: string,
    @Headers('idempotency-key') key: string,
    @Body() input: IssueInput,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.render(await this.service.issue(p, key, id, input), res);
  }
  @Post('work-order-parts/:id/return')
  @HttpCode(200)
  @RequirePermissions('inventory:issue')
  returnPart(
    @CurrentUser() p: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('idempotency-key') key: string,
    @Body() input: ReturnInput,
  ) {
    return this.service.returnPart(p, key, id, input);
  }
  @Get('inventory-operations')
  @RequirePermissions('inventory:read')
  operations(@CurrentUser() p: Principal, @Query() q: OperationQuery) {
    return this.service.operations(p, q);
  }
  @Get('inventory-operations/:key')
  @RequirePermissions('inventory:read')
  operation(
    @CurrentUser() p: Principal,
    @Param('key', ParseUUIDPipe) key: string,
  ) {
    return this.service.operation(p, key);
  }
  @Post('inventory-operations/:key/retry')
  @RequirePermissions('inventory:issue')
  async retry(
    @CurrentUser() p: Principal,
    @Param('key', ParseUUIDPipe) key: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.render(await this.service.retry(p, key), res);
  }
  @Post('inventory-operations/:key/abort')
  @HttpCode(200)
  @RequirePermissions('inventory:issue')
  async abort(
    @CurrentUser() p: Principal,
    @Param('key', ParseUUIDPipe) key: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const row = await this.service.abort(p, key);
    res.setHeader(
      'X-Inventory-Reservation-State',
      row.reservationSettledAt ? 'SETTLED' : 'PENDING_RELEASE',
    );
    return this.service.operation(p, key);
  }
  private render(row: InventoryOperation, res: Response) {
    res.status(row.httpStatus ?? 503);
    res.setHeader('Idempotency-Key', row.key);
    res.setHeader(
      'X-Inventory-Reservation-State',
      row.reservationSettledAt
        ? 'SETTLED'
        : row.state === 'COMMITTED'
          ? 'PENDING_FINALIZE'
          : 'PENDING_RELEASE',
    );
    return row.response;
  }
}

@Controller('work-order-parts')
@AllowUserTypes('TENANT_STAFF')
export class UsageConfirmationController {
  constructor(private readonly service: InventoryService) {}
  @Post(':id/confirm-use')
  @RequirePermissions('work_order:execute', 'service_report:submit')
  confirm(
    @CurrentUser() p: Principal,
    @Headers('idempotency-key') key: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: ConfirmUseInput,
  ) {
    return this.service.confirmUse(p, key, id, input);
  }
}

/** A scoped service history projection; no stock/catalog access is granted to customers. */
@Controller('equipment/:id/service-parts')
@AllowUserTypes('TENANT_STAFF', 'CUSTOMER')
@RequirePermissions('equipment:read')
export class ServicePartsController {
  constructor(private readonly service: InventoryService) {}
  @Get()
  list(
    @CurrentUser() p: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() q: PaginationQueryDto,
  ) {
    return this.service.serviceParts(p, id, q);
  }
}

/** Blocked at Gateway; WO forwards the current authorized Inventory caller. */
@Controller('internal/inventory-operations')
@AllowUserTypes('TENANT_STAFF')
export class InternalInventoryController {
  constructor(private readonly service: InventoryService) {}
  @Get(':key')
  @RequirePermissions('inventory:issue')
  proof(@CurrentUser() p: Principal, @Param('key', ParseUUIDPipe) key: string) {
    return this.service.operation(p, key);
  }
}

import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import {
  AllowUserTypes,
  BranchScoped,
  CurrentUser,
  RequirePermissions,
  type Principal,
} from '@pbl6/auth';
import type { Response } from 'express';
import { InventoryRequestsService } from './requests.service';
import {
  CreatePartRequestInput,
  CreateReturnRequestInput,
  FulfillmentInput,
  RequestDecisionInput,
  RequestQuery,
  ReturnReceiptInput,
} from './requests.dto';

@BranchScoped()
@Controller()
@AllowUserTypes('TENANT_STAFF')
@RequirePermissions('inventory:read')
export class InventoryRequestsController {
  constructor(private readonly service: InventoryRequestsService) {}
  @Post('work-orders/:id/part-requests')
  create(
    @CurrentUser() p: Principal,
    @Headers('idempotency-key') key: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: CreatePartRequestInput,
  ) {
    return this.service.createPartRequest(p, key, id, input);
  }
  @Get('part-requests')
  list(@CurrentUser() p: Principal, @Query() q: RequestQuery) {
    return this.service.partRequests(p, q);
  }
  @Get('part-requests/:id')
  detail(@CurrentUser() p: Principal, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.partRequest(p, id);
  }
  @Get('part-requests/:id/history')
  history(
    @CurrentUser() p: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() q: RequestQuery,
  ) {
    return this.service.history(p, 'PART_REQUEST', id, q);
  }
  @Post('part-requests/:id/fulfillments')
  @RequirePermissions('inventory:issue')
  async fulfill(
    @CurrentUser() p: Principal,
    @Headers('idempotency-key') key: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: FulfillmentInput,
    @Res({ passthrough: true }) res: Response,
  ) {
    const op = await this.service.fulfill(p, key, id, input);
    res.status(op.httpStatus ?? 503);
    res.setHeader('Idempotency-Key', op.key);
    res.setHeader(
      'X-Inventory-Reservation-State',
      op.reservationSettledAt
        ? 'SETTLED'
        : op.state === 'COMMITTED'
          ? 'PENDING_FINALIZE'
          : 'PENDING_RELEASE',
    );
    return op.response;
  }
  @Post('part-requests/:id/reject')
  @HttpCode(200)
  reject(
    @CurrentUser() p: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: RequestDecisionInput,
  ) {
    return this.service.decidePart(p, id, 'reject', input);
  }
  @Post('part-requests/:id/cancel')
  @HttpCode(200)
  cancel(
    @CurrentUser() p: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: RequestDecisionInput,
  ) {
    return this.service.decidePart(p, id, 'cancel', input);
  }
  @Post('part-requests/:id/close')
  @HttpCode(200)
  close(
    @CurrentUser() p: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: RequestDecisionInput,
  ) {
    return this.service.decidePart(p, id, 'close', input);
  }
  @Post('work-order-parts/:id/return-requests')
  createReturn(
    @CurrentUser() p: Principal,
    @Headers('idempotency-key') key: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: CreateReturnRequestInput,
  ) {
    return this.service.createReturnRequest(p, key, id, input);
  }
  @Get('return-requests')
  listReturns(@CurrentUser() p: Principal, @Query() q: RequestQuery) {
    return this.service.returnRequests(p, q);
  }
  @Get('return-requests/:id')
  returnDetail(
    @CurrentUser() p: Principal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.returnRequest(p, id);
  }
  @Get('return-requests/:id/history')
  returnHistory(
    @CurrentUser() p: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() q: RequestQuery,
  ) {
    return this.service.history(p, 'RETURN_REQUEST', id, q);
  }
  @Post('return-requests/:id/receipts')
  @HttpCode(200)
  @RequirePermissions('inventory:issue')
  receive(
    @CurrentUser() p: Principal,
    @Headers('idempotency-key') key: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: ReturnReceiptInput,
  ) {
    return this.service.receipt(p, key, id, input);
  }
  @Post('return-requests/:id/cancel')
  @HttpCode(200)
  cancelReturn(
    @CurrentUser() p: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: RequestDecisionInput,
  ) {
    return this.service.decideReturn(p, id, 'cancel', input);
  }
  @Post('return-requests/:id/close')
  @HttpCode(200)
  closeReturn(
    @CurrentUser() p: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: RequestDecisionInput,
  ) {
    return this.service.decideReturn(p, id, 'close', input);
  }
}

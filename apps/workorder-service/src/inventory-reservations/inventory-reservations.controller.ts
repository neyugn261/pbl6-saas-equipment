import { BranchScoped } from '@pbl6/auth';
import {
  Body,
  Controller,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  AllowUserTypes,
  CurrentUser,
  RequirePermissions,
  type Principal,
} from '@pbl6/auth';
import {
  InventoryReservationDto,
  InventoryReservationQueryDto,
  SettleInventoryReservationDto,
} from './dto';
import { InventoryReservationsService } from './inventory-reservations.service';

@BranchScoped()
@Controller('internal/work-orders/:workOrderId/inventory-reservations')
@AllowUserTypes('TENANT_STAFF')
@RequirePermissions('inventory:issue', 'work_order:read')
export class InventoryReservationsController {
  constructor(private readonly service: InventoryReservationsService) {}
  @Post()
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  reserve(
    @CurrentUser() p: Principal,
    @Param('workOrderId', ParseUUIDPipe) id: string,
    @Body() input: InventoryReservationDto,
    @Query() _query: InventoryReservationQueryDto,
  ) {
    return this.service.change(p, id, input);
  }
  @Post('settle')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  settle(
    @CurrentUser() p: Principal,
    @Param('workOrderId', ParseUUIDPipe) id: string,
    @Body() input: SettleInventoryReservationDto,
    @Query() _query: InventoryReservationQueryDto,
  ) {
    return this.service.change(p, id, input);
  }
}

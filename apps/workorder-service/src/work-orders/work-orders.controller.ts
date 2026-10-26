import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
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
  CreateWorkOrderDto,
  ListWorkOrdersDto,
  PatchWorkOrderDto,
} from './dto';
import { WorkOrdersService } from './work-orders.service';

@Controller('work-orders')
@AllowUserTypes('TENANT_STAFF')
export class WorkOrdersController {
  constructor(private readonly service: WorkOrdersService) {}
  @Get()
  @RequirePermissions('work_order:read')
  list(@CurrentUser() p: Principal, @Query() q: ListWorkOrdersDto) {
    return this.service.list(p, q);
  }
  @Post()
  @RequirePermissions('work_order:manage')
  create(@CurrentUser() p: Principal, @Body() input: CreateWorkOrderDto) {
    return this.service.create(p, input);
  }
  @Get(':id/history')
  @RequirePermissions('work_order:read')
  history(@CurrentUser() p: Principal, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.history(p, id);
  }
  @Get(':id')
  @RequirePermissions('work_order:read')
  detail(@CurrentUser() p: Principal, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.detail(p, id);
  }
  @Patch(':id')
  @RequirePermissions('work_order:manage')
  patch(
    @CurrentUser() p: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: PatchWorkOrderDto,
  ) {
    return this.service.patch(p, id, input);
  }
}
@Controller('internal/work-orders')
@AllowUserTypes('TENANT_STAFF')
export class InternalWorkOrdersController {
  constructor(private readonly service: WorkOrdersService) {}
  @Get(':id')
  @RequirePermissions('work_order:read')
  reference(
    @CurrentUser() p: Principal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.reference(p, id);
  }
}

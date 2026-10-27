import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import {
  AllowUserTypes,
  CurrentUser,
  RequirePermissions,
  type Principal,
} from '@pbl6/auth';
import { PaginationQueryDto } from '@pbl6/service-kit';
import { HistoryFeedQuery, HistoryService } from './history.service';

@Controller()
export class HistoryController {
  constructor(private readonly history: HistoryService) {}
  @Get('equipment-history')
  @RequirePermissions('equipment:read')
  @AllowUserTypes('TENANT_STAFF', 'CUSTOMER')
  list(@CurrentUser() p: Principal, @Query() q: HistoryFeedQuery) {
    return this.history.list(p, q);
  }
  @Get('equipment/:equipmentId/timeline')
  @RequirePermissions('equipment:read')
  @AllowUserTypes('TENANT_STAFF', 'CUSTOMER')
  timeline(
    @CurrentUser() p: Principal,
    @Param('equipmentId', ParseUUIDPipe) id: string,
    @Query() q: HistoryFeedQuery,
  ) {
    return this.history.list(p, q, id);
  }
  @Get('equipment-history/:historyId')
  @RequirePermissions('equipment:read')
  @AllowUserTypes('TENANT_STAFF', 'CUSTOMER')
  detail(
    @CurrentUser() p: Principal,
    @Param('historyId', ParseUUIDPipe) id: string,
  ) {
    return this.history.detail(p, id);
  }
  @Get('warranties/:warrantyId/history')
  @RequirePermissions('equipment:read')
  @AllowUserTypes('TENANT_STAFF', 'CUSTOMER')
  warranty(
    @CurrentUser() p: Principal,
    @Param('warrantyId', ParseUUIDPipe) id: string,
    @Query() q: HistoryFeedQuery,
  ) {
    return this.history.warranty(p, id, q);
  }
  @Get('equipment-models/:modelId/history')
  @RequirePermissions('equipment:read')
  @AllowUserTypes('TENANT_STAFF')
  model(
    @CurrentUser() p: Principal,
    @Param('modelId', ParseUUIDPipe) id: string,
    @Query() q: PaginationQueryDto,
  ) {
    return this.history.model(p, id, q);
  }
}

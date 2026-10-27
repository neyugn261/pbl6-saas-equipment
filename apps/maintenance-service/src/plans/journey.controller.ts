import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import {
  AllowUserTypes,
  CurrentUser,
  RequirePermissions,
  type Principal,
} from '@pbl6/auth';
import { IsOptional, IsUUID } from 'class-validator';
import { JourneyQuery, JourneyService } from './journey.service';
class SummaryQuery {
  @IsOptional() @IsUUID() equipmentId?: string;
}
@Controller()
@RequirePermissions('maintenance:read')
@AllowUserTypes('TENANT_STAFF', 'CUSTOMER')
export class JourneyController {
  constructor(private readonly journeys: JourneyService) {}
  @Get('maintenance-summary') summary(
    @CurrentUser() p: Principal,
    @Query() q: SummaryQuery,
  ) {
    return this.journeys.summary(p, q.equipmentId);
  }
  @Get('maintenance-history') history(
    @CurrentUser() p: Principal,
    @Query() q: JourneyQuery,
  ) {
    return this.journeys.history(p, q);
  }
  @Get('maintenance-plans/:id/history') plan(
    @CurrentUser() p: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() q: JourneyQuery,
  ) {
    return this.journeys.history(p, q, id);
  }
  @Get('maintenance-tasks/:id/journey') task(
    @CurrentUser() p: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() q: JourneyQuery,
  ) {
    return this.journeys.task(p, id, q);
  }
}

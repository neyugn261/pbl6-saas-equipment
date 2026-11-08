import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { AllowUserTypes, CurrentUser, RequirePermissions, type Principal } from '@pbl6/auth';
import { CreateHandoverDto, EmptyHandoverDto, HandoverDecisionDto, HandoverQuery, RejectHandoverDto } from './handover.dto';
import { HandoverService } from './handover.service';

@Controller('equipment-handovers')
@AllowUserTypes('TENANT_STAFF')
@RequirePermissions('equipment:manage')
export class HandoverController {
  constructor(private readonly handovers: HandoverService) {}
  @Get() list(@CurrentUser() p: Principal, @Query() q: HandoverQuery) { return this.handovers.list(p, q); }
  @Get(':id') detail(@CurrentUser() p: Principal, @Param('id', ParseUUIDPipe) id: string) { return this.handovers.detail(p, id); }
  @Post() create(@CurrentUser() p: Principal, @Body() dto: CreateHandoverDto) { return this.handovers.create(p, dto); }
  @Post(':id/submit') @HttpCode(200)
  submit(@CurrentUser() p: Principal, @Param('id', ParseUUIDPipe) id: string, @Body() _body: EmptyHandoverDto) { return this.handovers.act(p, id, 'submit'); }
  @Post(':id/cancel') @HttpCode(200)
  cancel(@CurrentUser() p: Principal, @Param('id', ParseUUIDPipe) id: string, @Body() _body: EmptyHandoverDto) { return this.handovers.act(p, id, 'cancel'); }
}
@Controller('my/equipment-handovers')
@AllowUserTypes('CUSTOMER')
@RequirePermissions('equipment:read')
export class CustomerHandoverController {
  constructor(private readonly handovers: HandoverService) {}
  @Get() list(@CurrentUser() p: Principal, @Query() q: HandoverQuery) { return this.handovers.list(p, q); }
  @Get(':id') detail(@CurrentUser() p: Principal, @Param('id', ParseUUIDPipe) id: string) { return this.handovers.detail(p, id); }
  @Post(':id/accept') @HttpCode(200) @RequirePermissions('equipment_handover:respond')
  accept(@CurrentUser() p: Principal, @Param('id', ParseUUIDPipe) id: string, @Body() body: HandoverDecisionDto) { return this.handovers.act(p, id, 'accept', undefined, body.expectedVersion); }
  @Post(':id/reject') @HttpCode(200) @RequirePermissions('equipment_handover:respond')
  reject(@CurrentUser() p: Principal, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RejectHandoverDto) { return this.handovers.act(p, id, 'reject', dto.reason, dto.expectedVersion); }
}

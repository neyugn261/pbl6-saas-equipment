import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { AllowUserTypes, CurrentUser, RequirePermissions, type Principal } from '@pbl6/auth';
import { CreateEquipmentDto, HistoryQueryDto, ListEquipmentQueryDto, PatchEquipmentDto } from './dto/equipment.dto';
import { EquipmentService } from './equipment.service';

@Controller('equipment')
export class EquipmentController {
  constructor(private readonly equipment: EquipmentService) {}

  @Get()
  @RequirePermissions('equipment:read')
  @AllowUserTypes('TENANT_STAFF', 'CUSTOMER')
  list(@CurrentUser() principal: Principal, @Query() query: ListEquipmentQueryDto) {
    return this.equipment.list(principal, query);
  }

  @Post()
  @RequirePermissions('equipment:manage')
  @AllowUserTypes('TENANT_STAFF')
  create(@CurrentUser() principal: Principal, @Body() input: CreateEquipmentDto) {
    return this.equipment.create(principal, input);
  }

  @Get(':equipmentId/history')
  @RequirePermissions('equipment:read')
  @AllowUserTypes('TENANT_STAFF', 'CUSTOMER')
  history(@CurrentUser() principal: Principal, @Param('equipmentId', ParseUUIDPipe) id: string, @Query() query: HistoryQueryDto) {
    return this.equipment.history(principal, id, query);
  }

  @Get(':equipmentId')
  @RequirePermissions('equipment:read')
  @AllowUserTypes('TENANT_STAFF', 'CUSTOMER')
  detail(@CurrentUser() principal: Principal, @Param('equipmentId', ParseUUIDPipe) id: string) {
    return this.equipment.detail(principal, id);
  }

  @Patch(':equipmentId')
  @RequirePermissions('equipment:manage')
  @AllowUserTypes('TENANT_STAFF')
  patch(@CurrentUser() principal: Principal, @Param('equipmentId', ParseUUIDPipe) id: string, @Body() input: PatchEquipmentDto) {
    return this.equipment.patch(principal, id, input);
  }
}

@Controller('internal/equipment')
export class InternalEquipmentController {
  constructor(private readonly equipment: EquipmentService) {}

  @Get(':equipmentId')
  @RequirePermissions('equipment:read')
  @AllowUserTypes('TENANT_STAFF', 'CUSTOMER')
  reference(@CurrentUser() principal: Principal, @Param('equipmentId', ParseUUIDPipe) id: string) {
    return this.equipment.reference(principal, id);
  }
}

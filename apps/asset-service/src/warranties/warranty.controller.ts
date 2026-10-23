import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { AllowUserTypes, CurrentUser, RequirePermissions, type Principal } from '@pbl6/auth';
import { EquipmentService } from '../equipment/equipment.service';
import { CreateWarrantyDto, VoidWarrantyDto, WarrantyDateQueryDto } from './warranty.dto';
import { WarrantyService } from './warranty.service';

@Controller('equipment/:equipmentId')
export class EquipmentWarrantyController {
  constructor(private readonly warranties: WarrantyService, private readonly equipment: EquipmentService) {}

  @Get('warranties')
  @RequirePermissions('equipment:read')
  @AllowUserTypes('TENANT_STAFF', 'CUSTOMER')
  list(@CurrentUser() principal: Principal, @Param('equipmentId', ParseUUIDPipe) id: string) {
    return this.warranties.list(principal, id);
  }

  @Post('warranties')
  @RequirePermissions('warranty:manage')
  @AllowUserTypes('TENANT_STAFF')
  add(@CurrentUser() principal: Principal, @Param('equipmentId', ParseUUIDPipe) id: string, @Body() input: CreateWarrantyDto) {
    return this.warranties.add(principal, id, input);
  }

  @Get('warranty-status')
  @RequirePermissions('equipment:read')
  @AllowUserTypes('TENANT_STAFF', 'CUSTOMER')
  status(@CurrentUser() principal: Principal, @Param('equipmentId', ParseUUIDPipe) id: string, @Query() query: WarrantyDateQueryDto) {
    return this.equipment.warrantyStatus(principal, id, query.date);
  }
}

@Controller('warranties')
export class WarrantyController {
  constructor(private readonly warranties: WarrantyService) {}

  @Post(':warrantyId/void')
  @HttpCode(200)
  @RequirePermissions('warranty:manage')
  @AllowUserTypes('TENANT_STAFF')
  void(@CurrentUser() principal: Principal, @Param('warrantyId', ParseUUIDPipe) id: string, @Body() input: VoidWarrantyDto) {
    return this.warranties.void(principal, id, input?.reason);
  }
}

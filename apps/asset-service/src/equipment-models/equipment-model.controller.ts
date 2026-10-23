import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { AllowUserTypes, CurrentUser, RequirePermissions, type Principal } from '@pbl6/auth';
import { CreateEquipmentModelDto } from './dto/create-equipment-model.dto';
import { ListEquipmentModelsQueryDto } from './dto/list-equipment-models-query.dto';
import { UpdateEquipmentModelDto } from './dto/update-equipment-model.dto';
import { EquipmentModelService } from './equipment-model.service';

@Controller('equipment-models')
export class EquipmentModelController {
  constructor(private readonly models: EquipmentModelService) {}

  @Get()
  @RequirePermissions('equipment:read')
  // The catalog is staff-only; CUSTOMER can read only scoped equipment.
  @AllowUserTypes('TENANT_STAFF')
  list(@CurrentUser() principal: Principal, @Query() query: ListEquipmentModelsQueryDto) {
    return this.models.list(principal, query);
  }

  @Post()
  @RequirePermissions('equipment:manage')
  @AllowUserTypes('TENANT_STAFF')
  create(@CurrentUser() principal: Principal, @Body() input: CreateEquipmentModelDto) {
    return this.models.create(principal, input);
  }

  @Patch(':modelId')
  @RequirePermissions('equipment:manage')
  @AllowUserTypes('TENANT_STAFF')
  update(
    @CurrentUser() principal: Principal,
    @Param('modelId', ParseUUIDPipe) id: string,
    @Body() input: UpdateEquipmentModelDto,
  ) {
    return this.models.update(principal, id, input);
  }
}

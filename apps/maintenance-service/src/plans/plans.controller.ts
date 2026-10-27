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
  CreatePlanDto,
  ListPlansDto,
  ListTasksDto,
  PatchPlanDto,
  ReplacementDto,
} from './dto';
import { PlansService } from './plans.service';

@Controller('maintenance-plans')
export class PlansController {
  constructor(private readonly service: PlansService) {}
  @Get()
  @AllowUserTypes('TENANT_STAFF', 'CUSTOMER')
  @RequirePermissions('maintenance:read')
  list(@CurrentUser() p: Principal, @Query() q: ListPlansDto) {
    return this.service.list(p, q);
  }
  @Post()
  @AllowUserTypes('TENANT_STAFF')
  @RequirePermissions('maintenance:manage')
  create(@CurrentUser() p: Principal, @Body() input: CreatePlanDto) {
    return this.service.create(p, input);
  }
  @Get(':id')
  @AllowUserTypes('TENANT_STAFF', 'CUSTOMER')
  @RequirePermissions('maintenance:read')
  detail(@CurrentUser() p: Principal, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.detail(p, id);
  }
  @Patch(':id')
  @AllowUserTypes('TENANT_STAFF')
  @RequirePermissions('maintenance:manage')
  patch(
    @CurrentUser() p: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: PatchPlanDto,
  ) {
    return this.service.patch(p, id, input);
  }
}
@Controller('maintenance-tasks')
export class TasksController {
  constructor(private readonly service: PlansService) {}
  @Get()
  @AllowUserTypes('TENANT_STAFF', 'CUSTOMER')
  @RequirePermissions('maintenance:read')
  list(@CurrentUser() p: Principal, @Query() q: ListTasksDto) {
    return this.service.tasks(p, q);
  }
  @Get(':id')
  @AllowUserTypes('TENANT_STAFF', 'CUSTOMER')
  @RequirePermissions('maintenance:read')
  detail(@CurrentUser() p: Principal, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.task(p, id);
  }
  @Post(':id/replacement')
  @AllowUserTypes('TENANT_STAFF')
  @RequirePermissions('maintenance:manage')
  replacement(
    @CurrentUser() p: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: ReplacementDto,
  ) {
    return this.service.replacement(p, id, input.requestId);
  }
}

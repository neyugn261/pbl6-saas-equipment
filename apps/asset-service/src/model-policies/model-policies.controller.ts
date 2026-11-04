import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
} from '@nestjs/common';
import {
  AllowUserTypes,
  CurrentUser,
  RequirePermissions,
  type Principal,
} from '@pbl6/auth';
import { IsInt, IsObject, Min } from 'class-validator';
import { ModelPoliciesService } from './model-policies.service';
class PolicyBodyDto {
  @IsObject() body: Record<string, unknown>;
}
class PolicyVersionDto {
  @IsInt() @Min(1) expectedVersion: number;
}
class PolicyEditDto extends PolicyVersionDto {
  @IsObject() body: Record<string, unknown>;
}
@Controller('equipment-models/:modelId/warranty-policies')
@AllowUserTypes('TENANT_STAFF')
@RequirePermissions('equipment:manage')
export class ModelPoliciesController {
  constructor(private readonly service: ModelPoliciesService) {}
  @Get() list(
    @CurrentUser() p: Principal,
    @Param('modelId', ParseUUIDPipe) modelId: string,
  ) {
    return this.service.list(p, modelId);
  }
  @Get('default') current(
    @CurrentUser() p: Principal,
    @Param('modelId', ParseUUIDPipe) modelId: string,
  ) {
    return this.service.current(p, modelId);
  }
  @Get(':id') get(
    @CurrentUser() p: Principal,
    @Param('modelId', ParseUUIDPipe) modelId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.get(p, modelId, id);
  }
  @Post() @RequirePermissions('warranty:manage') create(
    @CurrentUser() p: Principal,
    @Param('modelId', ParseUUIDPipe) modelId: string,
    @Body() input: PolicyBodyDto,
  ) {
    return this.service.write(
      p,
      modelId,
      'CREATE',
      undefined,
      undefined,
      input.body,
    );
  }
  @Put(':id') @RequirePermissions('warranty:manage') update(
    @CurrentUser() p: Principal,
    @Param('modelId', ParseUUIDPipe) modelId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: PolicyEditDto,
  ) {
    return this.service.write(
      p,
      modelId,
      'UPDATE',
      id,
      input.expectedVersion,
      input.body,
    );
  }
  @Post(':id/publish') @RequirePermissions('warranty:manage') publish(
    @CurrentUser() p: Principal,
    @Param('modelId', ParseUUIDPipe) modelId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: PolicyVersionDto,
  ) {
    return this.service.write(p, modelId, 'PUBLISH', id, input.expectedVersion);
  }
  @Post(':id/retire') @RequirePermissions('warranty:manage') retire(
    @CurrentUser() p: Principal,
    @Param('modelId', ParseUUIDPipe) modelId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: PolicyVersionDto,
  ) {
    return this.service.write(p, modelId, 'RETIRE', id, input.expectedVersion);
  }
}

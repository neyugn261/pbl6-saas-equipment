import { Type } from 'class-transformer';
import {
  IsOptional,
  IsArray,
  ArrayMaxSize,
  ValidateNested,
} from 'class-validator';
import { ScheduleOverrideDto } from './schedule-override.dto';
import { Matches, IsISO8601 } from 'class-validator';
class PolicyCalendarDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @ValidateNested({ each: true })
  @Type(() => ScheduleOverrideDto)
  overrides?: ScheduleOverrideDto[];
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsISO8601({ strict: true })
  handoverDate: string;
}
import {
  Body,
  Query,
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
@Controller('equipment-models/:modelId/maintenance-profiles')
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
  @Post(':id/preview') previewOverrides(
    @CurrentUser() p: Principal,
    @Param('modelId', ParseUUIDPipe) modelId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: PolicyCalendarDto,
  ) {
    return this.service.preview(
      p,
      modelId,
      id,
      input.handoverDate,
      input.overrides,
    );
  }
  @Get(':id/preview') preview(
    @CurrentUser() p: Principal,
    @Param('modelId', ParseUUIDPipe) modelId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() q: PolicyCalendarDto,
  ) {
    return this.service.preview(p, modelId, id, q.handoverDate);
  }
  @Post() @RequirePermissions('maintenance:manage') create(
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
  @Put(':id') @RequirePermissions('maintenance:manage') update(
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
  @Post(':id/publish') @RequirePermissions('maintenance:manage') publish(
    @CurrentUser() p: Principal,
    @Param('modelId', ParseUUIDPipe) modelId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: PolicyVersionDto,
  ) {
    return this.service.write(p, modelId, 'PUBLISH', id, input.expectedVersion);
  }
  @Post(':id/retire') @RequirePermissions('maintenance:manage') retire(
    @CurrentUser() p: Principal,
    @Param('modelId', ParseUUIDPipe) modelId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: PolicyVersionDto,
  ) {
    return this.service.write(p, modelId, 'RETIRE', id, input.expectedVersion);
  }
}

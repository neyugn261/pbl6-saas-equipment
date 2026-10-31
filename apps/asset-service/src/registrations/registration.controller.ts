import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import {
  AllowUserTypes,
  CurrentUser,
  RequirePermissions,
  type Principal,
} from '@pbl6/auth';
import type { Response } from 'express';
import {
  CreateRegistrationDto,
  EmptyRegistrationDto,
  PatchRegistrationDto,
  RegistrationQuery,
  VersionDto,
} from './registration.dto';
import { RegistrationService } from './registration.service';

@Controller('equipment-registrations')
@AllowUserTypes('TENANT_STAFF')
@RequirePermissions('equipment:manage')
export class RegistrationController {
  constructor(private readonly service: RegistrationService) {}
  @Post()
  create(
    @CurrentUser() p: Principal,
    @Body() input: CreateRegistrationDto,
    @Headers('idempotency-key') key: string,
  ) {
    return this.service.create(p, input, key);
  }
  @Get()
  list(@CurrentUser() p: Principal, @Query() query: RegistrationQuery) {
    return this.service.list(p, query);
  }
  @Get(':id')
  detail(@CurrentUser() p: Principal, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.detail(p, id);
  }
  @Patch(':id')
  patch(
    @CurrentUser() p: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: PatchRegistrationDto,
  ) {
    return this.service.patch(p, id, input);
  }
  @Post(':id/submit')
  @HttpCode(200)
  @RequirePermissions('warranty:manage', 'maintenance:manage')
  async submit(
    @CurrentUser() p: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: VersionDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const row = await this.service.submit(p, id, input.expectedVersion);
    response.status(row.status === 'PENDING_MAINTENANCE' ? 202 : 200);
    return row;
  }
  @Post(':id/resume')
  @HttpCode(200)
  @RequirePermissions('warranty:manage', 'maintenance:manage')
  async resume(
    @CurrentUser() p: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: EmptyRegistrationDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    void body;
    const row = await this.service.resume(p, id);
    response.status(row.status === 'PENDING_MAINTENANCE' ? 202 : 200);
    return row;
  }
}
@Controller('internal/equipment-registrations')
@AllowUserTypes('TENANT_STAFF')
@RequirePermissions('equipment:manage', 'maintenance:manage')
export class RegistrationProjectionController {
  constructor(private readonly service: RegistrationService) {}
  @Get(':id/maintenance-input')
  projection(
    @CurrentUser() p: Principal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.projection(p, id);
  }
}

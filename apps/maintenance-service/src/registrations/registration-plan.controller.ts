import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Put,
} from '@nestjs/common';
import {
  AllowUserTypes,
  CurrentUser,
  RequirePermissions,
  type Principal,
} from '@pbl6/auth';
import { RegistrationPlanService } from './registration-plan.service';

class EmptySetupDto {}
@Controller('internal/equipment-registrations')
@AllowUserTypes('TENANT_STAFF')
@RequirePermissions('maintenance:manage')
export class RegistrationPlanController {
  constructor(private readonly service: RegistrationPlanService) {}
  @Get(':id/maintenance-plan')
  lookup(@CurrentUser() p: Principal, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.lookup(p, id);
  }
  @Put(':id/maintenance-plan')
  ensure(
    @CurrentUser() p: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: EmptySetupDto,
  ) {
    void body;
    return this.service.ensure(p, id);
  }
}

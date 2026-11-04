import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import {
  AllowUserTypes,
  CurrentUser,
  RequirePermissions,
  type Principal,
} from '@pbl6/auth';
import { ModelSetupService } from './model-setup.service';
@Controller('equipment')
@AllowUserTypes('TENANT_STAFF', 'CUSTOMER')
@RequirePermissions('equipment:read')
export class AppliedPoliciesController {
  constructor(private readonly service: ModelSetupService) {}
  @Get(':id/applied-policies') get(
    @CurrentUser() p: Principal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.disclosure(p, id);
  }
}

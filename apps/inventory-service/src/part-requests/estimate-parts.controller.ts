import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import {
  AllowUserTypes,
  BranchScoped,
  CurrentUser,
  RequirePermissions,
  type Principal,
} from '@pbl6/auth';
import { EstimatePartsService } from './estimate-parts.service';

@BranchScoped()
@Controller('work-orders')
@AllowUserTypes('TENANT_STAFF')
export class EstimatePartsController {
  constructor(private readonly parts: EstimatePartsService) {}
  @Get(':id/recommended-parts')
  @RequirePermissions('inventory:read', 'work_order:read')
  recommended(
    @CurrentUser() p: Principal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.parts.recommended(p, id);
  }
}

import { Body, Controller, Post } from '@nestjs/common';
import {
  AllowUserTypes,
  CurrentUser,
  dataScope,
  RequirePermissions,
  type Principal,
} from '@pbl6/auth';
import { BatchLookupDto } from './batch-lookup.dto';
import { BatchLookupService } from './batch-lookup.service';

@Controller('lookups')
@AllowUserTypes('TENANT_STAFF', 'CUSTOMER')
export class BatchLookupsController {
  constructor(private readonly lookups: BatchLookupService) {}

  @Post('batch')
  @RequirePermissions('customer:read')
  lookup(
    @CurrentUser() principal: Principal,
    @Body() input: BatchLookupDto,
  ) {
    return this.lookups.lookup(dataScope(principal), input);
  }
}

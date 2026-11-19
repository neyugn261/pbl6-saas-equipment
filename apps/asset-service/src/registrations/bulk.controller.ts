import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import {
  AllowUserTypes,
  CurrentUser,
  RequirePermissions,
  type Principal,
} from '@pbl6/auth';
import { BulkEquipmentUpdateInput, BulkInput } from './bulk.dto';
import { BulkHandoverService } from './bulk.service';

@Controller('bulk-handovers')
@AllowUserTypes('TENANT_STAFF')
@RequirePermissions('equipment:manage')
export class BulkHandoverController {
  constructor(private readonly bulk: BulkHandoverService) {}
  @Post('preview') preview(
    @CurrentUser() p: Principal,
    @Body() input: BulkInput,
  ) {
    return this.bulk.preview(p, input);
  }
  @Post() create(
    @CurrentUser() p: Principal,
    @Body() input: BulkInput,
    @Headers('idempotency-key') key: string,
  ) {
    return this.bulk.create(p, input, key);
  }
  @Post('update/preview') previewUpdate(
    @CurrentUser() p: Principal,
    @Body() input: BulkEquipmentUpdateInput,
  ) {
    return this.bulk.previewUpdate(p, input);
  }
  @Post('update') update(
    @CurrentUser() p: Principal,
    @Body() input: BulkEquipmentUpdateInput,
    @Headers('idempotency-key') key: string,
  ) {
    return this.bulk.update(p, input, key);
  }
  @Get(':id') result(
    @CurrentUser() p: Principal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.bulk.result(p, id);
  }
}

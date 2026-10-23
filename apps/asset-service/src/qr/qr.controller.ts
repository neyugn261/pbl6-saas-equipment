import { Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { AllowUserTypes, CurrentUser, RequirePermissions, type Principal } from '@pbl6/auth';
import { QrService } from './qr.service';

@Controller('equipment/:equipmentId/qr-codes')
export class EquipmentQrController {
  constructor(private readonly qr: QrService) {}

  @Post()
  @RequirePermissions('qr:manage')
  @AllowUserTypes('TENANT_STAFF')
  issue(@CurrentUser() principal: Principal, @Param('equipmentId', ParseUUIDPipe) id: string) {
    return this.qr.issue(principal, id);
  }

  @Delete()
  @HttpCode(204)
  @RequirePermissions('qr:manage')
  @AllowUserTypes('TENANT_STAFF')
  revoke(@CurrentUser() principal: Principal, @Param('equipmentId', ParseUUIDPipe) id: string) {
    return this.qr.revoke(principal, id);
  }
}

@Controller('qr')
export class QrController {
  constructor(private readonly qr: QrService) {}

  @Get(':token')
  @RequirePermissions('equipment:read')
  @AllowUserTypes('TENANT_STAFF', 'CUSTOMER')
  resolve(@CurrentUser() principal: Principal, @Param('token') token: string) {
    return this.qr.resolve(principal, token);
  }
}

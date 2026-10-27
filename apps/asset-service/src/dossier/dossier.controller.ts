import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import {
  AllowUserTypes,
  CurrentUser,
  RequirePermissions,
  type Principal,
} from '@pbl6/auth';
import { DossierService, LinkedQuery } from './dossier.service';
@Controller('equipment/:equipmentId')
@RequirePermissions('equipment:read')
@AllowUserTypes('TENANT_STAFF', 'CUSTOMER')
export class DossierController {
  constructor(private readonly dossier: DossierService) {}
  @Get('dossier') detail(
    @CurrentUser() p: Principal,
    @Param('equipmentId', ParseUUIDPipe) id: string,
  ) {
    return this.dossier.dossier(p, id);
  }
  @Get('service-requests') requests(
    @CurrentUser() p: Principal,
    @Param('equipmentId', ParseUUIDPipe) id: string,
    @Query() q: LinkedQuery,
  ) {
    return this.dossier.list(p, id, 'SERVICE_REQUEST', q);
  }
  @Get('work-orders') orders(
    @CurrentUser() p: Principal,
    @Param('equipmentId', ParseUUIDPipe) id: string,
    @Query() q: LinkedQuery,
  ) {
    return this.dossier.list(p, id, 'WORKORDER', q);
  }
  @Get('service-requests/:requestId') request(
    @CurrentUser() p: Principal,
    @Param('equipmentId', ParseUUIDPipe) id: string,
    @Param('requestId', ParseUUIDPipe) ref: string,
  ) {
    return this.dossier.request(p, id, ref);
  }
  @Get('work-orders/:workOrderId') order(
    @CurrentUser() p: Principal,
    @Param('equipmentId', ParseUUIDPipe) id: string,
    @Param('workOrderId', ParseUUIDPipe) ref: string,
  ) {
    return this.dossier.order(p, id, ref);
  }
  @Get('maintenance-plans') plans(
    @CurrentUser() p: Principal,
    @Param('equipmentId', ParseUUIDPipe) id: string,
    @Query() q: LinkedQuery,
  ) {
    return this.dossier.maintenanceList(p, id, false, q);
  }
  @Get('maintenance-tasks') tasks(
    @CurrentUser() p: Principal,
    @Param('equipmentId', ParseUUIDPipe) id: string,
    @Query() q: LinkedQuery,
  ) {
    return this.dossier.maintenanceList(p, id, true, q);
  }
}

import { Controller, Get, Header, Query } from '@nestjs/common';
import {
  AllowUserTypes,
  CurrentUser,
  RequirePermissions,
  type Principal,
} from '@pbl6/auth';
import { WorkOrderSummaryQueryDto } from './dto';
import { ReportsService } from './reports.service';

@Controller('reports/work-orders')
@AllowUserTypes('TENANT_STAFF')
@RequirePermissions('report:read')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}
  @Get('summary')
  @Header('Cache-Control', 'no-store')
  summary(
    @CurrentUser() p: Principal,
    @Query() query: WorkOrderSummaryQueryDto,
  ) {
    return this.reports.summary(p, query);
  }
}

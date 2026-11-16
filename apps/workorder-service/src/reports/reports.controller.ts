import { BranchScoped } from '@pbl6/auth';
import { Controller, Get, Header, Query } from '@nestjs/common';
import {
  AllowUserTypes,
  CurrentUser,
  RequirePermissions,
  type Principal,
} from '@pbl6/auth';
import { TechnicianKpiQueryDto, WorkOrderSummaryQueryDto } from './dto';
import { ReportsService } from './reports.service';

@BranchScoped()
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

  @Get(['technicians', 'kpi'])
  @Header('Cache-Control', 'no-store')
  technicianKpi(
    @CurrentUser() p: Principal,
    @Query() query: TechnicianKpiQueryDto,
  ) {
    return this.reports.technicianKpi(p, query);
  }
}

@BranchScoped()
@Controller('reports/technicians')
@AllowUserTypes('TENANT_STAFF')
@RequirePermissions('report:read')
export class TechnicianReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  technicianKpi(
    @CurrentUser() p: Principal,
    @Query() query: TechnicianKpiQueryDto,
  ) {
    return this.reports.technicianKpi(p, query);
  }
}

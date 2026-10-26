import {
  Body,
  Controller,
  Get,
  HttpCode,
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
import { WorkOrderWorkflowService } from './workflow.service';
import {
  AssignWorkOrderDto,
  CancelWorkOrderDto,
  EmptyActionDto,
  ReasonDto,
  ServiceReportDto,
  WorkLogDto,
} from './workflow.dto';

@Controller('work-orders/:id')
@AllowUserTypes('TENANT_STAFF')
export class WorkOrderWorkflowController {
  constructor(private readonly service: WorkOrderWorkflowService) {}
  @Post('assign')
  @HttpCode(200)
  @RequirePermissions('work_order:assign')
  assign(
    @CurrentUser() p: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: AssignWorkOrderDto,
  ) {
    return this.service.action(p, id, 'assign', input);
  }
  @Post('accept')
  @HttpCode(200)
  @RequirePermissions('work_order:execute')
  accept(
    @CurrentUser() p: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() _input: EmptyActionDto,
  ) {
    return this.service.action(p, id, 'accept');
  }
  @Post('reject')
  @HttpCode(200)
  @RequirePermissions('work_order:execute')
  reject(
    @CurrentUser() p: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: ReasonDto,
  ) {
    return this.service.action(p, id, 'reject', input);
  }
  @Post('start-travel')
  @HttpCode(200)
  @RequirePermissions('work_order:execute')
  travel(
    @CurrentUser() p: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() _input: EmptyActionDto,
  ) {
    return this.service.action(p, id, 'start-travel');
  }
  @Post('start')
  @HttpCode(200)
  @RequirePermissions('work_order:execute')
  start(
    @CurrentUser() p: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() _input: EmptyActionDto,
  ) {
    return this.service.action(p, id, 'start');
  }
  // Read permission protects the entry point; the service enforces OR permissions under the row lock.
  @Post('hold')
  @HttpCode(200)
  @RequirePermissions('work_order:read')
  hold(
    @CurrentUser() p: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: ReasonDto,
  ) {
    return this.service.action(p, id, 'hold', input);
  }
  @Post('resume')
  @HttpCode(200)
  @RequirePermissions('work_order:read')
  resume(
    @CurrentUser() p: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() _input: EmptyActionDto,
  ) {
    return this.service.action(p, id, 'resume');
  }
  @Post('complete')
  @HttpCode(200)
  @RequirePermissions('work_order:execute', 'service_report:submit')
  complete(
    @CurrentUser() p: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: ServiceReportDto,
  ) {
    return this.service.action(p, id, 'complete', { report: input });
  }
  @Post('cancel')
  @HttpCode(200)
  @RequirePermissions('work_order:manage')
  cancel(
    @CurrentUser() p: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: CancelWorkOrderDto,
  ) {
    return this.service.action(p, id, 'cancel', input);
  }
  @Get('assignments')
  @RequirePermissions('work_order:read')
  assignments(
    @CurrentUser() p: Principal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.assignments(p, id);
  }
  @Get('logs')
  @RequirePermissions('work_order:read')
  logs(@CurrentUser() p: Principal, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.logs(p, id);
  }
  @Post('logs')
  @RequirePermissions('work_order:read')
  addLog(
    @CurrentUser() p: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: WorkLogDto,
  ) {
    return this.service.addLog(p, id, input);
  }
  @Get('service-report')
  @RequirePermissions('work_order:read')
  report(@CurrentUser() p: Principal, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.report(p, id);
  }
}

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  AllowUserTypes,
  CurrentUser,
  RequirePermissions,
  type Principal,
} from '@pbl6/auth';
import { ServiceRequestsService } from './service-requests.service';
import {
  AddCommentDto,
  CostEstimateInputDto,
  CreateServiceRequestDto,
  ListServiceRequestsDto,
  OptionalReasonDto,
  RequiredReasonDto,
  UpdateServiceRequestDto,
} from './dto';

@Controller('service-requests')
@AllowUserTypes('TENANT_STAFF', 'CUSTOMER')
export class ServiceRequestsController {
  constructor(private readonly requests: ServiceRequestsService) {}

  @Get()
  @RequirePermissions('service_request:read')
  list(
    @CurrentUser() principal: Principal,
    @Query() query: ListServiceRequestsDto,
  ) {
    return this.requests.list(principal, query);
  }

  @Post()
  @RequirePermissions('service_request:create')
  create(
    @CurrentUser() principal: Principal,
    @Body() body: CreateServiceRequestDto,
  ) {
    return this.requests.create(principal, body);
  }

  @Get(':requestId')
  @RequirePermissions('service_request:read')
  detail(
    @CurrentUser() principal: Principal,
    @Param('requestId', new ParseUUIDPipe()) requestId: string,
  ) {
    return this.requests.detail(principal, requestId);
  }

  @Patch(':requestId')
  @RequirePermissions('service_request:create')
  update(
    @CurrentUser() principal: Principal,
    @Param('requestId', new ParseUUIDPipe()) requestId: string,
    @Body() body: UpdateServiceRequestDto,
  ) {
    return this.requests.update(principal, requestId, body);
  }

  @Get(':requestId/history')
  @RequirePermissions('service_request:read')
  history(
    @CurrentUser() principal: Principal,
    @Param('requestId', new ParseUUIDPipe()) requestId: string,
  ) {
    return this.requests.history(principal, requestId);
  }

  @Post(':requestId/review')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('service_request:review')
  review(
    @CurrentUser() principal: Principal,
    @Param('requestId', new ParseUUIDPipe()) requestId: string,
  ) {
    return this.requests.review(principal, requestId);
  }

  @Post(':requestId/request-info')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('service_request:review')
  requestInfo(
    @CurrentUser() principal: Principal,
    @Param('requestId', new ParseUUIDPipe()) requestId: string,
    @Body() body: RequiredReasonDto,
  ) {
    return this.requests.requestInfo(principal, requestId, body.reason);
  }

  @Post(':requestId/warranty-check')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('service_request:review')
  warrantyCheck(
    @CurrentUser() principal: Principal,
    @Param('requestId', new ParseUUIDPipe()) requestId: string,
  ) {
    return this.requests.warrantyCheck(principal, requestId);
  }

  @Post(':requestId/accept')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('service_request:review')
  accept(
    @CurrentUser() principal: Principal,
    @Param('requestId', new ParseUUIDPipe()) requestId: string,
  ) {
    return this.requests.accept(principal, requestId);
  }

  @Post(':requestId/reject')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('service_request:review')
  reject(
    @CurrentUser() principal: Principal,
    @Param('requestId', new ParseUUIDPipe()) requestId: string,
    @Body() body: RequiredReasonDto,
  ) {
    return this.requests.reject(principal, requestId, body.reason);
  }

  @Post(':requestId/cancel')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('service_request:read')
  cancel(
    @CurrentUser() principal: Principal,
    @Param('requestId', new ParseUUIDPipe()) requestId: string,
    @Body() body: OptionalReasonDto = new OptionalReasonDto(),
  ) {
    return this.requests.cancel(principal, requestId, body.reason);
  }

  @Post(':requestId/confirm')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('service_request:read')
  confirm(
    @CurrentUser() principal: Principal,
    @Param('requestId', new ParseUUIDPipe()) requestId: string,
  ) {
    return this.requests.confirm(principal, requestId);
  }

  @Post(':requestId/reopen')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('service_request:read')
  reopen(
    @CurrentUser() principal: Principal,
    @Param('requestId', new ParseUUIDPipe()) requestId: string,
    @Body() body: RequiredReasonDto,
  ) {
    return this.requests.reopen(principal, requestId, body.reason);
  }

  @Get(':requestId/comments')
  @RequirePermissions('service_request:read')
  comments(
    @CurrentUser() principal: Principal,
    @Param('requestId', new ParseUUIDPipe()) requestId: string,
  ) {
    return this.requests.comments(principal, requestId);
  }

  @Post(':requestId/comments')
  @RequirePermissions('service_request:read')
  addComment(
    @CurrentUser() principal: Principal,
    @Param('requestId', new ParseUUIDPipe()) requestId: string,
    @Body() body: AddCommentDto,
  ) {
    return this.requests.addComment(principal, requestId, body);
  }

  @Get(':requestId/estimates')
  @RequirePermissions('service_request:read')
  listEstimates(
    @CurrentUser() principal: Principal,
    @Param('requestId', new ParseUUIDPipe()) requestId: string,
  ) {
    return this.requests.listEstimates(principal, requestId);
  }

  @Post(':requestId/estimates')
  @RequirePermissions('cost_estimate:manage')
  createEstimate(
    @CurrentUser() principal: Principal,
    @Param('requestId', new ParseUUIDPipe()) requestId: string,
    @Body() body: CostEstimateInputDto,
  ) {
    return this.requests.createEstimate(principal, requestId, body);
  }
}

@Controller('internal/service-requests')
@AllowUserTypes('TENANT_STAFF')
export class InternalServiceRequestsController {
  constructor(private readonly requests: ServiceRequestsService) {}

  @Get(':id')
  @RequirePermissions('service_request:read')
  getReference(
    @CurrentUser() principal: Principal,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.requests.internalReference(principal, id);
  }
}

@Controller('estimates')
@AllowUserTypes('TENANT_STAFF', 'CUSTOMER')
export class CostEstimatesController {
  constructor(private readonly requests: ServiceRequestsService) {}

  @Put(':estimateId')
  @RequirePermissions('cost_estimate:manage')
  update(
    @CurrentUser() principal: Principal,
    @Param('estimateId', new ParseUUIDPipe()) estimateId: string,
    @Body() body: CostEstimateInputDto,
  ) {
    return this.requests.updateEstimate(principal, estimateId, body);
  }

  @Delete(':estimateId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('cost_estimate:manage')
  async remove(
    @CurrentUser() principal: Principal,
    @Param('estimateId', new ParseUUIDPipe()) estimateId: string,
  ): Promise<void> {
    await this.requests.deleteEstimate(principal, estimateId);
  }

  @Post(':estimateId/send')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('cost_estimate:manage')
  send(
    @CurrentUser() principal: Principal,
    @Param('estimateId', new ParseUUIDPipe()) estimateId: string,
  ) {
    return this.requests.sendEstimate(principal, estimateId);
  }

  @Post(':estimateId/revise')
  @RequirePermissions('cost_estimate:manage')
  revise(
    @CurrentUser() principal: Principal,
    @Param('estimateId', new ParseUUIDPipe()) estimateId: string,
  ) {
    return this.requests.reviseEstimate(principal, estimateId);
  }

  @Post(':estimateId/approve')
  @HttpCode(HttpStatus.OK)
  @AllowUserTypes('CUSTOMER')
  @RequirePermissions('cost_estimate:respond')
  approve(
    @CurrentUser() principal: Principal,
    @Param('estimateId', new ParseUUIDPipe()) estimateId: string,
  ) {
    return this.requests.approveEstimate(principal, estimateId);
  }

  @Post(':estimateId/reject')
  @HttpCode(HttpStatus.OK)
  @AllowUserTypes('CUSTOMER')
  @RequirePermissions('cost_estimate:respond')
  reject(
    @CurrentUser() principal: Principal,
    @Param('estimateId', new ParseUUIDPipe()) estimateId: string,
    @Body() body: OptionalReasonDto = new OptionalReasonDto(),
  ) {
    return this.requests.rejectEstimate(principal, estimateId, body);
  }
}

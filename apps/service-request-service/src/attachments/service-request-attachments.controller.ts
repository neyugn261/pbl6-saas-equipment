import { BranchScoped } from '@pbl6/auth';
import {
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
import {
  AllowUserTypes,
  CurrentUser,
  RequirePermissions,
  type Principal,
} from '@pbl6/auth';
import { PaginationQueryDto } from '@pbl6/service-kit';
import { ServiceRequestAttachmentsService } from './service-request-attachments.service';

@BranchScoped()
@Controller('service-requests/:requestId/result/attachments')
@AllowUserTypes('TENANT_STAFF', 'CUSTOMER')
@RequirePermissions('service_request:read')
export class ServiceRequestAttachmentsController {
  constructor(private readonly attachments: ServiceRequestAttachmentsService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  list(
    @CurrentUser() principal: Principal,
    @Param('requestId', ParseUUIDPipe) requestId: string,
    @Query() query: PaginationQueryDto,
  ) {
    return this.attachments.list(principal, requestId, query);
  }

  @Get(':attachmentId/download')
  @Header('Cache-Control', 'no-store')
  download(
    @CurrentUser() principal: Principal,
    @Param('requestId', ParseUUIDPipe) requestId: string,
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
  ) {
    return this.attachments.download(principal, requestId, attachmentId);
  }
}

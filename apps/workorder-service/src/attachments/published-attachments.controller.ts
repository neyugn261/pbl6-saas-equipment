import {
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Query,
  UseInterceptors,
} from '@nestjs/common';
import {
  AllowUserTypes,
  CurrentUser,
  RequirePermissions,
  type Principal,
} from '@pbl6/auth';
import { PaginationQueryDto } from '@pbl6/service-kit';
import { CompleteAttachmentDto } from './attachment.dto';
import { AttachmentErrorInterceptor } from './attachment-error.interceptor';
import { PublishedAttachmentsService } from './published-attachments.service';

@Controller('internal/service-request-attachments')
@AllowUserTypes('TENANT_STAFF', 'CUSTOMER')
@RequirePermissions('service_request:read')
@UseInterceptors(AttachmentErrorInterceptor)
export class PublishedAttachmentsController {
  constructor(private readonly service: PublishedAttachmentsService) {}
  @Get(':serviceRequestId')
  @Header('Cache-Control', 'no-store')
  list(
    @CurrentUser() p: Principal,
    @Param('serviceRequestId', ParseUUIDPipe) id: string,
    @Query() query: PaginationQueryDto,
  ) {
    return this.service.list(p, id, query);
  }
  @Get(':serviceRequestId/:attachmentId/download')
  @Header('Cache-Control', 'no-store')
  download(
    @CurrentUser() p: Principal,
    @Param('serviceRequestId', ParseUUIDPipe) srId: string,
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
    @Query() _query: CompleteAttachmentDto,
  ) {
    return this.service.download(p, srId, attachmentId);
  }
}

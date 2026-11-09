import { BranchScoped } from '@pbl6/auth';
import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
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
import { isUUID } from 'class-validator';
import { badInput } from '../common/errors';
import { AttachmentsService } from './attachments.service';
import {
  AttachmentVisibilityDto,
  CompleteAttachmentDto,
  PrepareAttachmentDto,
} from './attachment.dto';
import { AttachmentErrorInterceptor } from './attachment-error.interceptor';

function idempotencyKey(value: unknown) {
  if (typeof value !== 'string' || !isUUID(value))
    throw badInput('Idempotency-Key must be a UUID');
  return value.toLowerCase();
}
@BranchScoped()
@Controller()
@UseInterceptors(AttachmentErrorInterceptor)
@AllowUserTypes('TENANT_STAFF')
@RequirePermissions('work_order:read')
export class AttachmentsController {
  constructor(private readonly service: AttachmentsService) {}
  @Post('work-orders/:id/attachment-uploads')
  @Header('Cache-Control', 'no-store')
  prepareWO(
    @CurrentUser() p: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: PrepareAttachmentDto,
    @Headers('idempotency-key') key: string,
  ) {
    return this.service.prepare(
      p,
      id,
      'WORK_ORDER',
      input,
      idempotencyKey(key),
    );
  }
  @Post('work-orders/:id/service-report/attachment-uploads')
  @Header('Cache-Control', 'no-store')
  prepareReport(
    @CurrentUser() p: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: PrepareAttachmentDto,
    @Headers('idempotency-key') key: string,
  ) {
    return this.service.prepare(p, id, 'REPORT', input, idempotencyKey(key));
  }
  @Post('attachment-uploads/:id/complete')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  complete(
    @CurrentUser() p: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() _input: CompleteAttachmentDto,
    @Headers('idempotency-key') key: string,
  ) {
    return this.service.complete(p, id, idempotencyKey(key));
  }
  @Delete('attachment-uploads/:id')
  @HttpCode(204)
  abort(@CurrentUser() p: Principal, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.abort(p, id);
  }
  @Get('work-orders/:id/attachments')
  listWO(
    @CurrentUser() p: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() q: PaginationQueryDto,
  ) {
    return this.service.list(p, id, 'WORK_ORDER', q);
  }
  @Get('work-orders/:id/service-report/attachments')
  listReport(
    @CurrentUser() p: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() q: PaginationQueryDto,
  ) {
    return this.service.list(p, id, 'REPORT', q);
  }
  @Get('attachments/:id/download')
  @Header('Cache-Control', 'no-store')
  download(
    @CurrentUser() p: Principal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.download(p, id);
  }
  @Patch('attachments/:id')
  @RequirePermissions('work_order:manage')
  visibility(
    @CurrentUser() p: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: AttachmentVisibilityDto,
  ) {
    return this.service.visibility(p, id, input.visibility);
  }
  @Delete('attachments/:id')
  @HttpCode(204)
  delete(@CurrentUser() p: Principal, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.delete(p, id);
  }
}

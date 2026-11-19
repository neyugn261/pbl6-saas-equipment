import {
  Body,
  Controller,
  Get,
  Header,
  HttpException,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import {
  AllowUserTypes,
  BranchScoped,
  CurrentUser,
  Public,
  RequirePermissions,
  type Principal,
} from '@pbl6/auth';
import type { Request } from 'express';
import {
  InquiryDecision,
  InquiryQuery,
  PublicInquiryInput,
  PublicQrSettingInput,
} from './public-qr.dto';
import { PublicQrService } from './public-qr.service';

@Controller('public/equipment-by-qr')
export class PublicQrController {
  private windows = new Map<string, { count: number; until: number }>();
  constructor(private readonly qr: PublicQrService) {}
  private limit(request: Request, token: string, write = false) {
    const now = Date.now();
    for (const [key, row] of this.windows)
      if (row.until <= now) this.windows.delete(key);
    const key = `${write ? 'write' : 'read'}:${request.ip}:${token.slice(0, 50)}`;
    const row = this.windows.get(key) ?? { count: 0, until: now + 60000 };
    if (
      (!this.windows.has(key) && this.windows.size >= 10000) ||
      ++row.count > (write ? 5 : 30)
    )
      throw new HttpException(
        {
          code: 'PUBLIC_QR_RATE_LIMIT',
          message: 'Please wait before trying again',
        },
        429,
      );
    this.windows.set(key, row);
  }
  @Public()
  @Get(':token')
  @Header('Cache-Control', 'no-store')
  @Header('Referrer-Policy', 'no-referrer')
  lookup(@Req() req: Request, @Param('token') token: string) {
    this.limit(req, token);
    return this.qr.lookup(token);
  }
  @Public()
  @Post(':token/inquiries')
  @Header('Cache-Control', 'no-store')
  inquire(
    @Req() req: Request,
    @Param('token') token: string,
    @Body() body: PublicInquiryInput,
  ) {
    this.limit(req, token, true);
    return this.qr.inquire(token, body);
  }
}
@BranchScoped()
@AllowUserTypes('TENANT_STAFF')
@Controller()
export class PublicQrManagementController {
  constructor(private readonly qr: PublicQrService) {}
  @Get('equipment/:id/qr-codes/public')
  @RequirePermissions('qr:manage')
  settings(
    @CurrentUser() p: Principal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.qr.settings(p, id);
  }
  @Put('equipment/:id/qr-codes/public')
  @RequirePermissions('qr:manage')
  setting(
    @CurrentUser() p: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: PublicQrSettingInput,
  ) {
    return this.qr.setting(p, id, input.enabled);
  }
  @Get('public-qr-inquiries')
  @RequirePermissions('service_request:review')
  list(@CurrentUser() p: Principal, @Query() query: InquiryQuery) {
    return this.qr.list(p, query);
  }
  @Post('public-qr-inquiries/:id/decision')
  @RequirePermissions('service_request:review')
  decide(
    @CurrentUser() p: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: InquiryDecision,
  ) {
    return this.qr.decide(p, id, input);
  }
}

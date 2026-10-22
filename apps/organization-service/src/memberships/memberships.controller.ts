import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import {
  AllowUserTypes,
  CurrentUser,
  type Principal,
  RequirePermissions,
} from '@pbl6/auth';
import {
  ChangeMembershipStatusDto,
  LinkMembershipDto,
} from './dto/membership.dto';
import type { MembershipResponse } from './membership.response';
import { MembershipsService } from './memberships.service';

/** Account management (`user:*`): Tenant Admin, or Customer Admin for its own customer. */
@Controller()
@AllowUserTypes('TENANT_STAFF', 'CUSTOMER')
export class MembershipsController {
  constructor(private readonly memberships: MembershipsService) {}

  @Get('customers/:customerId/memberships')
  @RequirePermissions('user:read')
  list(
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @CurrentUser() user: Principal,
  ): Promise<MembershipResponse[]> {
    return this.memberships.list(user, customerId);
  }

  @Post('customers/:customerId/memberships')
  @RequirePermissions('user:manage')
  link(
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Body() body: LinkMembershipDto,
    @CurrentUser() user: Principal,
  ): Promise<MembershipResponse> {
    return this.memberships.link(user, customerId, body.userId);
  }

  @Post('memberships/:membershipId/status')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('user:manage')
  changeStatus(
    @Param('membershipId', ParseUUIDPipe) id: string,
    @Body() body: ChangeMembershipStatusDto,
    @CurrentUser() user: Principal,
  ): Promise<MembershipResponse> {
    return this.memberships.changeStatus(user, id, body);
  }
}

import { Injectable } from '@nestjs/common';
import { dataScope, type Principal } from '@pbl6/auth';
import { conflict, notFound } from '../common/errors';
import { assertCustomerVisible } from '../common/scope';
import { CustomersService } from '../customers/customers.service';
import { IdentityClient } from '../identity/identity.client';
import { assertCanManageUser, requireUser } from '../identity/user-checks';
import type { ChangeMembershipStatusDto } from './dto/membership.dto';
import {
  type MembershipResponse,
  toMembershipResponse,
} from './membership.response';
import { MembershipsRepository } from './memberships.repository';

/**
 * Links CUSTOMER accounts to customers (ADR 0006): a Tenant Admin for any
 * customer of the tenant, a Customer Admin only for CUSTOMER_USER accounts of
 * its own customer.
 */
@Injectable()
export class MembershipsService {
  constructor(
    private readonly memberships: MembershipsRepository,
    private readonly customers: CustomersService,
    private readonly identity: IdentityClient,
  ) {}

  async list(caller: Principal, customerId: string): Promise<MembershipResponse[]> {
    const scope = dataScope(caller);
    await this.customers.load(scope, customerId);
    const rows = await this.memberships.list(scope.tenantId, customerId);
    return rows.map(toMembershipResponse);
  }

  async link(
    caller: Principal,
    customerId: string,
    userId: string,
  ): Promise<MembershipResponse> {
    const scope = dataScope(caller);
    await this.customers.load(scope, customerId);
    const user = await requireUser(
      this.identity,
      caller,
      userId,
      'CUSTOMER',
      'USER_NOT_CUSTOMER_ACCOUNT',
    );
    assertCanManageUser(caller, user);
    // Only staff may move an account away from another customer.
    const outcome = await this.memberships.link(
      scope.tenantId,
      customerId,
      userId,
      scope.customerId === null,
    );
    if (outcome.result === 'linked-to-other-customer') {
      throw conflict(
        'USER_LINKED_TO_OTHER_CUSTOMER',
        'The account belongs to another customer',
      );
    }
    return toMembershipResponse(outcome.membership);
  }

  async changeStatus(
    caller: Principal,
    id: string,
    input: ChangeMembershipStatusDto,
  ): Promise<MembershipResponse> {
    const scope = dataScope(caller);
    const membership = await this.memberships.find(scope.tenantId, id);
    if (!membership) throw notFound('MEMBERSHIP_NOT_FOUND', 'Membership not found');
    assertCustomerVisible(scope, membership.customerId, 'MEMBERSHIP_NOT_FOUND');
    if (scope.customerId !== null) {
      // A Customer Admin may not deactivate itself or another Customer Admin.
      const user = await requireUser(
        this.identity,
        caller,
        membership.userId,
        'CUSTOMER',
        'USER_NOT_CUSTOMER_ACCOUNT',
      );
      assertCanManageUser(caller, user);
    }
    if (input.status === 'ACTIVE') {
      // Never re-link an account to a deleted customer.
      await this.customers.load(scope, membership.customerId);
    }
    const updated = await this.memberships.changeStatus(id, input.status);
    if (!updated) {
      throw conflict('INVALID_STATE_TRANSITION', `The membership is already ${input.status}`);
    }
    return toMembershipResponse(updated);
  }
}

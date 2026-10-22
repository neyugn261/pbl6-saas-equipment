import type { CustomerUserMembership } from '../generated/prisma/client.js';

export interface MembershipResponse {
  id: string;
  customerId: string;
  userId: string;
  status: string;
  updatedAt: Date;
}

export function toMembershipResponse(
  membership: CustomerUserMembership,
): MembershipResponse {
  return {
    id: membership.id,
    customerId: membership.customerId,
    userId: membership.userId,
    status: membership.status,
    updatedAt: membership.updatedAt,
  };
}

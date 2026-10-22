import { IsIn, IsUUID } from 'class-validator';
import { ACTIVE_STATUSES, type ActiveStatus } from '../../common/validation';

export class LinkMembershipDto {
  @IsUUID()
  userId: string;
}

export class ChangeMembershipStatusDto {
  @IsIn(ACTIVE_STATUSES)
  status: ActiveStatus;
}

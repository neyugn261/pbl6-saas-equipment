import { PaginationQueryDto } from '@pbl6/service-kit';
import { IsInt, Min, IsIn, IsISO8601, IsString, IsUUID, Matches, MaxLength, ValidateIf } from 'class-validator';
export const HANDOVER_STATUSES = ['DRAFT', 'PENDING_CUSTOMER_CONFIRMATION', 'REJECTED', 'EXPIRED', 'CANCELLED', 'ACTIVATED'] as const;
export class CreateHandoverDto {
  @IsUUID() equipmentId: string;
  @IsISO8601({ strict: true }) expiresAt: string;
  @IsISO8601({ strict: true }) deliveryAt: string;
  @IsString() @Matches(/\S/) @MaxLength(2000) condition: string;
  @ValidateIf((_, v) => v !== undefined) @IsString() @MaxLength(4000) notes?: string;
}
export class HandoverQuery extends PaginationQueryDto {
  @ValidateIf((_, v) => v !== undefined) @IsIn(HANDOVER_STATUSES) status?: string;
  @ValidateIf((_, v) => v !== undefined) @IsUUID() equipmentId?: string;
  @ValidateIf((_, v) => v !== undefined) @IsString() @MaxLength(100) q?: string;
}
export class HandoverDecisionDto {
  // Legacy handovers accept an empty body; new registration handovers require the viewed version.
  @ValidateIf((_, v) => v !== undefined) @IsInt() @Min(1) expectedVersion?: number;
}
export class RejectHandoverDto extends HandoverDecisionDto {
  @IsString() @Matches(/\S/) @MaxLength(2000) reason: string;
}
export class EmptyHandoverDto {}

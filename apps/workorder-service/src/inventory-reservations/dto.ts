import { Transform } from 'class-transformer';
import { IsIn, IsUUID, Matches } from 'class-validator';

export class InventoryReservationQueryDto {}

export class InventoryReservationDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toLowerCase() : value,
  )
  @IsUUID()
  requestId: string;

  @Matches(/^[0-9a-f]{64}$/)
  fingerprint: string;
}
export class SettleInventoryReservationDto extends InventoryReservationDto {
  @IsIn(['COMMITTED', 'ABORTED'])
  outcome: 'COMMITTED' | 'ABORTED';
}

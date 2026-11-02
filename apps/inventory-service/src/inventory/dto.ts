import { Transform } from 'class-transformer';
import {
  IsIn,
  IsBoolean,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { PaginationQueryDto } from '@pbl6/service-kit';

const supplied = (_: unknown, value: unknown) => value !== undefined;
const nullable = (_: unknown, value: unknown) =>
  value !== undefined && value !== null;
const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
export const QUANTITY = /^(0|[1-9][0-9]{0,9})(\.[0-9]{1,2})?$/;
export const MONEY = /^(0|[1-9][0-9]{0,11})(\.[0-9]{1,2})?$/;
export class PartInput {
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(100) sku: string;
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(200) name: string;
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(30) unit: string;
  @ValidateIf(supplied) @IsBoolean() allowFractional?: boolean;
  @ValidateIf(nullable) @IsString() @MaxLength(4000) description?:
    string | null;
}
export class PartPatch {
  @ValidateIf(supplied)
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;
  @ValidateIf(nullable) @IsString() @MaxLength(4000) description?:
    string | null;
  @ValidateIf(supplied) @IsIn(['ACTIVE', 'INACTIVE']) status?: string;
}
export class WarehouseInput {
  @IsUUID() branchId: string;
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(50) code: string;
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(150) name: string;
  @ValidateIf(nullable) @IsString() @MaxLength(4000) address?: string | null;
}
export class WarehousePatch {
  @ValidateIf(supplied)
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  name?: string;
  @ValidateIf(nullable) @IsString() @MaxLength(4000) address?: string | null;
  @ValidateIf(supplied) @IsIn(['ACTIVE', 'INACTIVE']) status?: string;
}
export class PartQuery extends PaginationQueryDto {
  @ValidateIf(supplied) @IsIn(['ACTIVE', 'INACTIVE']) status?: string;
  @ValidateIf(supplied) @IsString() @MaxLength(100) q?: string;
}
export class WarehouseQuery extends PaginationQueryDto {
  @ValidateIf(supplied) @IsIn(['ACTIVE', 'INACTIVE']) status?: string;
  @ValidateIf(supplied) @IsUUID() branchId?: string;
}
export class StockQuery extends PaginationQueryDto {
  @ValidateIf(supplied) @IsUUID() warehouseId?: string;
  @ValidateIf(supplied) @IsUUID() partId?: string;
  @ValidateIf(supplied) @IsIn(['true', 'false']) lowStock?: string;
}
export class LedgerQuery extends PaginationQueryDto {
  @ValidateIf(supplied) @IsUUID() warehouseId?: string;
  @ValidateIf(supplied) @IsUUID() partId?: string;
  @ValidateIf(supplied) @IsUUID() workOrderId?: string;
  @ValidateIf(supplied)
  @IsIn([
    'RECEIVE',
    'ISSUE',
    'RETURN',
    'ADJUST_IN',
    'ADJUST_OUT',
    'RELEASE',
    'SCRAP',
  ])
  type?: string;
  @ValidateIf(supplied) @IsUUID() relatedTransactionId?: string;
}
export class OperationQuery extends PaginationQueryDto {
  @ValidateIf(supplied) @IsUUID() workOrderId?: string;
  @ValidateIf(supplied)
  @IsIn(['PENDING', 'COMMITTED', 'ABORTED'])
  state?: string;
  @ValidateIf(supplied) @IsIn(['true', 'false']) reservationPending?: string;
}
export interface InventoryQuery extends PaginationQueryDto {
  q?: string;
  status?: string;
  branchId?: string;
  warehouseId?: string;
  partId?: string;
  workOrderId?: string;
  type?: string;
  lowStock?: string;
  state?: string;
  reservationPending?: string;
  relatedTransactionId?: string;
}
export class ThresholdInput {
  @Matches(QUANTITY) minQuantity: string;
}
export class StockMutation {
  @IsUUID() warehouseId: string;
  @IsUUID() partId: string;
  @Matches(QUANTITY) quantity: string;
  @ValidateIf(supplied)
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  note?: string;
  @ValidateIf(supplied)
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  documentReference?: string;
}
export class AdjustInput extends StockMutation {
  @IsIn(['ADJUST_IN', 'ADJUST_OUT']) direction: 'ADJUST_IN' | 'ADJUST_OUT';
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  declare note: string;
  @IsIn(['COUNT_VARIANCE', 'DAMAGE', 'LOSS', 'CORRECTION', 'OTHER'])
  reasonCode: string;
  @ValidateIf(supplied) @IsUUID() relatedTransactionId?: string;
}
export class IssueInput extends StockMutation {
  @ValidateIf(supplied) @Matches(MONEY) unitCost?: string;
  @ValidateIf(supplied) @Matches(/^[A-Z]{3}$/) unitCostCurrency?: string;
}
export class ReturnInput {
  @Matches(QUANTITY) quantity: string;
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(2000) note: string;
  @IsIn(['GOOD', 'DAMAGED', 'PENDING_INSPECTION']) condition: string;
}
export class InspectionInput {
  @Matches(QUANTITY) quantity: string;
  @IsIn(['RELEASE', 'SCRAP']) disposition: 'RELEASE' | 'SCRAP';
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(2000) note: string;
}
export class ConfirmUseInput {
  @Matches(QUANTITY) quantity: string;
  @IsUUID() serviceReportId: string;
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  customerReason: string;
  @IsIn([
    'NOT_APPLICABLE',
    'RETURNED_TO_CUSTOMER',
    'RETAINED_FOR_REVIEW',
    'DISPOSED_WITH_CONSENT',
  ])
  removedPartDisposition: string;
  @ValidateIf(supplied)
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  removedPartNote?: string;
  @ValidateIf(supplied)
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  note?: string;
}
export class ReverseUseInput {
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(2000) note: string;
}
export class AuditQuery extends PaginationQueryDto {
  @ValidateIf(supplied)
  @IsIn(['PART', 'WAREHOUSE', 'STOCK'])
  entityType?: string;
  @ValidateIf(supplied) @IsUUID() entityId?: string;
}

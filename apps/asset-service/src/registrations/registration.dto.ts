import { plainToInstance } from 'class-transformer';
import { BadRequestException } from '@nestjs/common';
import {
  IsIn,
  IsInt,
  IsISO8601,
  IsObject,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  validateSync,
} from 'class-validator';
import { PaginationQueryDto } from '@pbl6/service-kit';
import { CreateEquipmentDto } from '../equipment/dto/equipment.dto';
import { CreateWarrantyDto } from '../warranties/warranty.dto';

const present = (_: unknown, value: unknown) => value !== undefined;
export const REGISTRATION_STATUSES = [
  'DRAFT',
  'PENDING_MAINTENANCE',
  'COMPLETED',
] as const;
export class CreateRegistrationDto {
  @IsObject() equipment: Record<string, unknown>;
  @ValidateIf(present) @IsObject() warranty?: Record<string, unknown>;
  @ValidateIf(present) @IsObject() maintenance?: Record<string, unknown>;
}
export class VersionDto {
  @IsInt() @Min(1) expectedVersion: number;
}
export class PatchRegistrationDto extends VersionDto {
  @ValidateIf(present) @IsObject() warranty?: Record<string, unknown>;
  @ValidateIf(present) @IsObject() maintenance?: Record<string, unknown>;
}
export class EmptyRegistrationDto {}
export class RegistrationQuery extends PaginationQueryDto {
  @ValidateIf(present) @IsIn(REGISTRATION_STATUSES) status?: string;
  @ValidateIf(present) @IsUUID() equipmentId?: string;
  @ValidateIf(present) @IsUUID() createKey?: string;
}
export class InitialPlanDto {
  @IsString() @MinLength(1) @MaxLength(200) name: string;
  @ValidateIf((_, v) => v !== undefined && v !== null)
  @IsString()
  @MaxLength(10000)
  description?: string | null;
  @IsIn(['DAY', 'WEEK', 'MONTH', 'YEAR']) frequencyUnit:
    'DAY' | 'WEEK' | 'MONTH' | 'YEAR';
  @IsInt() @Min(1) @Max(10000) frequencyValue: number;
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsISO8601({ strict: true })
  nextDueDate: string;
}
class ExistingEquipmentDto {
  @IsUUID() id: string;
}
class KeepWarrantyDto {
  @IsUUID() warrantyId: string;
}
class KeepPlanDto {
  @IsUUID() planId: string;
}
class NoneDto {
  @IsString() @Matches(/\S/) @MaxLength(2000) reason: string;
}

type Undecided = { mode: 'UNCONFIRMED' };
type None = { mode: 'NONE'; reason: string };
export type WarrantyChoice =
  | Undecided
  | None
  | ({ mode: 'CREATE' } & CreateWarrantyDto)
  | { mode: 'KEEP'; warrantyId: string };
export type MaintenanceChoice =
  | Undecided
  | None
  | ({ mode: 'CREATE' } & InitialPlanDto)
  | { mode: 'KEEP'; planId: string };
export type EquipmentSource =
  { mode: 'NEW'; data: CreateEquipmentDto } | { mode: 'EXISTING'; id: string };

export function invalidInput(message: string): never {
  throw new BadRequestException({ code: 'VALIDATION_FAILED', message });
}
export function dto<T extends object>(type: new () => T, raw: unknown): T {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    invalidInput('Expected an object');
  const value = plainToInstance(type, raw);
  if (
    validateSync(value, {
      whitelist: true,
      forbidNonWhitelisted: true,
      forbidUnknownValues: true,
    }).length
  )
    invalidInput(`Invalid ${type.name} fields`);
  return value;
}
export function equipmentSource(raw: Record<string, unknown>): EquipmentSource {
  if (
    raw.mode === 'NEW' &&
    Object.keys(raw).every((k) => ['mode', 'data'].includes(k))
  )
    return { mode: 'NEW', data: dto(CreateEquipmentDto, raw.data) };
  if (
    raw.mode === 'EXISTING' &&
    Object.keys(raw).every((k) => ['mode', 'id'].includes(k))
  )
    return {
      mode: 'EXISTING',
      id: dto(ExistingEquipmentDto, { id: raw.id }).id,
    };
  return invalidInput('Choose NEW equipment data or an EXISTING equipment ID');
}
export function warrantyChoice(
  raw: unknown = { mode: 'UNCONFIRMED' },
): WarrantyChoice {
  return choice(raw, 'warranty') as WarrantyChoice;
}
export function maintenanceChoice(
  raw: unknown = { mode: 'UNCONFIRMED' },
): MaintenanceChoice {
  return choice(raw, 'maintenance') as MaintenanceChoice;
}
function choice(
  raw: unknown,
  kind: 'warranty' | 'maintenance',
): WarrantyChoice | MaintenanceChoice {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    invalidInput('Invalid policy choice');
  const { mode, ...data } = raw as Record<string, unknown>;
  if (mode === 'UNCONFIRMED' && !Object.keys(data).length) return { mode };
  if (mode === 'NONE') return { mode, ...dto(NoneDto, data) };
  if (mode === 'KEEP')
    return kind === 'warranty'
      ? { mode, ...dto(KeepWarrantyDto, data) }
      : { mode, ...dto(KeepPlanDto, data) };
  if (mode === 'CREATE') {
    if (kind === 'maintenance') {
      const value = dto(InitialPlanDto, data);
      if (!value.name.trim()) invalidInput('Plan name cannot be blank');
      // Validate before freezing Asset input; Maintenance owns recurring scheduling.
      const anchor = new Date(`${value.nextDueDate}T00:00:00.000Z`);
      const year = anchor.getUTCFullYear();
      const followingYear = ['MONTH', 'YEAR'].includes(value.frequencyUnit)
        ? Math.floor(
            (year * 12 +
              anchor.getUTCMonth() +
              value.frequencyValue *
                (value.frequencyUnit === 'YEAR' ? 12 : 1)) /
              12,
          )
        : new Date(
            anchor.getTime() +
              value.frequencyValue *
                (value.frequencyUnit === 'WEEK' ? 7 : 1) *
                86_400_000,
          ).getUTCFullYear();
      if (!Number.isFinite(year) || year < 1 || followingYear > 9999)
        invalidInput('Schedule exceeds the supported calendar');
      return { mode, ...value };
    }
    const value = dto(CreateWarrantyDto, data);
    if (value.endDate < value.startDate || !value.warrantyType.trim())
      invalidInput('Invalid warranty period or type');
    return { mode, ...value };
  }
  return invalidInput('Invalid policy mode or fields');
}

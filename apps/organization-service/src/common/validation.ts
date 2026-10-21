import { PaginationQueryDto } from '@pbl6/service-kit';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';

export const ACTIVE_STATUSES = ['ACTIVE', 'INACTIVE'] as const;
export type ActiveStatus = (typeof ACTIVE_STATUSES)[number];

export const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/**
 * Optional in a PATCH body, but `null` is still validated (and refused by the
 * next validator) — unlike `@IsOptional()`, which skips null.
 */
export const IfPresent = () =>
  ValidateIf((_object: object, value: unknown) => value !== undefined);

/** `?page&pageSize&q&status` of the list endpoints. */
export class ListQueryDto extends PaginationQueryDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @IsIn(ACTIVE_STATUSES)
  status?: ActiveStatus;
}

/** Prisma `where` fragment: `q` matches code or name, case-insensitive. */
export function codeOrNameMatches(q: string | undefined) {
  if (!q) return {};
  return {
    OR: [
      { code: { contains: q, mode: 'insensitive' as const } },
      { name: { contains: q, mode: 'insensitive' as const } },
    ],
  };
}

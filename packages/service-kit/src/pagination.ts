import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

/**
 * `?page=1&pageSize=20` for list endpoints. Extend it with filters:
 * `class ListEquipmentQuery extends PaginationQueryDto { @IsOptional() status?: string }`.
 */
export class PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  pageSize: number = DEFAULT_PAGE_SIZE;
}

/** Response shape of every list endpoint. */
export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

/** `skip`/`take` for Prisma `findMany`. */
export function toSkipTake(query: Pick<PaginationQueryDto, 'page' | 'pageSize'>): {
  skip: number;
  take: number;
} {
  return { skip: (query.page - 1) * query.pageSize, take: query.pageSize };
}

export function toPage<T>(
  items: T[],
  total: number,
  query: Pick<PaginationQueryDto, 'page' | 'pageSize'>,
): Page<T> {
  return { items, page: query.page, pageSize: query.pageSize, total };
}

import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { MONEY, QUANTITY } from './dto';

export const notFound = () =>
  new NotFoundException({
    code: 'INVENTORY_NOT_FOUND',
    message: 'Inventory resource not found',
  });
export const conflict = (code: string, message: string) =>
  new ConflictException({ code, message });
export const invalid = (code: string, message: string) =>
  new UnprocessableEntityException({ code, message });
export function decimal(
  value: string,
  positive = false,
  money = false,
): Prisma.Decimal {
  if (typeof value !== 'string' || !(money ? MONEY : QUANTITY).test(value)) {
    throw new BadRequestException({
      code: 'INVALID_DECIMAL',
      message: 'Use a decimal string with at most two fractional digits',
    });
  }
  const result = new Prisma.Decimal(value);
  if (positive && result.lte(0))
    throw new BadRequestException({
      code: 'QUANTITY_MUST_BE_POSITIVE',
      message: 'Quantity must be greater than zero',
    });
  return result;
}
export function nonEmptyPatch(input: object) {
  if (!Object.values(input).some((v) => v !== undefined))
    throw new BadRequestException({
      code: 'EMPTY_PATCH',
      message: 'Supply at least one field',
    });
}
/** Fixed decimals and JSON dates; never expose Prisma internals or floating-point quantities. */
export function json<T>(value: T): Prisma.InputJsonValue {
  if (value instanceof Prisma.Decimal) return value.toFixed(2);
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((v) => json(v));
  if (value !== null && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, v === null ? null : json(v)]),
    );
  return value as Prisma.InputJsonValue;
}
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object')
    return `{${Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(',')}}`;
  return JSON.stringify(value);
}
export function fingerprint(operation: string, request: unknown) {
  return createHash('sha256')
    .update(canonical({ operation, request }))
    .digest('hex');
}
export function lowStockPolicy(
  quantity: Prisma.Decimal,
  minimum: Prisma.Decimal,
  latched: boolean,
) {
  const low = quantity.lt(minimum);
  return { low, emit: low && !latched, clear: !low && latched };
}

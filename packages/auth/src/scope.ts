import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { Principal } from './principal';

/**
 * What a caller may see inside a tenant database:
 * - TENANT_STAFF: the whole tenant (`customerId` null);
 * - CUSTOMER: only rows of its own customer (ADR 0003).
 */
export interface DataScope {
  tenantId: string;
  /** NULL = no customer restriction (staff). */
  customerId: string | null;
}

/**
 * Scope for tenant-owned data. PLATFORM_STAFF has no tenant scope (403
 * TENANT_SCOPE_REQUIRED); a CUSTOMER account without a linked customer gets
 * 403 CUSTOMER_SCOPE_MISSING instead of seeing the whole tenant.
 */
export function dataScope(principal: Principal): DataScope {
  if (principal.tenantId === null) {
    throw new ForbiddenException({
      code: 'TENANT_SCOPE_REQUIRED',
      message: 'This operation requires a tenant account',
    });
  }
  if (principal.userType === 'CUSTOMER') {
    if (principal.customerId === null) {
      throw new ForbiddenException({
        code: 'CUSTOMER_SCOPE_MISSING',
        message: 'The account is not linked to an active customer',
      });
    }
    return { tenantId: principal.tenantId, customerId: principal.customerId };
  }
  return { tenantId: principal.tenantId, customerId: null };
}

/** `tenant_id` of the caller; 403 for PLATFORM_STAFF. */
export function requireTenantId(principal: Principal): string {
  return dataScope(principal).tenantId;
}

/**
 * Prisma `where` fragment for tables that have `tenant_id` and `customer_id`:
 * `prisma.equipment.findMany({ where: { ...scopeWhere(scope), status } })`.
 */
export function scopeWhere(scope: DataScope): {
  tenantId: string;
  customerId?: string;
} {
  return scope.customerId === null
    ? { tenantId: scope.tenantId }
    : { tenantId: scope.tenantId, customerId: scope.customerId };
}

export function isInScope(
  scope: DataScope,
  row: { tenantId: string; customerId?: string | null },
): boolean {
  if (row.tenantId !== scope.tenantId) return false;
  return scope.customerId === null || row.customerId === scope.customerId;
}

/**
 * Throws 404 for a row outside the caller's scope (or missing). 404, not 403,
 * so ids of other tenants and customers cannot be probed.
 */
export function assertInScope<T extends { tenantId: string; customerId?: string | null }>(
  scope: DataScope,
  row: T | null | undefined,
  code = 'NOT_FOUND',
): T {
  if (!row || !isInScope(scope, row)) {
    throw new NotFoundException({ code, message: 'Resource not found' });
  }
  return row;
}

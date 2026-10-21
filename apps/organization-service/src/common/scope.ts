import type { DataScope } from '@pbl6/auth';
import { notFound } from './errors';

/**
 * A CUSTOMER account only sees its own customer and what hangs below it
 * (ADR 0003). Another customer answers 404, so its id cannot be probed.
 */
export function assertCustomerVisible(
  scope: DataScope,
  customerId: string,
  code = 'CUSTOMER_NOT_FOUND',
): void {
  if (scope.customerId !== null && scope.customerId !== customerId) {
    throw notFound(code, 'Resource not found');
  }
}

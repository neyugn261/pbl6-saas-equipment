import {
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import type { Principal } from '@pbl6/auth';
import { map } from 'rxjs';

/** Also covers nested Part includes and before/after audit payloads. */
export function redactCostPrice(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactCostPrice);
  if (!value || typeof value !== 'object') return value;
  if (
    value instanceof Date ||
    typeof (value as { toJSON?: unknown }).toJSON === 'function'
  )
    return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== 'costPrice' && key !== 'cost_price')
      .map(([key, item]) => [key, redactCostPrice(item)]),
  );
}

@Injectable()
export class PricingVisibilityInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler) {
    const user = context.switchToHttp().getRequest<{ user?: Principal }>().user;
    return next
      .handle()
      .pipe(
        map((value) =>
          user?.permissions.has('inventory:manage')
            ? value
            : redactCostPrice(value),
        ),
      );
  }
}

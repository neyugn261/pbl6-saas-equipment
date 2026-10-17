import { INestApplication, LoggerService, ValidationPipe } from '@nestjs/common';
import type { Express } from 'express';
import { correlationIdMiddleware } from './correlation';
import { HttpErrorFilter } from './errors';

export interface ConfigureAppOptions {
  /** Logger used by the error filter for 5xx errors. */
  logger?: LoggerService;
}

/**
 * HTTP pipeline shared by every service's `main.ts` and its e2e tests:
 * - no `x-powered-by` header;
 * - `x-correlation-id` read or created for each request;
 * - DTO validation that rejects unknown fields (a client-supplied `tenantId`
 *   is refused, not silently ignored);
 * - errors returned as `{ code, message, details? }`.
 */
export function configureApp(
  app: INestApplication,
  options: ConfigureAppOptions = {},
): void {
  (app.getHttpAdapter().getInstance() as Express).disable('x-powered-by');
  app.use(correlationIdMiddleware);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new HttpErrorFilter(options.logger));
  app.enableShutdownHooks();
}

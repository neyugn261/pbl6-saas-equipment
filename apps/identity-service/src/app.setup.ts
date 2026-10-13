import { INestApplication, ValidationPipe } from '@nestjs/common';
import type { Express } from 'express';

/** HTTP pipeline shared by main.ts and the e2e tests. */
export function configureApp(app: INestApplication): void {
  (app.getHttpAdapter().getInstance() as Express).disable('x-powered-by');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      // Unknown fields such as a client-supplied tenantId are rejected, not ignored.
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.enableShutdownHooks();
}

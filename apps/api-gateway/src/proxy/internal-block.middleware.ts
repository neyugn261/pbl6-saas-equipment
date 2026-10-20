import { Injectable, NestMiddleware } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';

/**
 * Blocks access to any path that contains `/internal` segment so that
 * service-to-service endpoints are never exposed through the public gateway.
 *
 * This middleware must be applied BEFORE the proxy middlewares.
 */
@Injectable()
export class InternalBlockMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const path = req.path;
    if (
      path === '/internal' ||
      path.startsWith('/internal/') ||
      path.includes('/internal/')
    ) {
      res.status(404).json({ code: 'NOT_FOUND', message: 'Not found' });
      return;
    }
    next();
  }
}

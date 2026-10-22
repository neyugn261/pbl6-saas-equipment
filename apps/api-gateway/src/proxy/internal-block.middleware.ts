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
    const rawPath = req.originalUrl.split('?')[0];
    let path = rawPath;
    try {
      path = decodeURIComponent(rawPath);
    } catch {
      // An invalid escape cannot resolve to a valid internal API route.
    }
    if (/(?:^|\/)internal(?:\/|$)/i.test(path)) {
      res.status(404).json({ code: 'NOT_FOUND', message: 'Not found' });
      return;
    }
    next();
  }
}

import { Injectable, NestMiddleware } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'node:crypto';

/**
 * Ensures every request carries a `x-correlation-id` header.
 * If the client does not send one, a UUID v4 is generated and attached.
 * The header value is also written to the response so the client can
 * correlate requests with server-side logs.
 */
@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const existing = req.headers['x-correlation-id'];
    const correlationId =
      (Array.isArray(existing) ? existing[0] : existing) ?? randomUUID();

    req.headers['x-correlation-id'] = correlationId;
    res.setHeader('x-correlation-id', correlationId);

    next();
  }
}

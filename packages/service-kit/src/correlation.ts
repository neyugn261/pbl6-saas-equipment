import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

/** Header carried by every request, outgoing service call and event. */
export const CORRELATION_ID_HEADER = 'x-correlation-id';

// Client-supplied ids are echoed in logs and headers, so only a safe charset is accepted.
const VALID_ID = /^[A-Za-z0-9._:-]{1,128}$/;

interface CorrelationContext {
  correlationId: string;
}

const storage = new AsyncLocalStorage<CorrelationContext>();

/** Correlation id of the request or event being handled, if any. */
export function getCorrelationId(): string | undefined {
  return storage.getStore()?.correlationId;
}

/** Runs `fn` with `correlationId` visible to logs, service calls and outbox writes. */
export function runWithCorrelationId<T>(correlationId: string, fn: () => T): T {
  return storage.run({ correlationId }, fn);
}

/** Accepts a valid id or creates a new one. */
export function normalizeCorrelationId(value: unknown): string {
  return typeof value === 'string' && VALID_ID.test(value)
    ? value
    : randomUUID();
}

/**
 * Express middleware: reuses the caller's `x-correlation-id` (gateway, other
 * service) or creates one, returns it in the response and keeps it for the
 * rest of the request.
 */
export function correlationIdMiddleware(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  const correlationId = normalizeCorrelationId(
    request.headers[CORRELATION_ID_HEADER],
  );
  response.setHeader(CORRELATION_ID_HEADER, correlationId);
  runWithCorrelationId(correlationId, next);
}

import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { LoggerService } from '@nestjs/common';
import type { Response } from 'express';
import { UpstreamError, UpstreamUnavailableError } from './http-client';

/** Error body of every PBL6 API (docs/api/conventions.md). */
export interface ApiErrorBody {
  /** Stable machine-readable code, e.g. `EQUIPMENT_NOT_FOUND`. */
  code: string;
  /** Human-readable message; never contains internal details. */
  message: string;
  /** Optional structured details, e.g. validation messages. */
  details?: unknown;
}

const DEFAULT_CODES: Record<number, string> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  405: 'METHOD_NOT_ALLOWED',
  409: 'CONFLICT',
  413: 'PAYLOAD_TOO_LARGE',
  415: 'UNSUPPORTED_MEDIA_TYPE',
  422: 'UNPROCESSABLE_ENTITY',
  429: 'TOO_MANY_REQUESTS',
  500: 'INTERNAL_ERROR',
  502: 'UPSTREAM_ERROR',
  503: 'SERVICE_UNAVAILABLE',
};

function defaultCode(status: number): string {
  return DEFAULT_CODES[status] ?? `HTTP_${status}`;
}

interface HttpExceptionLike {
  getStatus(): number;
  getResponse(): string | object;
  message: string;
}

// Duck-typed instead of `instanceof HttpException`, so exceptions thrown by a
// different copy of @nestjs/common (another workspace package) are still mapped.
function isHttpException(error: unknown): error is HttpExceptionLike {
  return (
    error !== null &&
    typeof error === 'object' &&
    typeof (error as HttpExceptionLike).getStatus === 'function' &&
    typeof (error as HttpExceptionLike).getResponse === 'function'
  );
}

function isPrismaKnownError(
  error: unknown,
): error is { name: string; code: string } {
  return (
    error !== null &&
    typeof error === 'object' &&
    (error as { name?: unknown }).name === 'PrismaClientKnownRequestError' &&
    typeof (error as { code?: unknown }).code === 'string'
  );
}

/** Maps any thrown value to `{ status, body }` following the API conventions. */
export function toApiError(error: unknown): {
  status: number;
  body: ApiErrorBody & Record<string, unknown>;
} {
  if (isHttpException(error)) {
    const status = error.getStatus();
    const response = error.getResponse();
    if (typeof response === 'string') {
      return { status, body: { code: defaultCode(status), message: response } };
    }
    const fields = response as Record<string, unknown>;
    // Already in our format: keep it (extra fields such as health details included).
    if (typeof fields.code === 'string') {
      return {
        status,
        body: {
          ...fields,
          code: fields.code,
          message:
            typeof fields.message === 'string' ? fields.message : error.message,
        },
      };
    }
    // ValidationPipe: { message: string[], error, statusCode }.
    if (status === HttpStatus.BAD_REQUEST && Array.isArray(fields.message)) {
      return {
        status,
        body: {
          code: 'VALIDATION_FAILED',
          message: 'Request validation failed',
          details: fields.message,
        },
      };
    }
    return {
      status,
      body: {
        code: defaultCode(status),
        message:
          typeof fields.message === 'string' ? fields.message : error.message,
      },
    };
  }
  if (error instanceof UpstreamUnavailableError) {
    return {
      status: HttpStatus.SERVICE_UNAVAILABLE,
      body: {
        code: 'UPSTREAM_UNAVAILABLE',
        message: `A required service (${error.service}) is unavailable`,
      },
    };
  }
  if (error instanceof UpstreamError) {
    return {
      status: HttpStatus.BAD_GATEWAY,
      body: {
        code: 'UPSTREAM_ERROR',
        message: `A required service (${error.service}) returned an error`,
      },
    };
  }
  if (isPrismaKnownError(error) && error.code === 'P2002') {
    return {
      status: HttpStatus.CONFLICT,
      body: {
        code: 'UNIQUE_VIOLATION',
        message: 'A record with the same unique value already exists',
      },
    };
  }
  return {
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    body: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
  };
}

/**
 * Global filter: every error leaves the service as `{ code, message, details? }`.
 * Unexpected errors are logged with their stack and returned as a generic 500,
 * so no SQL, stack trace or internal message reaches the client.
 */
@Catch()
export class HttpErrorFilter implements ExceptionFilter {
  constructor(
    private readonly logger: LoggerService = new Logger(HttpErrorFilter.name),
  ) {}

  catch(error: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const { status, body } = toApiError(error);
    if (status >= 500) {
      this.logger.error(
        { msg: 'Request failed', code: body.code, status },
        error instanceof Error ? error.stack : String(error),
        HttpErrorFilter.name,
      );
    }
    if (response.headersSent) {
      return;
    }
    response.status(status).json(body);
  }
}

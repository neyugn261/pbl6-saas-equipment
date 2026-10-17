import type { LoggerService } from '@nestjs/common';
import { getCorrelationId } from './correlation';

export const LOG_LEVELS = [
  'verbose',
  'debug',
  'log',
  'warn',
  'error',
  'fatal',
] as const;
export type LogLevelName = (typeof LOG_LEVELS)[number];

const REDACTED = '[REDACTED]';
// Keys whose values must never reach a log line.
const SENSITIVE_KEY =
  /pass(word)?|secret|token|authorization|cookie|hash|api[-_]?key/i;
const MAX_DEPTH = 5;

/** Replaces values of sensitive keys (password, token, secret, ...) recursively. */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH || value === null || typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => redact(item, depth + 1));
  }
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    result[key] = SENSITIVE_KEY.test(key) ? REDACTED : redact(item, depth + 1);
  }
  return result;
}

export interface JsonLoggerOptions {
  /** Lowest level written (default `log`, i.e. verbose/debug are dropped). */
  level?: LogLevelName;
  /** Output sink; defaults to stdout (stderr for error/fatal). Used by tests. */
  write?: (line: string, level: LogLevelName) => void;
}

const STACK_LINE = /\n\s+at /;

/**
 * Nest logger that writes one JSON object per line:
 * `{"time","level","service","context","correlationId","msg",...}`.
 *
 * Object messages are merged into the line after redaction, so
 * `logger.log({ msg: 'login failed', email })` stays structured.
 */
export class JsonLogger implements LoggerService {
  private minLevel: number;
  private readonly write: (line: string, level: LogLevelName) => void;

  constructor(
    private readonly service: string,
    options: JsonLoggerOptions = {},
  ) {
    this.minLevel = LOG_LEVELS.indexOf(options.level ?? 'log');
    this.write =
      options.write ??
      ((line, level) =>
        (level === 'error' || level === 'fatal'
          ? process.stderr
          : process.stdout
        ).write(`${line}\n`));
  }

  log(message: unknown, ...optional: unknown[]): void {
    this.emit('log', message, optional);
  }

  warn(message: unknown, ...optional: unknown[]): void {
    this.emit('warn', message, optional);
  }

  error(message: unknown, ...optional: unknown[]): void {
    this.emit('error', message, optional);
  }

  fatal(message: unknown, ...optional: unknown[]): void {
    this.emit('fatal', message, optional);
  }

  debug(message: unknown, ...optional: unknown[]): void {
    this.emit('debug', message, optional);
  }

  verbose(message: unknown, ...optional: unknown[]): void {
    this.emit('verbose', message, optional);
  }

  setLogLevels(levels: LogLevelName[]): void {
    const lowest = Math.min(...levels.map((level) => LOG_LEVELS.indexOf(level)));
    if (Number.isFinite(lowest) && lowest >= 0) {
      this.minLevel = lowest;
    }
  }

  private emit(
    level: LogLevelName,
    message: unknown,
    optional: unknown[],
  ): void {
    if (LOG_LEVELS.indexOf(level) < this.minLevel) {
      return;
    }
    // Nest convention: (message, context?) and, for errors, (message, stack?, context?).
    const params = [...optional];
    let context: string | undefined;
    let stack: string | undefined;
    if (params.length > 0 && typeof params.at(-1) === 'string') {
      const last = params.at(-1) as string;
      if (!STACK_LINE.test(last)) {
        context = last;
        params.pop();
      }
    }
    const isError = level === 'error' || level === 'fatal';
    if (isError && params.length > 0 && typeof params[0] === 'string') {
      stack = params.shift() as string;
    }
    if (params[0] instanceof Error) {
      stack = (params.shift() as Error).stack;
    }

    const line: Record<string, unknown> = {
      time: new Date().toISOString(),
      level,
      service: this.service,
    };
    if (context) line.context = context;
    const correlationId = getCorrelationId();
    if (correlationId) line.correlationId = correlationId;

    if (message instanceof Error) {
      line.msg = message.message;
      stack ??= message.stack;
    } else if (message !== null && typeof message === 'object') {
      Object.assign(line, redact(message));
    } else {
      line.msg = String(message);
    }
    if (stack) line.stack = stack;
    if (params.length > 0) line.extra = redact(params);

    this.write(JSON.stringify(line), level);
  }
}

/** Reads `LOG_LEVEL` (default `log`) for the service's logger. */
export function createLogger(
  service: string,
  level = process.env.LOG_LEVEL,
): JsonLogger {
  const valid = LOG_LEVELS.includes(level as LogLevelName)
    ? (level as LogLevelName)
    : 'log';
  return new JsonLogger(service, { level: valid });
}

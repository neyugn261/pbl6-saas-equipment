import { BadRequestException } from '@nestjs/common';
import { badInput } from '../common/errors';

// PostgreSQL timestamps have microsecond precision. Never silently truncate a
// fractional bound through JavaScript Date before applying the half-open range.
export const REPORT_TIMESTAMP =
  /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.(\d{1,6}))?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;

/** Calendar validity is checked by the query DTO's strict ISO8601 validator. */
export function reportTimestamp(value: string) {
  const match = REPORT_TIMESTAMP.exec(value);
  const seconds = new Date(value.replace(/\.\d+/, ''));
  if (
    !match ||
    !Number.isFinite(seconds.getTime()) ||
    seconds.getUTCFullYear() < 1 ||
    seconds.getUTCFullYear() > 9999
  )
    throw badInput(
      'Report timestamps must normalize to UTC years 0001 through 9999',
    );
  const fraction = (match[1] ?? '').padEnd(6, '0');
  const micros = BigInt(seconds.getTime()) * 1000n + BigInt(fraction);
  const digits = fraction.endsWith('000') ? fraction.slice(0, 3) : fraction;
  return { iso: seconds.toISOString().replace('.000Z', `.${digits}Z`), micros };
}

export function reportRange(from: string, to: string) {
  const start = reportTimestamp(from),
    end = reportTimestamp(to);
  if (start.micros >= end.micros)
    throw new BadRequestException({
      code: 'INVALID_REPORT_RANGE',
      message: 'from must be earlier than to',
    });
  return { from: start.iso, to: end.iso };
}

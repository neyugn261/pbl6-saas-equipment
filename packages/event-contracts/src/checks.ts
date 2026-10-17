/** Tiny runtime checks for event payloads (no schema library needed). */
export type Check = (value: unknown) => boolean;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

export const is = {
  uuid: ((value) => typeof value === 'string' && UUID.test(value)) as Check,
  string:
    (maxLength = 10_000): Check =>
    (value) =>
      typeof value === 'string' && value.length > 0 && value.length <= maxLength,
  isoDateTime: ((value) =>
    typeof value === 'string' &&
    ISO_DATE_TIME.test(value) &&
    !Number.isNaN(Date.parse(value))) as Check,
  oneOf:
    (values: readonly string[]): Check =>
    (value) =>
      typeof value === 'string' && values.includes(value),
  isoDate: ((value) =>
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value))) as Check,
  /** Decimal as a string, e.g. "12.50" (money and quantities never travel as floats). */
  decimal: ((value) => typeof value === 'string' && /^-?\d{1,12}(\.\d{1,4})?$/.test(value)) as Check,
  nullable:
    (check: Check): Check =>
    (value) =>
      value === null || check(value),
};

/**
 * Problems of `value` against `shape`. Extra fields are allowed: a producer
 * may add an optional field without a new version (consumers ignore it).
 */
export function shapeProblems(
  value: unknown,
  shape: Record<string, Check>,
): string[] {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return ['payload must be an object'];
  }
  const record = value as Record<string, unknown>;
  return Object.entries(shape)
    .filter(([key, check]) => !check(record[key]))
    .map(([key]) => `${key} is missing or invalid`);
}

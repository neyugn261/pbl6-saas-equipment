import { createHash } from 'node:crypto';
import { isUUID } from 'class-validator';
export function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, v]) => [key, canonical(v)]),
    );
  if (typeof value === 'string')
    return isUUID(value) ? value.toLowerCase() : value.trim();
  return value;
}
export const inputHash = (value: unknown) =>
  createHash('sha256')
    .update(JSON.stringify(canonical(value)))
    .digest('hex');

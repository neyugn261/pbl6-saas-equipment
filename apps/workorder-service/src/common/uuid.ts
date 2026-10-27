/** PostgreSQL UUID equality is case-insensitive; logical checks and lock keys must agree. */
export function sameUuid(
  a: string | null | undefined,
  b: string | null | undefined,
) {
  return (
    typeof a === 'string' &&
    typeof b === 'string' &&
    a.toLowerCase() === b.toLowerCase()
  );
}

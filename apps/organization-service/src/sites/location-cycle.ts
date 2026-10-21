/** Deepest tree a site may hold; guards the walk against corrupt data. */
export const MAX_LOCATION_DEPTH = 64;

/**
 * True when making `newParentId` the parent of `id` would put `id` among its
 * own ancestors. Walks up from the new parent with `parentOf` (null = root).
 */
export async function createsCycle(
  id: string,
  newParentId: string,
  parentOf: (locationId: string) => Promise<string | null>,
): Promise<boolean> {
  let current: string | null = newParentId;
  for (let depth = 0; current !== null; depth += 1) {
    if (current === id || depth > MAX_LOCATION_DEPTH) return true;
    current = await parentOf(current);
  }
  return false;
}

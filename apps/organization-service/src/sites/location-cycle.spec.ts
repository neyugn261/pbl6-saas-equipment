import { createsCycle, MAX_LOCATION_DEPTH } from './location-cycle';

/** building ← floor ← room ← area; `other` is a second root. */
const tree: Record<string, string | null> = {
  building: null,
  floor: 'building',
  room: 'floor',
  area: 'room',
  other: null,
};
const parentOf = async (id: string) => tree[id] ?? null;

describe('createsCycle', () => {
  it('allows a move under an unrelated branch of the tree', async () => {
    await expect(createsCycle('room', 'other', parentOf)).resolves.toBe(false);
    await expect(createsCycle('area', 'building', parentOf)).resolves.toBe(false);
  });

  it('refuses a location as its own parent', async () => {
    await expect(createsCycle('floor', 'floor', parentOf)).resolves.toBe(true);
  });

  it('refuses a move under one of its descendants', async () => {
    await expect(createsCycle('building', 'area', parentOf)).resolves.toBe(true);
    await expect(createsCycle('floor', 'room', parentOf)).resolves.toBe(true);
  });

  it('stops on a chain deeper than the limit', async () => {
    const deep = async (id: string) => `n${Number(id.slice(1)) + 1}`;
    await expect(createsCycle('x', 'n0', deep)).resolves.toBe(true);
    expect(MAX_LOCATION_DEPTH).toBeGreaterThan(4);
  });
});

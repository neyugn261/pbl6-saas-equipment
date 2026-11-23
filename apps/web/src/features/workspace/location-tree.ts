export type LocationRow = {
  id: string;
  name: string;
  parentId?: string | null;
  type?: string;
  code?: string | null;
  status?: string;
};
export type LocationNode = LocationRow & {
  children: LocationNode[];
  equipmentCount: number | null;
};

/** Flat Organization data remains authoritative; broken ancestry never hides a node. */
export function buildLocationTree(
  rows: LocationRow[],
  counts?: Record<string, number>,
) {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const nodes = new Map(
    rows.map((row) => [
      row.id,
      {
        ...row,
        children: [],
        equipmentCount: counts ? (counts[row.id] ?? 0) : null,
      } as LocationNode,
    ]),
  );
  const roots: LocationNode[] = [];
  let invalidAncestry = false;
  for (const row of rows) {
    const seen = new Set([row.id]);
    let ancestor = row.parentId;
    let valid = true;
    while (ancestor) {
      if (seen.has(ancestor) || !byId.has(ancestor)) {
        valid = false;
        break;
      }
      seen.add(ancestor);
      ancestor = byId.get(ancestor)?.parentId;
    }
    const node = nodes.get(row.id)!;
    if (valid && row.parentId) nodes.get(row.parentId)!.children.push(node);
    else {
      roots.push(node);
      if (!valid) invalidAncestry = true;
    }
  }
  function total(node: LocationNode): number {
    const sum = node.children.reduce(
      (n, child) => n + total(child),
      counts?.[node.id] ?? 0,
    );
    node.equipmentCount = counts ? sum : null;
    return sum;
  }
  roots.forEach(total);
  return { roots, invalidAncestry };
}

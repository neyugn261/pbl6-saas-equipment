export type DisplayKind = 'technician' | 'branch' | 'warehouse' | 'part' | 'user' | 'site' | 'equipment' | 'customer' | 'workOrder';
const fallback: Record<DisplayKind, string> = {
  technician: 'Kỹ thuật viên không xác định', branch: 'Chi nhánh không xác định',
  warehouse: 'Kho không xác định', part: 'Phụ tùng không xác định', user: 'Nhân viên không xác định',
  site: 'Địa điểm không xác định', equipment: 'Thiết bị không xác định', customer: 'Khách hàng không xác định',
  workOrder: 'Lệnh công việc không xác định',
};
const technicalId = /\b[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\b/gi;
export function hideTechnicalIds(value: string, replacement = ''): string {
  return value.replace(technicalId, replacement).trim();
}
const text = (value: unknown) => typeof value === 'string' ? hideTechnicalIds(value) || null : null;
type Label = { name?: unknown; code?: unknown; sku?: unknown } | null;

/** Historical snapshots win. IDs deliberately are not accepted as label candidates. */
export function displayName(kind: DisplayKind, current?: Label, snapshot?: Label): string {
  return text(snapshot?.name) ?? text(snapshot?.code) ?? text(snapshot?.sku) ??
    text(current?.name) ?? text(current?.code) ?? text(current?.sku) ?? fallback[kind];
}
export function technicianName(name: unknown, code?: unknown): string {
  const fullName = text(name), employeeCode = text(code);
  return fullName && employeeCode ? `${fullName} (${employeeCode})` : fullName ?? employeeCode ?? fallback.technician;
}

export function recordLabel(code: unknown, name: unknown, fallback: string): string {
  const labels = [text(code), text(name)].filter(Boolean);
  return [...new Set(labels)].join(' · ') || fallback;
}

export function locationOptions(
  locations: readonly { id: string; name: string; parentId?: string | null; customerSiteId?: string }[],
  siteId: string,
) {
  const rows = locations.filter(row => !row.customerSiteId || row.customerSiteId === siteId);
  const byId = new Map(rows.map(row => [row.id, row]));
  return rows.map(row => {
    const path = [row.name];
    const seen = new Set([row.id]);
    let parent = byId.get(row.parentId ?? '');
    while (parent && !seen.has(parent.id)) {
      seen.add(parent.id);
      path.unshift(parent.name);
      parent = byId.get(parent.parentId ?? '');
    }
    return { id: row.id, label: path.join(' › ') };
  }).sort((a, b) => a.label.localeCompare(b.label, 'vi'));
}

export type DisplayKind = 'technician' | 'branch' | 'warehouse' | 'part' | 'user' | 'site' | 'equipment' | 'customer' | 'workOrder';
const fallback: Record<DisplayKind, string> = {
  technician: 'Kỹ thuật viên không xác định', branch: 'Chi nhánh không xác định',
  warehouse: 'Kho không xác định', part: 'Phụ tùng không xác định', user: 'Nhân viên không xác định',
  site: 'Địa điểm không xác định', equipment: 'Thiết bị không xác định', customer: 'Khách hàng không xác định',
  workOrder: 'Lệnh công việc không xác định',
};
const text = (value: unknown) => typeof value === 'string' && value.trim() ? value.trim() : null;
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

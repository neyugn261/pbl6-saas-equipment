export type MaintenanceTerm =
  | { mode: "UNLIMITED" }
  | { mode: "YEARS"; years: number }
  | { mode: "WARRANTY_END" };

export function maintenanceTermLabel(term?: MaintenanceTerm) {
  return term?.mode === "YEARS"
    ? `Trong ${term.years} năm từ ngày bàn giao`
    : term?.mode === "WARRANTY_END"
      ? "Hết cùng với bảo hành"
      : "Vĩnh viễn (đến khi chủ động ngừng kế hoạch)";
}

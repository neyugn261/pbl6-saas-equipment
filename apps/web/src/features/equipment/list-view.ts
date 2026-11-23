export const emptyEquipmentFilters = {
  status: "",
  operationalStatus: "",
  warranty: "",
  registrationStatus: "",
  customerId: "",
  siteId: "",
  locationId: "",
  installationDateMissing: "",
  purchaseFrom: "",
  purchaseTo: "",
  handoverFrom: "",
  handoverTo: "",
  installationFrom: "",
  installationTo: "",
};
export type EquipmentFilters = typeof emptyEquipmentFilters;
export function scopeEquipmentFilters(
  filters: EquipmentFilters,
  profile?: { userType: string; customerId?: string | null } | null,
): EquipmentFilters {
  return profile?.userType === "CUSTOMER"
    ? { ...filters, customerId: profile.customerId || "" }
    : filters;
}
export function equipmentFilters(params: URLSearchParams): EquipmentFilters {
  return Object.fromEntries(
    Object.keys(emptyEquipmentFilters).map((key) => [
      key,
      params.get(key) || "",
    ]),
  ) as EquipmentFilters;
}
export function equipmentViewParams(
  filters: EquipmentFilters,
  q: string,
  page = 1,
) {
  const params = new URLSearchParams();
  if (q.trim()) params.set("q", q.trim());
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  if (page > 1) params.set("page", String(page));
  return params;
}
export const equipmentColumns = [
  { key: "context", label: "Khách hàng / vị trí" },
  { key: "serial", label: "Số sê-ri" },
  { key: "dates", label: "Mua / bàn giao / lắp đặt" },
  { key: "warranty", label: "Hiệu lực bảo hành" },
  { key: "status", label: "Tình trạng" },
] as const;

export function moveEquipmentColumn(
  columns: string[],
  key: string,
  direction: -1 | 1,
) {
  const current = columns.indexOf(key),
    target = current + direction;
  if (current < 0 || target < 0 || target >= columns.length) return columns;
  const next = [...columns];
  [next[current], next[target]] = [next[target], next[current]];
  return next;
}

export function equipmentExportColumns(columns: string[]) {
  const fields: Record<string, string[]> = {
    serial: ["serialNumber"],
    context: [
      "customer",
      "customerCode",
      "site",
      "siteCode",
      "siteAddress",
      "location",
      "locationCode",
    ],
    status: ["status", "operationalStatus"],
    dates: ["purchaseDate", "handoverDate", "installationDate"],
    warranty: ["warranty", "warrantyEndDate"],
  };
  return [
    "equipmentId",
    "updatedAt",
    "assetCode",
    "displayName",
    "model",
    ...columns.flatMap((key) => fields[key] || []),
    "exportedAt",
    "appliedFilters",
  ];
}

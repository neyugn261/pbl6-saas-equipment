import { getSessionGeneration } from "../../auth/session";

let selection = { generation: -1, branchId: "" };
export function selectedBranchId() {
  return selection.generation === getSessionGeneration()
    ? selection.branchId
    : "";
}
export function selectBranch(branchId: string) {
  selection = { generation: getSessionGeneration(), branchId };
}
/** Apply a view filter only to endpoints whose DTO actually supports branchId. */
export function withBranchFilter(area: string, path: string) {
  const branchId = selectedBranchId();
  const [pathname, search = ""] = path.split("?");
  const supported =
    (area === "workorders" &&
      [
        "/work-orders",
        "/technicians",
        "/reports/technicians",
        "/reports/work-orders/technicians",
        "/reports/work-orders/kpi",
      ].includes(pathname)) ||
    (["requests", "requestsLive"].includes(area) &&
      pathname === "/service-requests") ||
    (area === "inventory" && pathname === "/warehouses");
  if (!branchId || !supported) return path;
  const params = new URLSearchParams(search);
  // An explicit page filter takes priority; this never grants branch access.
  if (!params.has("branchId")) params.set("branchId", branchId);
  return `${pathname}?${params}`;
}

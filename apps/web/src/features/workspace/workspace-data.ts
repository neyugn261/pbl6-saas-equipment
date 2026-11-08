import { useEffect, useState } from "react";
import { api, ApiError } from "../../api/client";
import { getSessionGeneration } from "../../auth/session";

export type Row = Record<string, unknown>;
export type Area =
  | "identity"
  | "organization"
  | "assetM2"
  | "requestsLive"
  | "workorders"
  | "maintenance"
  | "inventory";
const concurrentReads = new Map<string, Promise<unknown>>();
let readGeneration = -1;
function sharedRead<T>(
  area: Area,
  path: string,
  generation: number,
  revision: number,
): Promise<T> {
  if (readGeneration !== generation) {
    concurrentReads.clear();
    readGeneration = generation;
  }
  const key = `${generation}:${area}:${path}:${revision}`;
  let pending = concurrentReads.get(key);
  if (!pending) {
    pending = api[area](path);
    concurrentReads.set(key, pending);
    const release = () => {
      if (concurrentReads.get(key) === pending) concurrentReads.delete(key);
    };
    void pending.then(release, release);
  }
  return pending as Promise<T>;
}
export const value = (input: unknown, fallback = "Chưa có thông tin") =>
  typeof input === "string" && input.trim()
    ? input
    : typeof input === "number"
      ? String(input)
      : fallback;
export const asRow = (input: unknown): Row =>
  input && typeof input === "object" && !Array.isArray(input)
    ? (input as Row)
    : {};
export function formatDate(input: unknown, time = false) {
  if (!input) return "Chưa xác nhận";
  const text = String(input);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text))
    return text.split("-").reverse().join("/");
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime())
    ? "Chưa xác nhận"
    : new Intl.DateTimeFormat("vi-VN", {
        timeZone: "Asia/Ho_Chi_Minh",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        ...(time ? { hour: "2-digit", minute: "2-digit" } : {}),
      }).format(parsed);
}
export const statusNames: Record<string, string> = {
  CREATED: "Chờ phân công",
  ASSIGNED: "Chờ nhận việc",
  ACCEPTED: "Đã nhận việc",
  TRAVELLING: "Đang di chuyển",
  IN_PROGRESS: "Đang thực hiện",
  ON_HOLD: "Tạm dừng",
  COMPLETED: "Hoàn tất",
  CANCELLED: "Đã hủy",
  ACTIVE: "Đang hoạt động",
  PAUSED: "Tạm dừng",
  INACTIVE: "Ngừng hoạt động",
  AVAILABLE: "Sẵn sàng",
  BUSY: "Đang bận",
  OFF_DUTY: "Nghỉ ca",
  PENDING: "Chờ xử lý",
  WORK_ORDER_CREATED: "Đã tạo lệnh",
  FAILED: "Cần xử lý",
  DRAFT: "Bản nháp",
  PENDING_CUSTOMER_CONFIRMATION: "Chờ khách xác nhận",
  ACTIVATED: "Đã kích hoạt",
  REJECTED: "Đã từ chối",
  EXPIRED: "Hết hạn",
  NEW: "Mới tiếp nhận",
  REVIEWING: "Đang đánh giá",
  AWAITING_INFO: "Chờ bổ sung",
  AWAITING_CUSTOMER_APPROVAL: "Chờ duyệt chi phí",
  PROCESSING: "Đang xử lý",
  RESOLVED: "Đã xử lý",
  CLOSED: "Đã đóng",
  COMMITTED: "Đã ghi nhận",
  ABORTED: "Đã hủy thao tác",
  COST_REJECTED: "Đã từ chối dự toán",
  SUSPENDED: "Tạm khóa",
  DISABLED: "Đã vô hiệu hóa",
};
export function useWorkspaceData<T>(
  area: Area,
  path: string | null,
  revision = 0,
) {
  const generation = getSessionGeneration();
  const key = `${generation}:${area}:${path}:${revision}`;
  const [state, setState] = useState<{ key: string; data?: T; error?: string }>(
    { key: "" },
  );
  useEffect(() => {
    let current = true;
    if (path)
      sharedRead<T>(area, path, generation, revision).then(
        (data) => {
          if (current && generation === getSessionGeneration())
            setState({ key, data });
        },
        (error) => {
          if (current && generation === getSessionGeneration())
            setState({
              key,
              error:
                error instanceof ApiError && error.status === 403
                  ? "Bạn chưa có quyền xem dữ liệu này."
                  : error instanceof ApiError && error.status === 401
                    ? "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại."
                    : "Chưa tải được dữ liệu. Bạn có thể thử lại sau.",
            });
        },
      );
    return () => {
      current = false;
    };
  }, [area, path, generation, key, revision]);
  return path === null
    ? { data: undefined, error: undefined, loading: false }
    : state.key === key
      ? { data: state.data, error: state.error, loading: false }
      : { data: undefined, error: undefined, loading: true };
}

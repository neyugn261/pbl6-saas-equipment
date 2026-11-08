export type DesignRole =
  | "TENANT_ADMIN"
  | "SERVICE_MANAGER"
  | "DISPATCHER"
  | "TECHNICIAN"
  | "INVENTORY_STAFF"
  | "CUSTOMER_ADMIN"
  | "CUSTOMER_USER"
  | "PLATFORM_ADMIN";
export const designRoles: Record<DesignRole, string> = {
  TENANT_ADMIN: "Chủ doanh nghiệp",
  SERVICE_MANAGER: "Quản lý dịch vụ",
  DISPATCHER: "Điều phối viên",
  TECHNICIAN: "Kỹ thuật viên web",
  INVENTORY_STAFF: "Nhân viên kho",
  CUSTOMER_ADMIN: "Quản trị khách hàng",
  CUSTOMER_USER: "Người dùng khách hàng",
  PLATFORM_ADMIN: "Quản trị nền tảng",
};
export const journeys = [
  {
    id: "request",
    name: "Gửi và theo dõi sự cố",
    roles: ["CUSTOMER_USER", "CUSTOMER_ADMIN", "SERVICE_MANAGER"],
  },
  {
    id: "case",
    name: "Trách nhiệm & trở ngại",
    roles: ["SERVICE_MANAGER", "TENANT_ADMIN"],
  },
  {
    id: "estimate",
    name: "Duyệt phạm vi & chi phí",
    roles: ["CUSTOMER_ADMIN", "CUSTOMER_USER", "SERVICE_MANAGER"],
  },
  {
    id: "dispatch",
    name: "Lịch điều phối",
    roles: ["DISPATCHER", "SERVICE_MANAGER", "TENANT_ADMIN"],
  },
  {
    id: "work",
    name: "Thực hiện & báo cáo",
    roles: ["TECHNICIAN", "SERVICE_MANAGER"],
  },
  { id: "stock", name: "Phiếu giao nhận kho", roles: ["INVENTORY_STAFF"] },
  {
    id: "closeout",
    name: "Xác nhận kết quả",
    roles: ["CUSTOMER_ADMIN", "CUSTOMER_USER", "SERVICE_MANAGER"],
  },
  {
    id: "maintenance",
    name: "Kỳ bảo trì & thay đổi",
    roles: ["SERVICE_MANAGER", "CUSTOMER_ADMIN", "DISPATCHER"],
  },
  {
    id: "handover",
    name: "Biên bản bàn giao",
    roles: ["SERVICE_MANAGER", "CUSTOMER_ADMIN", "CUSTOMER_USER"],
  },
  {
    id: "management",
    name: "Tổng quan & hồ sơ nguồn",
    roles: ["TENANT_ADMIN", "PLATFORM_ADMIN"],
  },
  {
    id: "accounts",
    name: "Tài khoản & lời mời",
    roles: [
      "TENANT_ADMIN",
      "PLATFORM_ADMIN",
      "CUSTOMER_ADMIN",
      "CUSTOMER_USER",
      "SERVICE_MANAGER",
      "DISPATCHER",
      "TECHNICIAN",
      "INVENTORY_STAFF",
    ],
  },
  {
    id: "documents",
    name: "Tài liệu & thông báo",
    roles: ["CUSTOMER_ADMIN", "CUSTOMER_USER", "SERVICE_MANAGER", "TECHNICIAN"],
  },
] as const;
export type JourneyId = (typeof journeys)[number]["id"];
export const machine = {
  name: "Bơm tuần hoàn WP-200",
  code: "TB-042",
  serial: "WP-0862",
  customer: "Công ty An Phú",
  site: "Nhà xưởng Bình An · Khu máy A",
  contact: "Nguyễn Hạnh · 0900 000 042 (minh họa)",
};
export { maintenanceDates } from "../workspace/calendar-preview";
export function overlaps(
  start: string,
  end: string,
  otherStart: string,
  otherEnd: string,
) {
  const times = [start, end, otherStart, otherEnd].map((value) =>
    Date.parse(`${value}+07:00`),
  );
  return (
    times.every(Number.isFinite) &&
    times[0] < times[1] &&
    times[2] < times[3] &&
    times[0] < times[3] &&
    times[1] > times[2]
  );
}
export function decimalHundred(input: string) {
  const match = /^(\d+)(?:[.,](\d{1,2}))?$/.exec(input.trim());
  return match
    ? BigInt(match[1]) * 100n + BigInt((match[2] ?? "").padEnd(2, "0"))
    : null;
}
export function decimalText(value: bigint) {
  return `${value / 100n}.${String(value % 100n).padStart(2, "0")}`;
}

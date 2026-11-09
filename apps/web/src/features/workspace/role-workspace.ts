export type WorkspaceRole =
  | "PLATFORM_ADMIN"
  | "TENANT_ADMIN"
  | "SERVICE_MANAGER"
  | "DISPATCHER"
  | "TECHNICIAN"
  | "INVENTORY_STAFF"
  | "CUSTOMER_ADMIN"
  | "CUSTOMER_USER";
export type NavigationItem = {
  path: string;
  label: string;
  group: string;
  icon: string;
  roles: readonly WorkspaceRole[];
};
export const roleNames: Record<WorkspaceRole, string> = {
  PLATFORM_ADMIN: "Quản trị nền tảng",
  TENANT_ADMIN: "Quản trị doanh nghiệp",
  SERVICE_MANAGER: "Quản lý dịch vụ",
  DISPATCHER: "Điều phối viên",
  TECHNICIAN: "Kỹ thuật viên",
  INVENTORY_STAFF: "Nhân viên kho",
  CUSTOMER_ADMIN: "Quản trị khách hàng",
  CUSTOMER_USER: "Người dùng khách hàng",
};
export const roleDescriptions: Record<
  WorkspaceRole,
  { title: string; description: string }
> = {
  PLATFORM_ADMIN: {
    title: "Không gian quản trị nền tảng",
    description:
      "Theo dõi doanh nghiệp sử dụng và tiếp tục các công việc quản trị.",
  },
  TENANT_ADMIN: {
    title: "Doanh nghiệp của bạn hôm nay",
    description:
      "Nắm tình hình dịch vụ và quản lý tổ chức trong một không gian.",
  },
  SERVICE_MANAGER: {
    title: "Giữ mọi việc dịch vụ trong tầm nhìn",
    description:
      "Ưu tiên yêu cầu cần quyết định, theo sát công việc và chăm sóc thiết bị.",
  },
  DISPATCHER: {
    title: "Sắp xếp công việc, kết nối đội ngũ",
    description:
      "Theo dõi lệnh chờ phân công và lịch thực hiện của kỹ thuật viên.",
  },
  TECHNICIAN: {
    title: "Sẵn sàng cho công việc tiếp theo",
    description:
      "Xem việc được giao, cập nhật tiến độ và ghi nhận kết quả thực hiện.",
  },
  INVENTORY_STAFF: {
    title: "Mỗi phụ tùng đều có hành trình rõ ràng",
    description: "Kiểm soát tồn kho, giao nhận và các giao dịch cần đối soát.",
  },
  CUSTOMER_ADMIN: {
    title: "Thiết bị của bạn được chăm sóc ra sao?",
    description:
      "Theo dõi dịch vụ, xem hồ sơ và xử lý những xác nhận đang chờ bạn.",
  },
  CUSTOMER_USER: {
    title: "Chúng tôi có thể hỗ trợ gì cho bạn?",
    description: "Tìm thiết bị, gửi yêu cầu và theo dõi từng bước xử lý.",
  },
};
const staff: WorkspaceRole[] = [
  "TENANT_ADMIN",
  "SERVICE_MANAGER",
  "DISPATCHER",
  "TECHNICIAN",
];
const customer: WorkspaceRole[] = ["CUSTOMER_ADMIN", "CUSTOMER_USER"];
const equipment: WorkspaceRole[] = [...staff, "INVENTORY_STAFF"];
const links: NavigationItem[] = [
  {
    path: "/admin/tenants",
    label: "Doanh nghiệp sử dụng",
    group: "Nền tảng",
    icon: "Building2",
    roles: ["PLATFORM_ADMIN"],
  },
  {
    path: "/admin/audit-logs",
    label: "Nhật ký quản trị",
    group: "Nền tảng",
    icon: "History",
    roles: ["PLATFORM_ADMIN"],
  },
  {
    path: "/app/service-requests",
    label: "Yêu cầu dịch vụ",
    group: "Công việc dịch vụ",
    icon: "ClipboardList",
    roles: staff,
  },
  {
    path: "/app/work-orders",
    label: "Lệnh công việc",
    group: "Công việc dịch vụ",
    icon: "Wrench",
    roles: staff,
  },
  {
    path: "/app/technicians",
    label: "Đội ngũ kỹ thuật",
    group: "Công việc dịch vụ",
    icon: "UserCog",
    roles: ["TENANT_ADMIN", "SERVICE_MANAGER", "DISPATCHER"],
  },
  {
    path: "/app/maintenance",
    label: "Bảo trì định kỳ",
    group: "Công việc dịch vụ",
    icon: "History",
    roles: ["TENANT_ADMIN", "SERVICE_MANAGER", "DISPATCHER"],
  },
  {
    path: "/app/maintenance-history",
    label: "Lịch sử bảo trì",
    group: "Công việc dịch vụ",
    icon: "History",
    roles: ["TENANT_ADMIN", "SERVICE_MANAGER"],
  },
  {
    path: "/app/equipment",
    label: "Thiết bị",
    group: "Khách hàng & thiết bị",
    icon: "Boxes",
    roles: equipment,
  },
  {
    path: "/app/customers",
    label: "Khách hàng",
    group: "Khách hàng & thiết bị",
    icon: "Building2",
    roles: staff,
  },
  {
    path: "/app/equipment-registrations",
    label: "Đăng ký thiết bị",
    group: "Khách hàng & thiết bị",
    icon: "ClipboardList",
    roles: ["TENANT_ADMIN", "SERVICE_MANAGER"],
  },
  {
    path: "/app/equipment-handovers",
    label: "Bàn giao thiết bị",
    group: "Khách hàng & thiết bị",
    icon: "ClipboardList",
    roles: ["TENANT_ADMIN", "SERVICE_MANAGER"],
  },
  {
    path: "/app/equipment-models",
    label: "Model & chính sách",
    group: "Khách hàng & thiết bị",
    icon: "Boxes",
    roles: ["TENANT_ADMIN", "SERVICE_MANAGER"],
  },
  {
    path: "/app/equipment-history",
    label: "Lịch sử thiết bị",
    group: "Khách hàng & thiết bị",
    icon: "History",
    roles: staff,
  },
  {
    path: "/app/inventory/parts",
    label: "Phụ tùng",
    group: "Kho phụ tùng",
    icon: "Package",
    roles: ["TENANT_ADMIN", "SERVICE_MANAGER", "TECHNICIAN", "INVENTORY_STAFF"],
  },
  {
    path: "/app/inventory/warehouses",
    label: "Kho & tồn kho",
    group: "Kho phụ tùng",
    icon: "Factory",
    roles: ["TENANT_ADMIN", "SERVICE_MANAGER", "TECHNICIAN", "INVENTORY_STAFF"],
  },
  {
    path: "/app/inventory/transactions",
    label: "Giao dịch & đối soát",
    group: "Kho phụ tùng",
    icon: "SlidersHorizontal",
    roles: ["TENANT_ADMIN", "INVENTORY_STAFF"],
  },
  {
    path: "/app/organization/service-branches",
    label: "Phân bổ dịch vụ",
    group: "Quản trị doanh nghiệp",
    icon: "MapPin",
    roles: ["TENANT_ADMIN"],
  },
  {
    path: "/app/organization/branches",
    label: "Chi nhánh",
    group: "Quản trị doanh nghiệp",
    icon: "MapPin",
    roles: ["TENANT_ADMIN"],
  },
  {
    path: "/app/organization/users",
    label: "Người dùng",
    group: "Quản trị doanh nghiệp",
    icon: "Users",
    roles: ["TENANT_ADMIN"],
  },
  {
    path: "/app/organization/roles",
    label: "Vai trò & quyền",
    group: "Quản trị doanh nghiệp",
    icon: "ShieldCheck",
    roles: ["TENANT_ADMIN"],
  },
  {
    path: "/portal/equipment",
    label: "Thiết bị của chúng tôi",
    group: "Dịch vụ của bạn",
    icon: "Boxes",
    roles: customer,
  },
  {
    path: "/portal/requests",
    label: "Yêu cầu hỗ trợ",
    group: "Dịch vụ của bạn",
    icon: "ClipboardList",
    roles: customer,
  },
  {
    path: "/portal/equipment-handovers",
    label: "Bàn giao thiết bị",
    group: "Dịch vụ của bạn",
    icon: "ClipboardList",
    roles: customer,
  },
  {
    path: "/portal/maintenance",
    label: "Lịch bảo trì",
    group: "Dịch vụ của bạn",
    icon: "History",
    roles: ["CUSTOMER_ADMIN"],
  },
  {
    path: "/portal/maintenance-history",
    label: "Lịch sử bảo trì",
    group: "Dịch vụ của bạn",
    icon: "History",
    roles: ["CUSTOMER_ADMIN"],
  },
  {
    path: "/portal/equipment-history",
    label: "Lịch sử thiết bị",
    group: "Dịch vụ của bạn",
    icon: "History",
    roles: customer,
  },
  {
    path: "/portal/locations",
    label: "Địa điểm của chúng tôi",
    group: "Doanh nghiệp của bạn",
    icon: "MapPin",
    roles: customer,
  },
  {
    path: "/portal/users",
    label: "Người dùng doanh nghiệp",
    group: "Doanh nghiệp của bạn",
    icon: "Users",
    roles: ["CUSTOMER_ADMIN"],
  },
  {
    path: "/app/reports",
    label: "Báo cáo dịch vụ",
    group: "Tiện ích",
    icon: "Gauge",
    roles: ["TENANT_ADMIN", "SERVICE_MANAGER"],
  },
  {
    path: "/app/notifications",
    label: "Thông báo",
    group: "Tiện ích",
    icon: "Bell",
    roles: [...staff, "INVENTORY_STAFF"],
  },
  {
    path: "/portal/notifications",
    label: "Thông báo",
    group: "Tiện ích",
    icon: "Bell",
    roles: customer,
  },
  {
    path: "/app/profile",
    label: "Tài khoản của tôi",
    group: "Tiện ích",
    icon: "UserCog",
    roles: [...staff, "INVENTORY_STAFF"],
  },
  {
    path: "/portal/profile",
    label: "Tài khoản của tôi",
    group: "Tiện ích",
    icon: "UserCog",
    roles: customer,
  },
  {
    path: "/admin/profile",
    label: "Tài khoản của tôi",
    group: "Tiện ích",
    icon: "UserCog",
    roles: ["PLATFORM_ADMIN"],
  },
];
export function navigationFor(roles: readonly string[]) {
  return links
    .filter((item) => item.path !== "/admin/audit-logs" && item.roles.some((role) => roles.includes(role)),
    )
    .map((item) => ({
      ...item,
      label:
        roles.includes("TECHNICIAN") &&
        !roles.some((role) =>
          ["TENANT_ADMIN", "SERVICE_MANAGER", "DISPATCHER"].includes(role),
        ) &&
        item.path === "/app/work-orders"
          ? "Công việc của tôi"
          : item.label,
    }));
}
export function primaryRole(roles: readonly string[]): WorkspaceRole {
  return (
    (
      [
        "PLATFORM_ADMIN",
        "TENANT_ADMIN",
        "SERVICE_MANAGER",
        "DISPATCHER",
        "INVENTORY_STAFF",
        "TECHNICIAN",
        "CUSTOMER_ADMIN",
        "CUSTOMER_USER",
      ] as const
    ).find((role) => roles.includes(role)) ?? "CUSTOMER_USER"
  );
}

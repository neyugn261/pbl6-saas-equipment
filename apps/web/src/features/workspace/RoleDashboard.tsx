import { useState } from "react";
import ServiceManagerDashboard from "./ServiceManagerDashboard";
import RequestFollowUpQueue from "./RequestFollowUpQueue";
import { equipmentLifecycleLabel } from "./service-detail-data";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Bell,
  Boxes,
  CheckCircle2,
  ClipboardList,
  Clock3,
  Info,
  Plus,
  RefreshCw,
  ShieldCheck,
  Wrench,
} from "lucide-react";
import { useSession } from "../../auth/session";
import type { Page } from "../../types/domain";
import {
  navigationFor,
  primaryRole,
  roleDescriptions,
  roleNames,
  type WorkspaceRole,
} from "./role-workspace";
import { Badge, DataState, EmptyState, PageHeading } from "./WorkspaceUI";
import {
  asRow,
  formatDate,
  useWorkspaceData,
  value,
  type Area,
  type Row,
} from "./workspace-data";

type Metric = {
  label: string;
  description: string;
  area: Area;
  path: string;
  to: string;
};
const page = "page=1&pageSize=4";
const metrics: Record<WorkspaceRole, Metric[]> = {
  PLATFORM_ADMIN: [
    {
      label: "Doanh nghiệp sử dụng",
      description: "Trong phạm vi quản trị nền tảng",
      area: "organization",
      path: `/tenants?${page}`,
      to: "/admin/tenants",
    },
    {
      label: "Doanh nghiệp hoạt động",
      description: "Trạng thái hiện tại: Hoạt động",
      area: "organization",
      path: `/tenants?${page}&status=ACTIVE`,
      to: "/admin/tenants",
    },
  ],
  TENANT_ADMIN: [
    {
      label: "Yêu cầu mới",
      description: "Chờ bộ phận dịch vụ tiếp nhận",
      area: "requestsLive",
      path: `/service-requests?${page}&status=NEW`,
      to: "/app/service-requests?status=NEW",
    },
    {
      label: "WO chờ phân công",
      description: "Lệnh công việc mới tạo",
      area: "workorders",
      path: `/work-orders?${page}&status=CREATED`,
      to: "/app/work-orders?status=CREATED",
    },
    {
      label: "Thiết bị",
      description: "Thiết bị trong doanh nghiệp",
      area: "assetM2",
      path: `/equipment?${page}`,
      to: "/app/equipment",
    },
    {
      label: "Người dùng",
      description: "Tài khoản thuộc tổ chức",
      area: "identity",
      path: `/users?${page}`,
      to: "/app/organization/users",
    },
  ],
  SERVICE_MANAGER: [
    {
      label: "Yêu cầu mới",
      description: "Cần tiếp nhận và đánh giá",
      area: "requestsLive",
      path: `/service-requests?${page}&status=NEW`,
      to: "/app/service-requests?status=NEW",
    },
    {
      label: "WO chờ phân công",
      description: "Cần kết nối kỹ thuật viên",
      area: "workorders",
      path: `/work-orders?${page}&status=CREATED`,
      to: "/app/work-orders?status=CREATED",
    },
    {
      label: "WO tạm dừng",
      description: "Cần theo dõi nguyên nhân",
      area: "workorders",
      path: `/work-orders?${page}&status=ON_HOLD`,
      to: "/app/work-orders?status=ON_HOLD",
    },
    {
      label: "Bàn giao chờ xác nhận",
      description: "Đang chờ quản trị khách hàng",
      area: "assetM2",
      path: `/equipment-handovers?${page}&status=PENDING_CUSTOMER_CONFIRMATION`,
      to: "/app/equipment-handovers?status=PENDING_CUSTOMER_CONFIRMATION",
    },
  ],
  DISPATCHER: [
    {
      label: "WO chờ phân công",
      description: "Cần chọn người và lịch thực hiện",
      area: "workorders",
      path: `/work-orders?${page}&status=CREATED`,
      to: "/app/work-orders?status=CREATED",
    },
    {
      label: "Chờ kỹ thuật viên nhận",
      description: "Đã được phân công",
      area: "workorders",
      path: `/work-orders?${page}&status=ASSIGNED`,
      to: "/app/work-orders?status=ASSIGNED",
    },
    {
      label: "Kỹ thuật viên sẵn sàng",
      description: "Trạng thái được ghi nhận hiện tại",
      area: "workorders",
      path: `/technicians?${page}&status=AVAILABLE`,
      to: "/app/technicians?status=AVAILABLE",
    },
    {
      label: "WO tạm dừng",
      description: "Kiểm tra tác động tới lịch",
      area: "workorders",
      path: `/work-orders?${page}&status=ON_HOLD`,
      to: "/app/work-orders?status=ON_HOLD",
    },
  ],
  TECHNICIAN: [
    {
      label: "Chờ tôi nhận việc",
      description: "Lệnh được phân công cho tôi",
      area: "workorders",
      path: `/work-orders?${page}&mine=true&status=ASSIGNED`,
      to: "/app/work-orders?status=ASSIGNED",
    },
    {
      label: "Đang thực hiện",
      description: "Công việc tôi đang xử lý",
      area: "workorders",
      path: `/work-orders?${page}&mine=true&status=IN_PROGRESS`,
      to: "/app/work-orders?status=IN_PROGRESS",
    },
    {
      label: "Tạm dừng",
      description: "Theo dõi để tiếp tục khi đủ điều kiện",
      area: "workorders",
      path: `/work-orders?${page}&mine=true&status=ON_HOLD`,
      to: "/app/work-orders?status=ON_HOLD",
    },
    {
      label: "Đã hoàn tất",
      description: "Tra cứu báo cáo công việc của tôi",
      area: "workorders",
      path: `/work-orders?${page}&mine=true&status=COMPLETED`,
      to: "/app/work-orders?status=COMPLETED",
    },
  ],
  INVENTORY_STAFF: [
    {
      label: "Thao tác chờ đồng bộ",
      description: "Kiểm tra kết quả ghi kho trước khi thao tác lại",
      area: "inventory",
      path: `/inventory-operations?${page}&reservationPending=true`,
      to: "/app/inventory/transactions",
    },
    {
      label: "Tồn dưới ngưỡng",
      description: "Số cặp phụ tùng/kho đang thiếu",
      area: "inventory",
      path: `/stocks?${page}&lowStock=true`,
      to: "/app/inventory/warehouses",
    },
    {
      label: "Danh mục phụ tùng",
      description: "Phụ tùng đang được quản lý",
      area: "inventory",
      path: `/parts?${page}`,
      to: "/app/inventory/parts",
    },
    {
      label: "Kho phụ tùng",
      description: "Các kho thuộc doanh nghiệp",
      area: "inventory",
      path: `/warehouses?${page}`,
      to: "/app/inventory/warehouses",
    },
  ],
  CUSTOMER_ADMIN: [
    {
      label: "Bàn giao chờ xác nhận",
      description: "Kiểm tra nội dung trước khi chấp thuận",
      area: "assetM2",
      path: `/my/equipment-handovers?${page}&status=PENDING_CUSTOMER_CONFIRMATION`,
      to: "/portal/equipment-handovers?status=PENDING_CUSTOMER_CONFIRMATION",
    },
    {
      label: "Yêu cầu chờ duyệt phí",
      description: "Xem đúng phiên bản dự toán",
      area: "requestsLive",
      path: `/service-requests?${page}&status=AWAITING_CUSTOMER_APPROVAL`,
      to: "/portal/requests?status=AWAITING_CUSTOMER_APPROVAL",
    },
    {
      label: "Đang được xử lý",
      description: "Yêu cầu của doanh nghiệp đang mở xử lý",
      area: "requestsLive",
      path: `/service-requests?${page}&status=PROCESSING`,
      to: "/portal/requests?status=PROCESSING",
    },
    {
      label: "Thiết bị của chúng tôi",
      description: "Thiết bị trong phạm vi khách hàng",
      area: "assetM2",
      path: `/equipment?${page}`,
      to: "/portal/equipment",
    },
  ],
  CUSTOMER_USER: [
    {
      label: "Cần bổ sung thông tin",
      description: "Kiểm tra yêu cầu đang chờ phản hồi",
      area: "requestsLive",
      path: `/service-requests?${page}&status=AWAITING_INFO`,
      to: "/portal/requests?status=AWAITING_INFO",
    },
    {
      label: "Đang được xử lý",
      description: "Yêu cầu trong phạm vi tài khoản",
      area: "requestsLive",
      path: `/service-requests?${page}&status=PROCESSING`,
      to: "/portal/requests?status=PROCESSING",
    },
    {
      label: "Chờ quản trị duyệt phí",
      description: "Quản trị khách hàng sẽ xác nhận",
      area: "requestsLive",
      path: `/service-requests?${page}&status=AWAITING_CUSTOMER_APPROVAL`,
      to: "/portal/requests?status=AWAITING_CUSTOMER_APPROVAL",
    },
    {
      label: "Thiết bị của chúng tôi",
      description: "Mở hồ sơ để gửi yêu cầu hỗ trợ",
      area: "assetM2",
      path: `/equipment?${page}`,
      to: "/portal/equipment",
    },
  ],
};
function MetricCard({
  metric,
  revision,
  index,
  selected,
  onSelect,
}: {
  metric: Metric;
  revision: number;
  index: number;
  selected: boolean;
  onSelect: () => void;
}) {
  const state = useWorkspaceData<Page<Row>>(metric.area, metric.path, revision);
  const icons = [Clock3, ClipboardList, Wrench, CheckCircle2],
    Icon = icons[index % icons.length];
  return (
    <div
      className={`ws-stat ${index === 0 ? "ws-stat--amber" : index === 3 ? "ws-stat--green" : ""}`}
    >
      <button
        className="workshop-metric-pick"
        type="button"
        aria-pressed={selected}
        onClick={onSelect}
      >
        <div className="ws-stat-top">
          {metric.label}
          <span className="ws-stat-icon">
            <Icon size={17} />
          </span>
        </div>
        <strong>
          {state.loading ? "…" : state.error ? "—" : (state.data?.total ?? "—")}
        </strong>
        <small>{state.error || metric.description}</small>
      </button>
      <Link className="ws-text-link" to={metric.to}>
        Mở danh sách
        <ArrowRight size={12} />
      </Link>
    </div>
  );
}
function recordPath(metric: Metric, row: Row, customer: boolean) {
  const base = customer ? "/portal" : "/app";
  if (metric.area === "requestsLive")
    return `${base === "/portal" ? "/portal/requests" : "/app/service-requests"}/${row.id}`;
  if (metric.area === "workorders") return `${base}/work-orders/${row.id}`;
  if (metric.area === "assetM2")
    return `${base}/${metric.path.startsWith("/equipment-handovers") || metric.path.startsWith("/my/equipment-handovers") ? "equipment-handovers" : "equipment"}/${row.id}`;
  if (metric.area === "organization") return `/admin/tenants/${row.id}`;
  return metric.to;
}
export default function RoleDashboard() {
  const { profile } = useSession();
  if (!profile) return null;
  return primaryRole(profile.roles) === "SERVICE_MANAGER" ? (
    <ServiceManagerDashboard />
  ) : (
    <StandardDashboard />
  );
}

function StandardDashboard() {
  const { profile } = useSession(),
    [revision, refresh] = useState(0),
    [focusIndex, setFocusIndex] = useState(0);
  const role = primaryRole(profile?.roles ?? []),
    config = roleDescriptions[role],
    cards = metrics[role],
    focus = cards[focusIndex] ?? cards[0];
  const state = useWorkspaceData<Page<Row>>(focus.area, focus.path, revision);
  if (!profile) return null;
  const customer = profile.userType === "CUSTOMER",
    nav = navigationFor(profile.roles);
  const quick = nav
    .filter(
      (item) => !["Tiện ích", "Quản trị doanh nghiệp"].includes(item.group),
    )
    .slice(0, 4);
  const dateLabel = new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "full",
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date());
  return (
    <div className="ws-page">
      <PageHeading
        eyebrow={`${roleNames[role].toUpperCase()} · ${dateLabel}`}
        title={config.title}
        description={`Chào ${profile.fullName}. ${config.description}`}
        actions={
          <>
            <button
              className="ws-button ws-button--secondary"
              onClick={() => refresh((v) => v + 1)}
            >
              <RefreshCw size={15} />
              Cập nhật
            </button>
            {customer && (
              <Link
                className="ws-button"
                to={
                  customer
                    ? "/portal/requests/new"
                    : "/app/service-requests/new"
                }
              >
                <Plus size={16} />
                {customer ? "Yêu cầu hỗ trợ" : "Tạo yêu cầu dịch vụ"}
              </Link>
            )}
          </>
        }
      />
      <RequestFollowUpQueue unallocated />
      <div className="ws-stats">
        {cards.map((metric, index) => (
          <MetricCard
            key={metric.path}
            metric={metric}
            revision={revision}
            index={index}
            selected={focus === metric}
            onSelect={() => setFocusIndex(index)}
          />
        ))}
      </div>
      <div className="ws-grid">
        <section className="ws-card">
          <div className="ws-card-header">
            <div>
              <h2>
                {role === "PLATFORM_ADMIN"
                  ? "Doanh nghiệp gần đây"
                  : "Ưu tiên theo dõi"}
              </h2>
              <p>
                {focus.label} · Đang xem {state.data?.items.length ?? "—"} trong{" "}
                {state.data?.total ?? "—"} hồ sơ. Chọn nhóm phía trên để đổi nội
                dung.
              </p>
            </div>
            <Link className="ws-text-link" to={focus.to}>
              Mở danh sách
              <ArrowRight size={13} />
            </Link>
          </div>
          <DataState {...state} retry={() => refresh((v) => v + 1)}>
            {state.data?.items.length ? (
              <div className="ws-table-wrap">
                <table className="ws-table">
                  <thead>
                    <tr>
                      <th>HỒ SƠ</th>
                      <th>TRẠNG THÁI</th>
                      <th>GHI NHẬN</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {state.data.items.map((row) => {
                      const snapshot = asRow(row.snapshot);
                      return (
                        <tr key={String(row.id)}>
                          <td data-label="Hồ sơ">
                            <Link
                              className="ws-text-link"
                              to={recordPath(focus, row, customer)}
                            >
                              {value(
                                row.requestNo ??
                                  row.workOrderNo ??
                                  row.handoverNo ??
                                  row.assetCode ??
                                  row.sku ??
                                  row.employeeCode ??
                                  row.fullName ??
                                  row.name ??
                                  (row.operation
                                    ? "Thao tác xuất kho"
                                    : undefined),
                                "Mở hồ sơ",
                              )}
                            </Link>
                            <small>
                              {value(
                                row.title ??
                                  row.displayName ??
                                  snapshot.name ??
                                  row.description,
                                focus.description,
                              )}
                            </small>
                          </td>
                          <td data-label="Trạng thái">
                            <Badge
                              status={row.status ?? row.state}
                              label={
                                focus.area === "assetM2" &&
                                focus.path.startsWith("/equipment?")
                                  ? equipmentLifecycleLabel(row.status)
                                  : focus.area === "requestsLive" &&
                                      row.status === "ACCEPTED"
                                    ? "Đã tiếp nhận"
                                    : undefined
                              }
                            />
                          </td>
                          <td data-label="Ghi nhận">
                            {formatDate(row.createdAt ?? row.submittedAt)}
                          </td>
                          <td data-label="Thao tác">
                            <Link
                              className="ws-text-link"
                              to={recordPath(focus, row, customer)}
                              aria-label="Mở chi tiết hồ sơ"
                            >
                              <ArrowRight size={16} />
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState
                title="Hiện chưa có hồ sơ trong nhóm này"
                description={`Nhóm “${focus.label.toLowerCase()}” chưa có bản ghi. Bạn vẫn có thể mở các chức năng bên cạnh để tiếp tục công việc.`}
                action={
                  <Link
                    className="ws-button ws-button--secondary"
                    to={focus.to}
                  >
                    Mở danh sách
                    <ArrowRight size={15} />
                  </Link>
                }
              />
            )}
          </DataState>
        </section>
        <section className="ws-card">
          <div className="ws-card-header">
            <div>
              <h2>{customer ? "Bạn cần làm gì?" : "Tiếp tục công việc"}</h2>
              <p>Những lối tắt dành cho vai trò của bạn</p>
            </div>
          </div>
          <div className="ws-quicklinks">
            {quick.map((item, i) => {
              const Icon = [Boxes, ClipboardList, Wrench, ShieldCheck][i % 4];
              return (
                <Link key={item.path} to={item.path}>
                  <Icon size={19} />
                  <span>
                    <strong>{item.label}</strong>
                    <small>{item.group}</small>
                  </span>
                  <ArrowRight size={15} />
                </Link>
              );
            })}
          </div>
        </section>
      </div>
      <div className="ws-help">
        <Info size={17} />
        <span>
          {customer ? (
            <>
              <strong>
                Bạn luôn có thể kiểm tra tiến trình trong hồ sơ yêu cầu.
              </strong>{" "}
              Lịch hẹn, chi phí và bảo hành cần có xác nhận tương ứng. Nếu đang
              chờ bạn bổ sung hoặc quản trị viên duyệt, hệ thống sẽ ghi rõ trong
              hồ sơ.
            </>
          ) : (
            <>
              <strong>Số liệu theo phạm vi tài khoản hiện tại.</strong> Chọn một
              hồ sơ để xem chi tiết, người phụ trách và thao tác được phép. Dấu
              “—” nghĩa là chưa tải được dữ liệu, không phải bằng 0.
            </>
          )}
        </span>
      </div>
      <section className="ws-card">
        <div className="ws-card-header">
          <div>
            <h2>
              {customer
                ? "Theo dõi dịch vụ thuận tiện hơn"
                : "Thông tin và báo cáo"}
            </h2>
            <p>
              {customer
                ? "Không bỏ lỡ phản hồi và cập nhật từ nhà cung cấp"
                : "Tra cứu nguồn dữ liệu và cập nhật dành cho bạn"}
            </p>
          </div>
        </div>
        <div className="ws-card-body ws-actions">
          {profile.userType !== "PLATFORM_STAFF" && (
            <Link
              className="ws-button ws-button--secondary"
              to={customer ? "/portal/notifications" : "/app/notifications"}
            >
              <Bell size={15} />
              Xem thông báo
            </Link>
          )}
          {profile.roles.some((r) =>
            ["TENANT_ADMIN", "SERVICE_MANAGER"].includes(r),
          ) && (
            <Link className="ws-button ws-button--secondary" to="/app/reports">
              <ClipboardList size={15} />
              Báo cáo dịch vụ
            </Link>
          )}
          <Link
            className="ws-text-link"
            to={
              profile.userType === "PLATFORM_STAFF"
                ? "/admin/profile"
                : customer
                  ? "/portal/profile"
                  : "/app/profile"
            }
          >
            Thông tin tài khoản
            <ArrowRight size={14} />
          </Link>
        </div>
      </section>
    </div>
  );
}

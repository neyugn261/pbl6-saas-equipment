import ServiceManagerWorkOrder from "./features/workspace/ServiceManagerWorkOrder";
import ServiceManagerShell from "./features/workspace/ServiceManagerShell";
import WorkspaceRouteBoundary from "./features/workspace/WorkspaceRouteBoundary";
import {
  ServiceSections,
  ServiceNotice,
} from "./features/workspace/ServiceDetailUI";
import { RequestLinkedOrders } from "./features/workspace/CustomerServicePanel";
import {
  serviceLabels,
  equipmentLifecycleLabel,
  requestResponsibility,
} from "./features/workspace/service-detail-data";
import RequestCloseoutSummary from "./features/workspace/RequestCloseoutSummary";
import { ModelPolicyPage } from "./routes/ModelPolicyPage";
import { WarrantyAssessmentPanel } from "./routes/ModelPolicyPanels";
import { useDirectory } from "./routes/registration-data";

import {
  useEffect,
  useRef,
  useState,
  lazy,
  Suspense,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  Link,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";
import { Boxes, Building2, ChevronRight, Search, Wrench } from "lucide-react";
import { api, ApiError } from "./api/client";
import { creators, has, home, menu } from "./auth/access";
import { PriorityBadge, StatusBadge } from "./components/Badges";
import ActivatePage from "./routes/ActivatePage";
import DashboardPage from "./features/workspace/RoleDashboard";
import DemoPage from "./routes/DemoPage";

import InvitePage from "./routes/InvitePage";
import QrPage from "./routes/QrPage";
import EstimatePanel from "./routes/EstimatePanel";
import { NotificationInbox } from "./features/notifications/NotificationInbox";
import { AttachmentsPanel } from "./features/attachments/AttachmentsPanel";
import { WorkOrderReportsPage } from "./features/reports/WorkOrderReports";

import {
  login,
  restoreSession,
  getSessionGeneration,
  SessionProvider,
  useSession,
} from "./auth/session";
import type {
  CustomerRecord,
  EquipmentRecord,
  Page,
  RequestComment,
  RequestDetail,
  RequestStatusChange,
} from "./types/domain";
import "./sample.css";
import "./App.css";
import "./restored.css";
import "./m2.css";
import "./features/workspace/workshop.css";

const DossierPage = lazy(() =>
  import("./routes/M2Pages").then((module) => ({
    default: module.DossierPage,
  })),
);
const EquipmentFeedPage = lazy(() =>
  import("./routes/M2Pages").then((module) => ({
    default: module.EquipmentFeedPage,
  })),
);
const HistoryFeedPage = lazy(() =>
  import("./routes/M2Pages").then((module) => ({
    default: module.HistoryFeedPage,
  })),
);
const ResourceHistoryPage = lazy(() =>
  import("./routes/M2Pages").then((module) => ({
    default: module.ResourceHistoryPage,
  })),
);
const LegacyWorkOrderPage = lazy(() =>
  import("./routes/M2Pages").then((module) => ({
    default: module.WorkOrderPage,
  })),
);
const MaintenanceRecordPage = lazy(() =>
  import("./routes/M2Pages").then((module) => ({
    default: module.MaintenanceRecordPage,
  })),
);
const RequestDossierExtras = lazy(() =>
  import("./routes/M2Pages").then((module) => ({
    default: module.RequestDossierExtras,
  })),
);
const TechnicianPage = lazy(() =>
  import("./routes/M2Pages").then((module) => ({
    default: module.TechnicianPage,
  })),
);
const InventoryPartPage = lazy(() =>
  import("./features/inventory/InventoryPages").then((module) => ({
    default: module.InventoryPartPage,
  })),
);
const InventoryPartsPage = lazy(() =>
  import("./features/inventory/InventoryPages").then((module) => ({
    default: module.InventoryPartsPage,
  })),
);
const InventoryTransactionsPage = lazy(() =>
  import("./features/inventory/InventoryPages").then((module) => ({
    default: module.InventoryTransactionsPage,
  })),
);
const InventoryWarehousesPage = lazy(() =>
  import("./features/inventory/InventoryPages").then((module) => ({
    default: module.InventoryWarehousesPage,
  })),
);
const TenantListPage = lazy(() =>
  import("./routes/LiveAdministration").then((module) => ({
    default: module.TenantListPage,
  })),
);
const TenantCreatePage = lazy(() =>
  import("./routes/LiveAdministration").then((module) => ({
    default: module.TenantCreatePage,
  })),
);
const TenantDetailPage = lazy(() =>
  import("./routes/LiveAdministration").then((module) => ({
    default: module.TenantDetailPage,
  })),
);
const BranchesPage = lazy(() =>
  import("./routes/LiveAdministration").then((module) => ({
    default: module.BranchesPage,
  })),
);
const UsersPage = lazy(() =>
  import("./routes/LiveAdministration").then((module) => ({
    default: module.UsersPage,
  })),
);
const RolesPage = lazy(() =>
  import("./routes/LiveAdministration").then((module) => ({
    default: module.RolesPage,
  })),
);
const ProfilePage = lazy(() =>
  import("./routes/LiveAdministration").then((module) => ({
    default: module.ProfilePage,
  })),
);
const PortalLocationsPage = lazy(() =>
  import("./routes/LiveAdministration").then((module) => ({
    default: module.PortalLocationsPage,
  })),
);
const UnavailablePage = lazy(() =>
  import("./routes/LiveAdministration").then((module) => ({
    default: module.UnavailablePage,
  })),
);
const HandoverCreatePage = lazy(() =>
  import("./routes/EquipmentHandovers").then((module) => ({
    default: module.HandoverCreatePage,
  })),
);
const HandoverDetailPage = lazy(() =>
  import("./routes/EquipmentHandovers").then((module) => ({
    default: module.HandoverDetailPage,
  })),
);
const CustomerDirectoryPage = lazy(() =>
  import("./routes/EquipmentDirectories").then((module) => ({
    default: module.CustomerDirectoryPage,
  })),
);
const CustomerCreatePage = lazy(() =>
  import("./routes/EquipmentDirectories").then((module) => ({
    default: module.CustomerCreatePage,
  })),
);
const CustomerWorkspacePage = lazy(() =>
  import("./routes/EquipmentDirectories").then((module) => ({
    default: module.CustomerWorkspacePage,
  })),
);
const EquipmentModelsPage = lazy(() =>
  import("./routes/EquipmentDirectories").then((module) => ({
    default: module.EquipmentModelsPage,
  })),
);
const EquipmentRegistrationPage = lazy(() =>
  import("./routes/EquipmentRegistration").then((module) => ({
    default: module.EquipmentRegistrationPage,
  })),
);
const RegistrationListPage = lazy(() =>
  import("./routes/EquipmentRegistration").then((module) => ({
    default: module.RegistrationListPage,
  })),
);
const WorkspaceRequestsPage = lazy(() =>
  import("./features/workspace/OperationsPages").then((module) => ({
    default: module.WorkspaceRequestsPage,
  })),
);
const HandoverListPage = lazy(() =>
  import("./features/workspace/OperationsPages").then((module) => ({
    default: module.WorkspaceHandoverPage,
  })),
);
const WorkOrderListPage = lazy(() =>
  import("./features/workspace/OperationsPages").then((module) => ({
    default: module.WorkspaceWorkOrdersPage,
  })),
);
const LiveTechniciansPage = lazy(() =>
  import("./features/workspace/OperationsPages").then((module) => ({
    default: module.WorkspaceTechniciansPage,
  })),
);
const LiveMaintenancePage = lazy(() =>
  import("./features/workspace/OperationsPages").then((module) => ({
    default: module.WorkspaceMaintenancePage,
  })),
);
const MaintenanceHistoryPage = lazy(() =>
  import("./features/workspace/OperationsPages").then((module) => ({
    default: module.WorkspaceMaintenanceHistoryPage,
  })),
);
const NewRequestPage = lazy(() => import("./routes/NewServiceRequest"));
const WorkshopDesignStudio = import.meta.env.DEV
  ? lazy(() => import("./features/design/WorkshopDesignStudio"))
  : null;
const actionLabels: Record<string, string> = {
  review: "Xem xét và kiểm tra bảo hành",
  "request-info": "Yêu cầu bổ sung",
  "warranty-check": "Kiểm tra bảo hành",
  accept: "Tiếp nhận",
  reject: "Từ chối",
  cancel: "Hủy yêu cầu",
  confirm: "Xác nhận hoàn tất",
  reopen: "Mở lại",
};
const requestTypeLabels: Record<string, string> = {
  WARRANTY: "Bảo hành",
  REPAIR: "Sửa chữa",
  MAINTENANCE: "Bảo trì",
  INSPECTION: "Kiểm tra",
};
function Problem({ error }: { error: unknown }) {
  const summary = useRef<HTMLParagraphElement>(null);
  useEffect(() => summary.current?.focus(), [error]);
  return (
    <p ref={summary} tabIndex={-1} className="m1-error" role="alert">
      {error instanceof ApiError
        ? `${error.status} · ${error.message}`
        : error instanceof Error
          ? error.message
          : "Không thể tải dữ liệu."}
    </p>
  );
}
function Loading() {
  return <p role="status">Đang tải…</p>;
}
function Empty() {
  return <p>Chưa có dữ liệu.</p>;
}
function Gate({ roles, children }: { roles: string[]; children: ReactNode }) {
  const { profile } = useSession();
  return profile && has(profile.roles, roles) ? (
    children
  ) : (
    <Navigate to="/403" replace />
  );
}
function WorkOrderPage() {
  const { profile } = useSession();
  return profile?.roles.some((role) =>
    ["SERVICE_MANAGER", "TENANT_ADMIN", "DISPATCHER"].includes(role),
  ) ? (
    <ServiceManagerWorkOrder />
  ) : (
    <LegacyWorkOrderPage />
  );
}
function InventoryTransactionsRoute() {
  const location = useLocation();
  return (
    <InventoryTransactionsPage
      initialWorkOrderId={
        new URLSearchParams(location.search).get("workOrderId") ?? ""
      }
    />
  );
}

function LoginPage() {
  const { profile, setProfile } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const requestedNext = new URLSearchParams(location.search).get("next");
  const next =
    requestedNext?.startsWith("/portal/qr/") && !requestedNext.startsWith("//")
      ? requestedNext
      : null;
  const [tenantCode, setTenantCode] = useState("DEMO");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [platform, setPlatform] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  if (profile) return <Navigate to={next ?? home(profile.roles)} replace />;
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const user = await login({
        email,
        password,
        ...(platform ? {} : { tenantCode }),
      });
      setProfile(user);
      navigate(next ?? home(user.roles), { replace: true });
    } catch (cause) {
      setError(cause);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="m1-login">
      <div className="login-story">
        <div className="login-story__brand">
          <span>
            <Wrench size={22} />
          </span>
          <strong>Servio</strong>
        </div>
        <div>
          <span className="m1-eyebrow">FIELD SERVICE CLOUD</span>
          <h2 style={{ color: "#ffffff" }}>
            Quản lý dịch vụ thiết bị trong một không gian.
          </h2>
          <p>
            Theo dõi thiết bị, bảo hành và yêu cầu hỗ trợ xuyên suốt hành trình
            sau bàn giao.
          </p>
        </div>
        <small>PBL6 · SaaS Equipment Management</small>
      </div>
      <form className="m1-card m1-form" onSubmit={submit}>
        <span className="m1-eyebrow">CHÀO MỪNG TRỞ LẠI</span>
        <h1>Đăng nhập</h1>
        <p>Truy cập không gian làm việc của bạn.</p>
        {error ? <Problem error={error} /> : null}
        <label>
          <input
            type="checkbox"
            checked={platform}
            onChange={(event) => setPlatform(event.target.checked)}
          />{" "}
          Tài khoản nền tảng
        </label>
        {!platform && (
          <label>
            Mã doanh nghiệp
            <input
              required
              value={tenantCode}
              onChange={(event) => setTenantCode(event.target.value)}
            />
          </label>
        )}
        <label>
          Email
          <input
            required
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <label>
          Mật khẩu
          <input
            required
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        <button disabled={busy}>
          {busy ? "Đang đăng nhập…" : "Đăng nhập"}
        </button>
      </form>
    </div>
  );
}
function Layout({ children }: { children: ReactNode }) {
  const { profile } = useSession();
  const location = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [location.pathname]);
  return profile ? (
    <ServiceManagerShell>
      <WorkspaceRouteBoundary>
        <Suspense fallback={<Loading />}>{children}</Suspense>
      </WorkspaceRouteBoundary>
    </ServiceManagerShell>
  ) : null;
}
function useLoad<T>(load: () => Promise<T>, key: string) {
  const sessionGeneration = getSessionGeneration();
  const requestKey = `${key}:session-${sessionGeneration}`;
  const [state, setState] = useState<{
    key: string;
    value: T | null;
    error: unknown;
  }>({ key: "", value: null, error: null });
  useEffect(() => {
    let active = true;
    load()
      .then((value) => {
        if (active) setState({ key: requestKey, value, error: null });
      })
      .catch((error) => {
        if (active) setState({ key: requestKey, value: null, error });
      });
    return () => {
      active = false;
    };
  }, [requestKey]); // eslint-disable-line react-hooks/exhaustive-deps
  return {
    value: state.key === requestKey ? state.value : null,
    error: state.key === requestKey ? state.error : null,
    loading: state.key !== requestKey,
  };
}
function Frame({
  title,
  action,
  eyebrow = "VẬN HÀNH DỊCH VỤ",
  description,
  children,
}: {
  title: string;
  action?: ReactNode;
  eyebrow?: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <>
      <header className="m1-header">
        <div>
          <span className="m1-eyebrow">{eyebrow}</span>
          <h1>{title}</h1>
          {description && <p>{description}</p>}
        </div>
        {action}
      </header>
      {children}
    </>
  );
}
function formatDate(value: string | null | undefined) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime())
    ? new Intl.DateTimeFormat("vi-VN", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Asia/Ho_Chi_Minh",
      }).format(date)
    : "—";
}
function DateText({ value }: { value: string }) {
  return <>{formatDate(value)}</>;
}

function CustomersPage() {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const data = useLoad<Page<CustomerRecord>>(
    () => api.organization("/customers?page=1&pageSize=100"),
    "customers",
  );
  return (
    <Frame
      title="Khách hàng"
      description="Quản lý doanh nghiệp sử dụng thiết bị và các địa điểm vận hành."
    >
      {data.loading ? (
        <Loading />
      ) : data.error ? (
        <Problem error={data.error} />
      ) : (
        <div className="m1-card m1-table-card">
          <div className="m1-table-toolbar">
            <label className="m1-table-search">
              <Search size={17} />
              <input
                aria-label="Tìm khách hàng"
                placeholder="Tìm theo tên hoặc mã..."
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <select
              aria-label="Lọc trạng thái"
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              <option value="">Tất cả trạng thái</option>
              <option value="ACTIVE">Đang hoạt động</option>
              <option value="INACTIVE">Ngừng hoạt động</option>
            </select>
          </div>
          {!data.value?.items.filter(
            (item) =>
              `${item.name} ${item.code}`
                .toLowerCase()
                .includes(query.toLowerCase()) &&
              (!status || item.status === status),
          ).length ? (
            <div className="m1-list-empty">
              Không tìm thấy khách hàng phù hợp.
            </div>
          ) : (
            <>
              <table>
                <thead>
                  <tr>
                    <th>Khách hàng</th>
                    <th>Liên hệ</th>
                    <th>Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  {data.value?.items
                    .filter(
                      (item) =>
                        `${item.name} ${item.code}`
                          .toLowerCase()
                          .includes(query.toLowerCase()) &&
                        (!status || item.status === status),
                    )
                    .map((item) => (
                      <tr key={item.id}>
                        <td>
                          <Link
                            className="m1-entity-cell"
                            to={`/customers/${item.id}`}
                          >
                            <span className="m1-entity-avatar">
                              <Building2 size={18} />
                            </span>
                            <span>
                              <strong>{item.name}</strong>
                              <small>{item.code}</small>
                            </span>
                          </Link>
                        </td>
                        <td>{item.email ?? item.phone ?? "—"}</td>
                        <td>
                          <StatusBadge status={item.status} />
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
              <div className="m1-table-pagination">
                Hiển thị {data.value?.items.length ?? 0} trong{" "}
                {data.value?.total ?? 0} khách hàng
              </div>
            </>
          )}
        </div>
      )}
    </Frame>
  );
}

function CustomerDetailPage() {
  const { id } = useParams();
  const data = useLoad<CustomerRecord>(
    () => api.organization(`/customers/${id}`),
    id ?? "",
  );
  return (
    <Frame
      title={data.value?.name ?? "Khách hàng"}
      eyebrow={data.value?.code ?? "KHÁCH HÀNG"}
      description={data.value?.address ?? undefined}
    >
      {data.loading ? (
        <Loading />
      ) : data.error ? (
        <Problem error={data.error} />
      ) : (
        data.value && (
          <div className="m1-detail-grid">
            <section className="m1-card m1-section-card">
              <div className="m1-section-header">
                <h2>Thông tin doanh nghiệp</h2>
              </div>
              <div className="m1-section-body">
                <dl>
                  <dt>Mã khách hàng</dt>
                  <dd>{data.value.code}</dd>
                  <dt>Trạng thái</dt>
                  <dd>
                    <StatusBadge status={data.value.status} />
                  </dd>
                  <dt>Địa chỉ</dt>
                  <dd>{data.value.address ?? "—"}</dd>
                </dl>
              </div>
            </section>
            <section className="m1-card m1-section-card">
              <div className="m1-section-header">
                <h2>Liên hệ chính</h2>
              </div>
              <div className="m1-section-body">
                <dl>
                  <dt>Email</dt>
                  <dd>{data.value.email ?? "—"}</dd>
                  <dt>Điện thoại</dt>
                  <dd>{data.value.phone ?? "—"}</dd>
                </dl>
              </div>
            </section>
          </div>
        )
      )}
    </Frame>
  );
}
function EquipmentPage() {
  const { profile } = useSession();
  const canManage = profile?.roles.some((role) =>
    ["TENANT_ADMIN", "SERVICE_MANAGER"].includes(role),
  );
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState(""),
    [page, setPage] = useState(1),
    [registrationStatus, setRegistrationStatus] = useState("");
  const data = useDirectory<Page<EquipmentRecord>>(
    "assetM2",
    `/equipment?page=${page}&pageSize=20&q=${encodeURIComponent(search)}${status ? `&status=${status}` : ""}${canManage && registrationStatus ? `&registrationStatus=${registrationStatus}` : ""}`,
  );
  return (
    <Frame
      title="Thiết bị"
      description="Theo dõi thiết bị đã bàn giao, bảo hành và lịch sử dịch vụ."
      action={
        canManage ? (
          <Link className="m1-button" to="/app/equipment-registrations/new">
            + Ghi nhận bàn giao
          </Link>
        ) : null
      }
    >
      {data.loading ? (
        <Loading />
      ) : data.error ? (
        <p className="m1-error" role="alert">
          {data.error}
        </p>
      ) : (
        <>
          <div className="m1-summary-strip">
            <div>
              <strong>{data.value?.total ?? 0}</strong>
              <span>Tổng thiết bị</span>
            </div>
            <div>
              <strong>
                {data.value?.items.filter((item) => item.status === "ACTIVE")
                  .length ?? 0}
              </strong>
              <span>Hoạt động trong trang</span>
            </div>
            <div>
              <strong>
                {data.value?.items.filter(
                  (item) => item.warranty?.result === "IN_WARRANTY",
                ).length ?? 0}
              </strong>
              <span>Còn bảo hành trong trang</span>
            </div>
            <div>
              <strong>
                {data.value?.items.filter(
                  (item) => item.status === "OUT_OF_SERVICE",
                ).length ?? 0}
              </strong>
              <span>Cần chú ý trong trang</span>
            </div>
          </div>
          <div className="m1-card m1-table-card">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setSearch(query);
                setPage(1);
              }}
              className="m1-table-toolbar"
            >
              <label className="m1-table-search">
                <Search size={17} />
                <input
                  aria-label="Tìm thiết bị"
                  placeholder="Tìm mã tài sản, model, serial..."
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </label>
              <select
                aria-label="Lọc trạng thái"
                value={status}
                onChange={(event) => {
                  setStatus(event.target.value);
                  setPage(1);
                }}
              >
                <option value="">Tất cả trạng thái</option>
                <option value="ACTIVE">Hoạt động</option>
                <option value="IN_SERVICE">Đang sử dụng</option>
                <option value="OUT_OF_SERVICE">Ngừng hoạt động</option>
                <option value="RETIRED">Ngừng sử dụng</option>
              </select>
              {canManage && (
                <select
                  aria-label="Lọc thiết lập dịch vụ"
                  value={registrationStatus}
                  onChange={(e) => {
                    setRegistrationStatus(e.target.value);
                    setPage(1);
                  }}
                >
                  <option value="">Tất cả hồ sơ</option>
                  <option value="NOT_RECORDED">Chưa ghi nhận</option>
                  <option value="DRAFT">Chưa hoàn tất</option>
                  <option value="PENDING_MAINTENANCE">Chờ bảo trì</option>
                  <option value="COMPLETED">Đã hoàn tất</option>
                </select>
              )}
              <button>Tìm</button>
            </form>
            {!data.value?.items.length ? (
              <div className="m1-list-empty">
                Không tìm thấy thiết bị phù hợp.
              </div>
            ) : (
              <>
                <table>
                  <thead>
                    <tr>
                      <th>Mã tài sản</th>
                      <th>Thiết bị / Model</th>
                      <th>Số sê-ri</th>
                      <th>Bảo hành</th>
                      <th>Trạng thái</th>
                      {canManage && <th>Thiết lập dịch vụ</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {data.value?.items.map((item) => (
                      <tr key={item.id}>
                        <td>
                          <Link
                            to={`${profile?.userType === "CUSTOMER" ? "/portal" : "/app"}/equipment/${item.id}`}
                          >
                            {item.assetCode}
                          </Link>
                        </td>
                        <td>
                          <strong>
                            {item.displayName ||
                              item.model?.name ||
                              item.assetCode}
                          </strong>
                        </td>
                        <td>{item.serialNumber}</td>
                        <td>
                          {item.warranty?.result ? (
                            <StatusBadge status={item.warranty.result} />
                          ) : (
                            "—"
                          )}
                        </td>
                        <td>
                          <StatusBadge
                            status={item.status}
                            label={equipmentLifecycleLabel(item.status)}
                          />
                        </td>
                        {canManage && (
                          <td>
                            <Link
                              to={
                                item.registrationId
                                  ? `/app/equipment-registrations/${item.registrationId}`
                                  : `/app/equipment-registrations/new?equipmentId=${item.id}`
                              }
                            >
                              {item.registrationStatus === "COMPLETED"
                                ? "Đã hoàn tất"
                                : item.registrationStatus ===
                                    "PENDING_MAINTENANCE"
                                  ? "Chờ bảo trì"
                                  : item.registrationStatus === "DRAFT"
                                    ? "Tiếp tục hồ sơ"
                                    : "Hoàn thiện bàn giao"}
                            </Link>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="m1-table-pagination">
                  Trang {page} · {data.value?.total ?? 0} thiết bị{" "}
                  <button
                    disabled={page === 1}
                    onClick={() => setPage(page - 1)}
                  >
                    Trước
                  </button>
                  <button
                    disabled={page * 20 >= (data.value?.total ?? 0)}
                    onClick={() => setPage(page + 1)}
                  >
                    Sau
                  </button>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </Frame>
  );
}
function RequestsPage() {
  return <WorkspaceRequestsPage />;
}
function RequestActivity({
  id,
  version,
  mode = "all",
}: {
  id: string;
  version: number;
  mode?: "comments" | "history" | "all";
}) {
  const history = useLoad<RequestStatusChange[]>(
    () =>
      mode === "comments"
        ? Promise.resolve([])
        : api.requestsLive(`/service-requests/${id}/history`),
    `history-${id}-${version}`,
  );
  const comments = useLoad<RequestComment[]>(
    () =>
      mode === "history"
        ? Promise.resolve([])
        : api.requestsLive(`/service-requests/${id}/comments`),
    `comments-${id}-${version}`,
  );
  return (
    <div className="m1-activity">
      {mode !== "comments" && (
        <section>
          <h3>Lịch sử trạng thái</h3>
          {history.loading ? (
            <Loading />
          ) : history.error ? (
            <Problem error={history.error} />
          ) : !history.value?.length ? (
            <Empty />
          ) : (
            <ul>
              {history.value
                .filter((item) => item.newStatus)
                .map((item) => (
                  <li key={item.id}>
                    <StatusBadge status={item.newStatus} /> ·{" "}
                    <DateText value={item.changedAt} />
                    {item.reason && <p>{item.reason}</p>}
                  </li>
                ))}
            </ul>
          )}
        </section>
      )}
      {mode !== "history" && (
        <section>
          <h3>Bình luận</h3>
          {comments.loading ? (
            <Loading />
          ) : comments.error ? (
            <Problem error={comments.error} />
          ) : !comments.value?.length ? (
            <Empty />
          ) : (
            <ul>
              {comments.value.map((item) => (
                <li key={item.id}>
                  <strong>
                    {item.visibility === "INTERNAL"
                      ? "Trao đổi nội bộ"
                      : "Khách hàng thấy"}
                  </strong>{" "}
                  · <DateText value={item.createdAt} />
                  <p>{item.content}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
function RequestDetailPage() {
  const entry = useLocation();
  const { id } = useParams();
  const navigate = useNavigate();
  const { profile } = useSession();
  const sessionGeneration = getSessionGeneration();
  const data = useLoad<RequestDetail>(
    () => api.requestsLive(`/service-requests/${id}`),
    id ?? "",
  );
  const [override, setOverride] = useState<{
    generation: number;
    value: RequestDetail;
  } | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [pendingAction, setPendingAction] = useState("");
  const [actionReason, setActionReason] = useState("");
  const actionDialog = useRef<HTMLDialogElement>(null);
  const actionLock = useRef(false);
  const [version, setVersion] = useState(0);
  const [comment, setComment] = useState("");
  const [visibility, setVisibility] = useState<"CUSTOMER" | "INTERNAL">(
    "CUSTOMER",
  );
  const currentOverride =
    override?.generation === sessionGeneration ? override.value : null;
  const current =
    currentOverride?.id === data.value?.id ? currentOverride : data.value;
  const equipmentLabel = useLoad<EquipmentRecord | null>(
    () =>
      current?.equipmentId
        ? api.assetM2(`/equipment/${current.equipmentId}`)
        : Promise.resolve(null),
    `request-equipment:${current?.equipmentId ?? ""}:${version}`,
  );
  async function refreshRequest(conflict?: unknown) {
    if (!current || getSessionGeneration() !== sessionGeneration) return;
    setBusy(true);
    setError(conflict ?? null);
    try {
      const refreshed = await api.requestsLive<RequestDetail>(
        `/service-requests/${current.id}`,
      );
      if (getSessionGeneration() !== sessionGeneration) return;
      setOverride({ generation: sessionGeneration, value: refreshed });
      setVersion((value) => value + 1);
    } catch (cause) {
      setError(
        conflict
          ? new Error(
              `${conflict instanceof Error ? conflict.message : String(conflict)} · Không thể làm mới yêu cầu: ${cause instanceof Error ? cause.message : String(cause)}`,
            )
          : cause,
      );
    } finally {
      setBusy(false);
    }
  }
  async function createWorkOrder() {
    if (
      !current ||
      actionLock.current ||
      current.status !== "ACCEPTED" ||
      getSessionGeneration() !== sessionGeneration
    )
      return;
    actionLock.current = true;
    setBusy(true);
    setError(null);
    try {
      const order = await api.workorders<{ id: string }>("/work-orders", {
        method: "POST",
        body: { serviceRequestId: current.id },
      });
      if (getSessionGeneration() !== sessionGeneration) return;
      navigate(`/app/work-orders/${order.id}`);
    } catch (cause) {
      if (
        getSessionGeneration() === sessionGeneration &&
        cause instanceof ApiError &&
        cause.status === 409
      )
        await refreshRequest(cause);
      else if (getSessionGeneration() === sessionGeneration) setError(cause);
    } finally {
      actionLock.current = false;
      setBusy(false);
    }
  }
  async function run(action: string) {
    if (!current || getSessionGeneration() !== sessionGeneration) return;
    if (actionLock.current || !current.allowedActions?.includes(action)) return;
    const reason = actionReason.trim();
    if (["reject", "request-info", "reopen"].includes(action) && !reason)
      return;
    actionLock.current = true;
    setBusy(true);
    setError(null);
    try {
      await api.requestsLive(`/service-requests/${current.id}/${action}`, {
        method: "POST",
        ...(reason ? { body: { reason } } : {}),
      });
      if (getSessionGeneration() !== sessionGeneration) return;
      const refreshed = await api.requestsLive<RequestDetail>(
        `/service-requests/${current.id}`,
      );
      if (getSessionGeneration() !== sessionGeneration) return;
      setOverride({ generation: sessionGeneration, value: refreshed });
      setVersion((value) => value + 1);
      actionDialog.current?.close();
      setPendingAction("");
      setActionReason("");
    } catch (cause) {
      if (getSessionGeneration() !== sessionGeneration) return;
      if (cause instanceof ApiError && cause.status === 409) {
        await refreshRequest(cause);
        return;
      }
      setError(cause);
    } finally {
      actionLock.current = false;
      setBusy(false);
    }
  }
  async function addComment(event: FormEvent) {
    event.preventDefault();
    if (
      !current ||
      !comment.trim() ||
      getSessionGeneration() !== sessionGeneration
    )
      return;
    setBusy(true);
    setError(null);
    try {
      await api.requestsLive(`/service-requests/${current.id}/comments`, {
        method: "POST",
        body: {
          content: comment.trim(),
          visibility:
            profile?.userType === "CUSTOMER" ? "CUSTOMER" : visibility,
        },
      });
      if (getSessionGeneration() !== sessionGeneration) return;
      setComment("");
      const refreshed = await api.requestsLive<RequestDetail>(
        `/service-requests/${current.id}`,
      );
      if (getSessionGeneration() !== sessionGeneration) return;
      setOverride({ generation: sessionGeneration, value: refreshed });
      setVersion((value) => value + 1);
    } catch (cause) {
      if (getSessionGeneration() !== sessionGeneration) return;
      if (cause instanceof ApiError && cause.status === 409) {
        await refreshRequest(cause);
        return;
      }
      setError(cause);
    } finally {
      setBusy(false);
    }
  }
  const actions = [
    "review",
    "request-info",
    "warranty-check",
    "accept",
    "reject",
    "cancel",
    "confirm",
    "reopen",
  ];
  return (
    <Frame
      title={current?.title ?? "Yêu cầu dịch vụ"}
      eyebrow={current?.requestNo ?? "YÊU CẦU DỊCH VỤ"}
      description={
        current ? `Tạo lúc ${formatDate(current.createdAt)}` : undefined
      }
    >
      {data.loading ? (
        <Loading />
      ) : data.error ? (
        <Problem error={data.error} />
      ) : (
        current && (
          <>
            <div className="m1-entity-status">
              <StatusBadge status={current.status} />
              <PriorityBadge priority={current.priority} />
              <span>{requestTypeLabels[current.type] ?? current.type}</span>
            </div>
            {entry.state?.created && (
              <ServiceNotice title="Biên nhận yêu cầu dịch vụ">
                <p>
                  {current.requestNo} · Đã ghi nhận lúc{" "}
                  {formatDate(current.createdAt)}. Bạn có thể theo dõi phản hồi
                  và bổ sung thông tin ngay trong hồ sơ này.
                </p>
              </ServiceNotice>
            )}
            <ServiceNotice
              title={`Bên cần hành động: ${requestResponsibility(current.status)[0]}`}
            >
              <p>
                {requestResponsibility(current.status)[1]}. Người kiểm tra bảo
                hành và người thực hiện công việc được ghi riêng trong lịch sử.
              </p>
            </ServiceNotice>
            {(current.status === "RESOLVED" ||
              current.status === "CLOSED" ||
              Boolean(current.resolutionResult)) && (
              <RequestCloseoutSummary request={current} />
            )}
            {error ? <Problem error={error} /> : null}
            <div className="m1-actions">
              <button disabled={busy} onClick={() => void refreshRequest()}>
                Làm mới trạng thái
              </button>
              {current.status === "ACCEPTED" &&
                profile?.roles.includes("SERVICE_MANAGER") && (
                  <button
                    disabled={busy}
                    onClick={() => void createWorkOrder()}
                  >
                    Tạo lệnh công việc
                  </button>
                )}
              {current.allowedActions
                ?.filter((action) => actions.includes(action))
                .map((action) => (
                  <button
                    disabled={busy}
                    key={action}
                    onClick={() => {
                      setPendingAction(action);
                      setActionReason("");
                      actionDialog.current?.showModal();
                    }}
                  >
                    {action === "confirm" && profile?.userType !== "CUSTOMER"
                      ? "Xác nhận thay khách hàng"
                      : (actionLabels[action] ?? action)}
                  </button>
                ))}
            </div>
            {current.status === "PROCESSING" && (
              <p role="status">
                Đang chờ kết quả từ Work Order. Kết quả có thể xuất hiện sau ít
                phút; dùng “Làm mới trạng thái” để kiểm tra.
              </p>
            )}
            <ServiceNotice
              title={
                current.status === "ACCEPTED"
                  ? "Yêu cầu đã đủ điều kiện tạo lệnh"
                  : current.status === "NEW"
                    ? "Bắt đầu xem xét yêu cầu"
                    : "Theo dõi bước xử lý tiếp theo"
              }
            >
              <p>
                {current.status === "ACCEPTED"
                  ? "Tạo lệnh công việc, sau đó phân công kỹ thuật viên và theo dõi kết quả."
                  : "Kiểm tra mô tả sự cố, hồ sơ thiết bị, quyết định bảo hành và trao đổi trước khi chuyển trạng thái."}
              </p>
            </ServiceNotice>
            <ServiceSections
              items={[
                {
                  key: "overview",
                  label: "Thông tin & trao đổi",
                  content: (
                    <>
                      {(current.resolutionSummary ||
                        current.resolutionResult) && (
                        <section className="m1-card m1-section-card">
                          <div className="m1-section-header">
                            <h2>Kết quả dịch vụ</h2>
                          </div>
                          <div className="m1-section-body">
                            <p>{current.resolutionSummary ?? "—"}</p>
                            <dl>
                              <dt>Kết quả</dt>
                              <dd>
                                {serviceLabels[
                                  current.resolutionResult ?? ""
                                ] ?? "Chưa ghi nhận"}
                              </dd>
                              <dt>Lệnh công việc</dt>
                              <dd>{current.resolvedWorkOrderNo ?? "—"}</dd>
                              <dt>Hoàn thành lúc</dt>
                              <dd>
                                {formatDate(current.resolutionCompletedAt)}
                              </dd>
                            </dl>
                          </div>
                        </section>
                      )}
                      <AttachmentsPanel
                        kind="SERVICE_REQUEST_RESULT"
                        requestId={current.id}
                      />
                      <div className="m1-request-detail-grid">
                        <div>
                          <section className="m1-card m1-section-card">
                            <div className="m1-section-header">
                              <h2>Mô tả sự cố</h2>
                            </div>
                            <div className="m1-section-body m1-prose">
                              {current.description}
                            </div>
                          </section>
                          <section className="m1-card m1-section-card">
                            <div className="m1-section-header">
                              <h2>Thiết bị & vị trí</h2>
                            </div>
                            <div className="m1-section-body">
                              <Link
                                className="m1-equipment-link"
                                to={`${profile?.userType === "CUSTOMER" ? "/portal" : "/app"}/equipment/${current.equipmentId}`}
                              >
                                <span className="m1-entity-avatar">
                                  <Boxes size={19} />
                                </span>
                                <span>
                                  <strong>Mở hồ sơ thiết bị</strong>
                                  <small>
                                    {equipmentLabel.value?.displayName ||
                                      equipmentLabel.value?.model?.name ||
                                      equipmentLabel.value?.assetCode ||
                                      "Thiết bị không xác định"}
                                  </small>
                                </span>
                                <ChevronRight size={18} />
                              </Link>
                            </div>
                          </section>
                          <section className="m1-card m1-section-card">
                            <div className="m1-section-header">
                              <h2>Trao đổi</h2>
                            </div>
                            <div className="m1-section-body">
                              <RequestActivity
                                id={current.id}
                                version={version}
                                mode="comments"
                              />
                              {current.allowedActions?.includes(
                                "add-comment",
                              ) ? (
                                <form
                                  id="request-comments"
                                  className="m1-comment"
                                  onSubmit={addComment}
                                >
                                  <textarea
                                    aria-label="Nội dung trao đổi"
                                    required
                                    maxLength={5000}
                                    rows={3}
                                    value={comment}
                                    onChange={(event) =>
                                      setComment(event.target.value)
                                    }
                                    placeholder="Nhập bình luận..."
                                  />
                                  {profile?.userType !== "CUSTOMER" &&
                                    profile &&
                                    has(profile.roles, [
                                      "SERVICE_MANAGER",
                                      "DISPATCHER",
                                      "TECHNICIAN",
                                    ]) && (
                                      <select
                                        aria-label="Phạm vi hiển thị trao đổi"
                                        value={visibility}
                                        onChange={(event) =>
                                          setVisibility(
                                            event.target.value as
                                              "CUSTOMER" | "INTERNAL",
                                          )
                                        }
                                      >
                                        <option value="CUSTOMER">
                                          Khách hàng thấy
                                        </option>
                                        <option value="INTERNAL">Nội bộ</option>
                                      </select>
                                    )}
                                  <button disabled={busy || !comment.trim()}>
                                    Gửi bình luận
                                  </button>
                                </form>
                              ) : (
                                <p>Chỉ xem trao đổi theo quyền hiện tại.</p>
                              )}
                            </div>
                          </section>
                        </div>
                        <aside>
                          <section className="m1-card m1-section-card">
                            <div className="m1-section-header">
                              <h2>Thông tin yêu cầu</h2>
                            </div>
                            <div className="m1-section-body">
                              <dl>
                                <dt>Trạng thái</dt>
                                <dd>
                                  <StatusBadge status={current.status} />
                                </dd>
                                <dt>Ưu tiên</dt>
                                <dd>
                                  <PriorityBadge priority={current.priority} />
                                </dd>
                                <dt>Bảo hành</dt>
                                <dd>
                                  {current.warrantyCheck?.result ? (
                                    <StatusBadge
                                      status={current.warrantyCheck.result}
                                    />
                                  ) : (
                                    "Chưa kiểm tra"
                                  )}
                                </dd>
                                <dt>Loại yêu cầu</dt>
                                <dd>
                                  {requestTypeLabels[current.type] ??
                                    current.type}
                                </dd>
                              </dl>
                            </div>
                          </section>
                          {profile?.roles.includes("SERVICE_MANAGER") && (
                            <RequestLinkedOrders
                              key={current.id}
                              requestId={current.id}
                            />
                          )}
                        </aside>
                      </div>
                    </>
                  ),
                },
                {
                  key: "decision",
                  label: "Bảo hành & dự toán",
                  content: (
                    <>
                      <RequestDossierExtras
                        equipmentId={current.equipmentId}
                        requestId={current.id}
                        revision={version}
                      />
                      {current.resolutionChecklist && (
                        <section className="m1-card">
                          <h2>Kết quả công việc đã công bố</h2>
                          <ul>
                            {current.resolutionChecklist.map((item) => (
                              <li key={item.itemId}>
                                {item.title} ·{" "}
                                {serviceLabels[item.status] ?? item.status}
                              </li>
                            ))}
                          </ul>
                        </section>
                      )}
                      <WarrantyAssessmentPanel
                        key={current.id}
                        request={current}
                        changed={() => void refreshRequest()}
                      />
                      <EstimatePanel
                        requestNo={current.requestNo}
                        equipmentSummary={
                          equipmentLabel.value
                            ? `${equipmentLabel.value.assetCode} · serial ${equipmentLabel.value.serialNumber}`
                            : undefined
                        }
                        requestId={current.id}
                        allowedActions={current.allowedActions ?? []}
                        onChange={() => void refreshRequest()}
                      />
                    </>
                  ),
                },
                {
                  key: "history",
                  label: "Lịch sử xử lý",
                  content: (
                    <RequestActivity
                      id={current.id}
                      version={version}
                      mode="history"
                    />
                  ),
                },
              ]}
            />
            <dialog
              ref={actionDialog}
              aria-labelledby="request-action-title"
              onCancel={(event) => {
                if (busy) event.preventDefault();
                else setPendingAction("");
              }}
            >
              <form
                className="m1-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  void run(pendingAction);
                }}
              >
                <h2 id="request-action-title">
                  {pendingAction === "confirm" &&
                  profile?.userType !== "CUSTOMER"
                    ? "Xác nhận thay khách hàng"
                    : (actionLabels[pendingAction] ?? "Xác nhận thao tác")}
                </h2>
                {pendingAction === "confirm" && (
                  <div className="workshop-next">
                    <strong>
                      {profile?.userType === "CUSTOMER"
                        ? "Bạn đang xác nhận kết quả được công bố"
                        : "Thao tác được ghi dưới tài khoản nhân viên của bạn"}
                    </strong>
                    <p>
                      {current.resolutionResult === "PARTIALLY_RESOLVED"
                        ? "Kết quả hiện chỉ xử lý một phần. Làm rõ phần chưa giải quyết trước khi xác nhận."
                        : "Đối chiếu kết quả và phạm vi đã đồng ý trước khi khép yêu cầu."}
                    </p>
                    {profile?.userType !== "CUSTOMER" && (
                      <p>
                        Ghi người đồng ý, kênh phản hồi và căn cứ xác nhận trong
                        mục trao đổi của hồ sơ trước khi xác nhận thay khách.
                        Việc bạn bấm nút không phải bằng chứng khách tự xác
                        nhận.
                      </p>
                    )}
                  </div>
                )}
                <p>
                  {pendingAction === "reject" || pendingAction === "cancel"
                    ? "Thao tác sẽ dừng xử lý yêu cầu theo quy tắc hiện tại và được ghi vào lịch sử. Kiểm tra thông tin trước khi xác nhận."
                    : "Thay đổi này được ghi vào lịch sử yêu cầu. Các bước tiếp theo phụ thuộc vào trạng thái mới nhất."}
                </p>
                {["reject", "request-info", "reopen", "cancel"].includes(
                  pendingAction,
                ) && (
                  <label>
                    Lý do{" "}
                    {pendingAction !== "cancel"
                      ? "(bắt buộc)"
                      : "(khuyến nghị)"}
                    <textarea
                      required={pendingAction !== "cancel"}
                      rows={4}
                      maxLength={2000}
                      value={actionReason}
                      onChange={(event) => setActionReason(event.target.value)}
                    />
                  </label>
                )}
                {error ? <Problem error={error} /> : null}
                <div className="m1-actions">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      actionDialog.current?.close();
                      setPendingAction("");
                    }}
                  >
                    Quay lại
                  </button>
                  <button
                    disabled={
                      busy ||
                      (["reject", "request-info", "reopen"].includes(
                        pendingAction,
                      ) &&
                        !actionReason.trim())
                    }
                  >
                    {busy ? "Đang xử lý…" : "Xác nhận"}
                  </button>
                </div>
              </form>
            </dialog>
          </>
        )
      )}
    </Frame>
  );
}

function Message({ code, title }: { code: string; title: string }) {
  return (
    <div className="m1-card">
      <h1>
        {code} · {title}
      </h1>
      <Link to="/">Về trang chính</Link>
    </div>
  );
}
const tenantRoles = [
  "TENANT_ADMIN",
  "SERVICE_MANAGER",
  "DISPATCHER",
  "TECHNICIAN",
  "INVENTORY_STAFF",
];
const customerRoles = ["CUSTOMER_ADMIN", "CUSTOMER_USER"];
function HistoryFeedPageRoute() {
  const { id } = useParams();
  return <HistoryFeedPage equipmentId={id} />;
}
function EquipmentMaintenanceHistoryRoute() {
  const { id } = useParams();
  return <MaintenanceHistoryPage equipmentId={id} />;
}
const workspaceRoutes: { path: string; element: ReactNode; roles: string[] }[] =
  [
    { path: "/app/dashboard", element: <DashboardPage />, roles: tenantRoles },
    {
      path: "/app/customers",
      element: <CustomerDirectoryPage />,
      roles: menu[0].roles,
    },
    {
      path: "/app/customers/new",
      element: <CustomerCreatePage />,
      roles: ["TENANT_ADMIN", "SERVICE_MANAGER"],
    },
    {
      path: "/app/customers/:id",
      element: <CustomerWorkspacePage />,
      roles: menu[0].roles,
    },
    {
      path: "/app/equipment-models/:id",
      element: <ModelPolicyPage />,
      roles: ["TENANT_ADMIN", "SERVICE_MANAGER"],
    },
    {
      path: "/app/equipment-models",
      element: <EquipmentModelsPage />,
      roles: ["TENANT_ADMIN", "SERVICE_MANAGER"],
    },
    {
      path: "/app/equipment-registrations",
      element: <RegistrationListPage />,
      roles: ["TENANT_ADMIN", "SERVICE_MANAGER"],
    },
    {
      path: "/app/equipment-handovers",
      element: <HandoverListPage />,
      roles: ["TENANT_ADMIN", "SERVICE_MANAGER"],
    },
    {
      path: "/app/equipment-handovers/new",
      element: <HandoverCreatePage />,
      roles: ["TENANT_ADMIN", "SERVICE_MANAGER"],
    },
    {
      path: "/app/equipment-handovers/:id",
      element: <HandoverDetailPage />,
      roles: ["TENANT_ADMIN", "SERVICE_MANAGER"],
    },
    {
      path: "/app/equipment-registrations/new",
      element: <EquipmentRegistrationPage />,
      roles: ["TENANT_ADMIN", "SERVICE_MANAGER"],
    },
    {
      path: "/app/equipment-registrations/:id",
      element: <EquipmentRegistrationPage />,
      roles: ["TENANT_ADMIN", "SERVICE_MANAGER"],
    },
    { path: "/app/equipment", element: <EquipmentPage />, roles: tenantRoles },
    {
      path: "/app/equipment/:id",
      element: <DossierPage />,
      roles: tenantRoles,
    },
    {
      path: "/app/equipment/:id/timeline",
      element: <HistoryFeedPageRoute />,
      roles: tenantRoles,
    },
    {
      path: "/app/equipment/:id/service-requests",
      element: <EquipmentFeedPage kind="service-requests" />,
      roles: tenantRoles,
    },
    {
      path: "/app/equipment/:id/work-orders",
      element: <EquipmentFeedPage kind="work-orders" />,
      roles: tenantRoles,
    },
    {
      path: "/app/equipment/:id/maintenance-plans",
      element: <EquipmentFeedPage kind="maintenance-plans" />,
      roles: tenantRoles,
    },
    {
      path: "/app/equipment/:id/maintenance-tasks",
      element: <EquipmentFeedPage kind="maintenance-tasks" />,
      roles: tenantRoles,
    },
    {
      path: "/app/equipment/:id/maintenance-history",
      element: <EquipmentMaintenanceHistoryRoute />,
      roles: ["TENANT_ADMIN", "SERVICE_MANAGER"],
    },
    {
      path: "/app/equipment-history",
      element: <HistoryFeedPage />,
      roles: tenantRoles,
    },
    {
      path: "/app/models/:id/history",
      element: <ResourceHistoryPage kind="model" />,
      roles: tenantRoles,
    },
    {
      path: "/app/warranties/:id/history",
      element: <ResourceHistoryPage kind="warranty" />,
      roles: tenantRoles,
    },
    {
      path: "/app/service-requests",
      element: <RequestsPage />,
      roles: ["TENANT_ADMIN", "SERVICE_MANAGER", "DISPATCHER", "TECHNICIAN"],
    },
    {
      path: "/app/service-requests/new",
      element: <NewRequestPage />,
      roles: ["SERVICE_MANAGER"],
    },
    {
      path: "/app/service-requests/:id",
      element: <RequestDetailPage />,
      roles: ["TENANT_ADMIN", "SERVICE_MANAGER", "DISPATCHER", "TECHNICIAN"],
    },
    {
      path: "/app/work-orders",
      element: <WorkOrderListPage />,
      roles: tenantRoles,
    },
    {
      path: "/app/work-orders/:id",
      element: <WorkOrderPage />,
      roles: tenantRoles,
    },
    {
      path: "/app/technicians",
      element: <LiveTechniciansPage />,
      roles: ["TENANT_ADMIN", "SERVICE_MANAGER", "DISPATCHER"],
    },
    {
      path: "/app/technicians/:id",
      element: <TechnicianPage />,
      roles: ["TENANT_ADMIN", "SERVICE_MANAGER", "DISPATCHER"],
    },
    {
      path: "/app/maintenance",
      element: <LiveMaintenancePage />,
      roles: ["TENANT_ADMIN", "SERVICE_MANAGER", "DISPATCHER"],
    },
    {
      path: "/app/maintenance-history",
      element: <MaintenanceHistoryPage />,
      roles: ["TENANT_ADMIN", "SERVICE_MANAGER"],
    },
    {
      path: "/app/maintenance/:id",
      element: <MaintenanceRecordPage />,
      roles: ["TENANT_ADMIN", "SERVICE_MANAGER", "DISPATCHER"],
    },
    {
      path: "/app/inventory/parts",
      element: <InventoryPartsPage />,
      roles: [
        "TENANT_ADMIN",
        "SERVICE_MANAGER",
        "TECHNICIAN",
        "INVENTORY_STAFF",
      ],
    },
    {
      path: "/app/inventory/parts/:id",
      element: <InventoryPartPage />,
      roles: [
        "TENANT_ADMIN",
        "SERVICE_MANAGER",
        "TECHNICIAN",
        "INVENTORY_STAFF",
      ],
    },
    {
      path: "/app/inventory/warehouses",
      element: <InventoryWarehousesPage />,
      roles: [
        "TENANT_ADMIN",
        "SERVICE_MANAGER",
        "TECHNICIAN",
        "INVENTORY_STAFF",
      ],
    },
    {
      path: "/app/inventory/transactions",
      element: <InventoryTransactionsRoute />,
      roles: ["TENANT_ADMIN", "INVENTORY_STAFF"],
    },
    {
      path: "/app/organization/branches",
      element: <BranchesPage />,
      roles: ["TENANT_ADMIN"],
    },
    {
      path: "/app/organization/users",
      element: <UsersPage />,
      roles: ["TENANT_ADMIN"],
    },
    {
      path: "/app/organization/roles",
      element: <RolesPage />,
      roles: ["TENANT_ADMIN"],
    },
    {
      path: "/app/reports",
      element: <WorkOrderReportsPage />,
      roles: ["TENANT_ADMIN", "SERVICE_MANAGER"],
    },
    {
      path: "/app/notifications",
      element: <NotificationInbox />,
      roles: tenantRoles,
    },
    {
      path: "/app/settings",
      element: <UnavailablePage type="settings" />,
      roles: tenantRoles,
    },
    { path: "/admin", element: <DashboardPage />, roles: ["PLATFORM_ADMIN"] },
    {
      path: "/admin/tenants",
      element: <TenantListPage />,
      roles: ["PLATFORM_ADMIN"],
    },
    {
      path: "/admin/tenants/new",
      element: <TenantCreatePage />,
      roles: ["PLATFORM_ADMIN"],
    },
    {
      path: "/admin/tenants/:id",
      element: <TenantDetailPage />,
      roles: ["PLATFORM_ADMIN"],
    },
    {
      path: "/admin/audit-logs",
      element: <UnavailablePage type="audit" />,
      roles: ["PLATFORM_ADMIN"],
    },
    {
      path: "/admin/settings",
      element: <UnavailablePage type="settings" />,
      roles: ["PLATFORM_ADMIN"],
    },
    { path: "/portal", element: <DashboardPage />, roles: customerRoles },
    {
      path: "/portal/equipment",
      element: <EquipmentPage />,
      roles: customerRoles,
    },
    {
      path: "/portal/equipment/:id",
      element: <DossierPage />,
      roles: customerRoles,
    },
    {
      path: "/portal/equipment/:id/timeline",
      element: <HistoryFeedPageRoute />,
      roles: customerRoles,
    },
    {
      path: "/portal/equipment/:id/service-requests",
      element: <EquipmentFeedPage kind="service-requests" />,
      roles: customerRoles,
    },
    {
      path: "/portal/equipment/:id/work-orders",
      element: <EquipmentFeedPage kind="work-orders" />,
      roles: customerRoles,
    },
    {
      path: "/portal/equipment/:id/maintenance-plans",
      element: <EquipmentFeedPage kind="maintenance-plans" />,
      roles: ["CUSTOMER_ADMIN"],
    },
    {
      path: "/portal/equipment/:id/maintenance-tasks",
      element: <EquipmentFeedPage kind="maintenance-tasks" />,
      roles: ["CUSTOMER_ADMIN"],
    },
    {
      path: "/portal/equipment/:id/maintenance-history",
      element: <EquipmentMaintenanceHistoryRoute />,
      roles: ["CUSTOMER_ADMIN"],
    },
    {
      path: "/portal/equipment-history",
      element: <HistoryFeedPage />,
      roles: customerRoles,
    },
    {
      path: "/portal/warranties/:id/history",
      element: <ResourceHistoryPage kind="warranty" />,
      roles: customerRoles,
    },
    {
      path: "/portal/requests",
      element: <RequestsPage />,
      roles: customerRoles,
    },
    {
      path: "/portal/requests/new",
      element: <NewRequestPage />,
      roles: customerRoles,
    },
    {
      path: "/portal/requests/:id",
      element: <RequestDetailPage />,
      roles: customerRoles,
    },
    {
      path: "/portal/maintenance",
      element: <LiveMaintenancePage />,
      roles: ["CUSTOMER_ADMIN"],
    },
    {
      path: "/portal/maintenance-history",
      element: <MaintenanceHistoryPage />,
      roles: ["CUSTOMER_ADMIN"],
    },
    {
      path: "/portal/maintenance/:id",
      element: <MaintenanceRecordPage />,
      roles: ["CUSTOMER_ADMIN"],
    },
    {
      path: "/portal/locations",
      element: <PortalLocationsPage />,
      roles: customerRoles,
    },
    {
      path: "/portal/notifications",
      element: <NotificationInbox />,
      roles: customerRoles,
    },
    {
      path: "/portal/equipment-handovers",
      element: <HandoverListPage />,
      roles: customerRoles,
    },
    {
      path: "/portal/equipment-handovers/:id",
      element: <HandoverDetailPage />,
      roles: customerRoles,
    },
    { path: "/portal/profile", element: <ProfilePage />, roles: customerRoles },
    {
      path: "/portal/users",
      element: <UsersPage />,
      roles: ["CUSTOMER_ADMIN"],
    },
    {
      path: "/portal/users/invite",
      element: <InvitePage />,
      roles: ["CUSTOMER_ADMIN"],
    },
    { path: "/app/profile", element: <ProfilePage />, roles: tenantRoles },
    {
      path: "/admin/profile",
      element: <ProfilePage />,
      roles: ["PLATFORM_ADMIN"],
    },
  ];
function Authenticated() {
  const { profile } = useSession();
  const location = useLocation();
  if (!profile) {
    const target = location.pathname.startsWith("/portal/qr/")
      ? `/login?next=${encodeURIComponent(location.pathname)}`
      : "/login";
    return <Navigate to={target} replace />;
  }
  return (
    <Layout key={getSessionGeneration()}>
      <Routes>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/demo" element={<DemoPage />} />
        {workspaceRoutes.map((item) => (
          <Route
            key={item.path}
            path={item.path}
            element={<Gate roles={item.roles}>{item.element}</Gate>}
          />
        ))}
        <Route
          path="/"
          element={<Navigate to={home(profile.roles)} replace />}
        />
        <Route
          path="/tenants"
          element={
            <Gate roles={menu[3].roles}>
              <TenantListPage />
            </Gate>
          }
        />
        <Route
          path="/customers"
          element={
            <Gate roles={menu[0].roles}>
              <CustomersPage />
            </Gate>
          }
        />
        <Route
          path="/customers/:id"
          element={
            <Gate roles={menu[0].roles}>
              <CustomerDetailPage />
            </Gate>
          }
        />
        <Route
          path="/equipment"
          element={
            <Gate roles={menu[1].roles}>
              <EquipmentPage />
            </Gate>
          }
        />
        <Route
          path="/equipment/:id"
          element={
            <Gate roles={menu[1].roles}>
              <DossierPage />
            </Gate>
          }
        />
        <Route
          path="/requests"
          element={
            <Gate roles={menu[2].roles}>
              <RequestsPage />
            </Gate>
          }
        />
        <Route
          path="/requests/new"
          element={
            <Gate roles={creators}>
              <NewRequestPage />
            </Gate>
          }
        />
        <Route
          path="/requests/:id"
          element={
            <Gate roles={menu[2].roles}>
              <RequestDetailPage />
            </Gate>
          }
        />
        <Route
          path="/users/invite"
          element={
            <Gate roles={menu[4].roles}>
              <InvitePage />
            </Gate>
          }
        />
        <Route
          path="/portal/qr/:token"
          element={
            <Gate roles={menu[1].roles}>
              <QrPage />
            </Gate>
          }
        />
        <Route
          path="/403"
          element={<Message code="403" title="Không có quyền truy cập" />}
        />
        <Route
          path="*"
          element={<Message code="404" title="Không tìm thấy trang" />}
        />
      </Routes>
    </Layout>
  );
}
function Content() {
  const { setProfile } = useSession();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let active = true;
    restoreSession()
      .then((profile) => {
        if (active) setProfile(profile);
      })
      .finally(() => {
        if (active) setReady(true);
      });
    return () => {
      active = false;
    };
  }, [setProfile]);
  return !ready ? (
    <div className="m1-login">
      <Loading />
    </div>
  ) : (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      {WorkshopDesignStudio && (
        <Route
          path="/design/workshop"
          element={
            <Suspense fallback={<Loading />}>
              <WorkshopDesignStudio />
            </Suspense>
          }
        />
      )}
      <Route path="/activate" element={<ActivatePage />} />
      <Route path="/*" element={<Authenticated />} />
    </Routes>
  );
}
export default function App() {
  return (
    <SessionProvider>
      <Content />
    </SessionProvider>
  );
}

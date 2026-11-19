import { BranchAllocationPage } from "./features/workspace/BranchManagement";
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
import {
  canCreateInspection,
  requestIntake,
} from "./features/workspace/request-intake";
import { useWorkspaceData } from "./features/workspace/workspace-data";
import { recordLabel } from "./display-names";
import { PartRequestDetail, PartRequestQueue } from "./features/inventory/PartRequests";
import { ModelPolicyPage } from "./routes/ModelPolicyPage";
import { WarrantyAssessmentPanel } from "./routes/ModelPolicyPanels";
import { useDirectory } from "./routes/registration-data";
import type { DirectoryRow } from "./routes/registration-data";
import EquipmentBatchUpdatePanel from "./features/equipment/EquipmentBatchUpdatePanel";
import { downloadBlob, makeCsv, makeXlsx } from "./features/equipment/spreadsheet";
import { BulkHandoverPage, PublicQrInquiriesPage, PublicQrLandingPage, PublicQrSettingsPage } from './routes/MinhAssetUx';

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
import { Boxes, Building2, ChevronRight, RotateCcw, Search, SlidersHorizontal } from "lucide-react";
import { api, ApiError } from "./api/client";
import { creators, has, home, menu } from "./auth/access";
import { PriorityBadge, StatusBadge } from "./components/Badges";
import ActivatePage from "./routes/ActivatePage";
import { ForgotPasswordPage } from "./routes/PasswordPages";
import AuthStory from "./routes/AuthStory";
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
  EquipmentListSummary,
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
  INSPECTION: "Khảo sát",
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
  const [tenantCode, setTenantCode] = useState("MP");
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
      <AuthStory />
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
        <Link to="/forgot-password">Quên mật khẩu?</Link>
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
  eyebrow,
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
      <header className="m1-header page-title-header">
        {eyebrow && <span className="m1-eyebrow page-title-eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
        {action && <div className="ws-actions page-title-actions">{action}</div>}
        {description && <p className="page-title-description">{description}</p>}
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
      eyebrow={data.value?.code}
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
  const canFilterOrganization = profile?.userType !== "CUSTOMER";
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [equipmentRevision, setEquipmentRevision] = useState(0);
  const [draftFilters, setDraftFilters] = useState({
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
  });
  const [filters, setFilters] = useState(draftFilters);
  const [selected, setSelected] = useState<Record<string, EquipmentRecord>>({});
  const [customerLookup, setCustomerLookup] = useState("");
  const [customerQuery, setCustomerQuery] = useState("");
  useEffect(() => {
    const timer = window.setTimeout(() => setCustomerQuery(customerLookup.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [customerLookup]);
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState("");
  const [exportError, setExportError] = useState("");
  const [showBulkUpdate, setShowBulkUpdate] = useState(false);
  const customers = useDirectory<Page<CustomerRecord>>("organization", canFilterOrganization ? `/customers?page=1&pageSize=100${customerQuery ? `&q=${encodeURIComponent(customerQuery)}` : ""}` : null);
  const sites = useDirectory<DirectoryRow[]>("organization", filters.customerId ? `/customers/${filters.customerId}/sites` : null);
  const filterSites = useDirectory<DirectoryRow[]>("organization", draftFilters.customerId ? `/customers/${draftFilters.customerId}/sites` : null);
  const appliedLocations = useDirectory<DirectoryRow[]>("organization", filters.siteId ? `/sites/${filters.siteId}/locations` : null);
  const filterLocations = useDirectory<DirectoryRow[]>("organization", draftFilters.siteId ? `/sites/${draftFilters.siteId}/locations` : null);
  const params = new URLSearchParams({ page: String(page), pageSize: "20" });
  if (search) params.set("q", search);
  Object.entries(filters).forEach(([key, value]) => {
    if (value && (key !== "registrationStatus" || canManage)) params.set(key, value);
  });
  if (filters.customerId) params.set("customerId", filters.customerId);
  if (filters.siteId) params.set("siteId", filters.siteId);
  if (filters.locationId) params.set("locationId", filters.locationId);
  const data = useDirectory<Page<EquipmentRecord> & { summary?: EquipmentListSummary }>(
    "assetM2",
    `/equipment?${params.toString()}`,
    equipmentRevision,
  );
  const summary = data.value?.summary;
  const statusLabels: Record<string, string> = {
    ACTIVE: "Hoạt động",
    IN_SERVICE: "Đang sử dụng",
    OUT_OF_SERVICE: "Ngừng hoạt động",
    RETIRED: "Ngừng sử dụng",
  };
  const operationalLabels: Record<string, string> = {
    UNKNOWN: "Chưa đánh giá",
    OPERATIONAL: "Đang vận hành",
    DEGRADED: "Hoạt động hạn chế",
    NOT_OPERATIONAL: "Không vận hành",
  };
  const warrantyLabels: Record<string, string> = {
    IN_WARRANTY: "Còn hiệu lực hôm nay",
    OUT_OF_WARRANTY: "Đã hết hạn",
    NO_WARRANTY: "Không có hiệu lực hôm nay",
  };
  const registrationLabels: Record<string, string> = {
    NOT_RECORDED: "Chưa ghi nhận",
    DRAFT: "Chưa hoàn tất",
    PENDING_MAINTENANCE: "Chờ bảo trì",
    PENDING_CUSTOMER_CONFIRMATION: "Chờ khách xác nhận",
    COMPLETED: "Đã hoàn tất",
  };
  const activeFilters = [
    search ? `Tìm: ${search}` : "",
    filters.status ? `Trạng thái: ${statusLabels[filters.status]}` : "",
    filters.operationalStatus ? `Vận hành: ${operationalLabels[filters.operationalStatus]}` : "",
    filters.warranty ? `Bảo hành: ${warrantyLabels[filters.warranty]}` : "",
    filters.registrationStatus && canManage ? `Hồ sơ: ${registrationLabels[filters.registrationStatus]}` : "",
    filters.customerId ? `Khách: ${(customers.value?.items ?? []).find(row => row.id === filters.customerId)?.name ?? "đã chọn"}` : "",
    filters.siteId ? `Cơ sở: ${(sites.value ?? []).find(row => row.id === filters.siteId)?.name ?? "đã chọn"}` : "",
    filters.locationId ? `Vị trí: ${(appliedLocations.value ?? []).find(row => row.id === filters.locationId)?.name ?? "đã chọn"}` : "",
    filters.installationDateMissing === "YES" ? "Ngày lắp chưa ghi nhận" : "",
    filters.installationDateMissing === "NO" ? "Đã ghi nhận ngày lắp" : "",
    filters.handoverFrom || filters.handoverTo
      ? `Bàn giao: ${filters.handoverFrom || "…"} – ${filters.handoverTo || "…"}`
      : "",
    filters.purchaseFrom || filters.purchaseTo
      ? `Ngày mua: ${filters.purchaseFrom || "…"} – ${filters.purchaseTo || "…"}`
      : "",
    filters.installationFrom || filters.installationTo
      ? `Lắp đặt: ${filters.installationFrom || "…"} – ${filters.installationTo || "…"}`
      : "",
  ].filter(Boolean);
  const clearFilters = () => {
    const empty = {
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
    setQuery("");
    setSearch("");
    setDraftFilters(empty);
    setFilters(empty);
    setPage(1);
    setSelected({});
  };
  const exportHeaders = ["equipmentId", "updatedAt", "assetCode", "serialNumber", "displayName", "model", "customer", "customerCode", "site", "siteCode", "location", "locationCode", "status", "operationalStatus", "purchaseDate", "handoverDate", "installationDate", "warranty", "warrantyEndDate", "exportedAt", "appliedFilters"];
  const exportRows = async (onlySelected: boolean, format: "csv" | "xlsx") => {
    setExporting(true);
    setExportError("");
    try {
      let all: EquipmentRecord[] = [];
      let total = data.value?.total ?? 0;
      const exportedAt = new Date().toISOString();
      for (let currentPage = 1; currentPage <= Math.max(1, Math.ceil(total / 100)); currentPage++) {
        const query = new URLSearchParams(params);
        query.set("page", String(currentPage));
        query.set("pageSize", "100");
        const result = await api.assetM2<Page<EquipmentRecord> & { summary?: EquipmentListSummary }>(`/equipment?${query.toString()}`);
        all = all.concat(result.items);
        total = result.total;
        setExportProgress(Math.min(all.length, total).toLocaleString("vi-VN") + " / " + total.toLocaleString("vi-VN"));
        if (all.length >= total || result.items.length === 0) break;
      }
      if (onlySelected) {
        const ids = new Set(Object.keys(selected));
        all = all.filter(row => ids.has(row.id));
      }
      const rows = all.map(item => ({
        equipmentId: item.id,
        updatedAt: item.updatedAt ?? "",
        assetCode: item.assetCode,
        serialNumber: item.serialNumber,
        displayName: item.displayName ?? "",
        model: item.model?.name ?? "",
        customer: item.customerDisplay?.name ?? "",
        customerCode: item.customerDisplay?.code ?? "",
        site: item.siteDisplay?.name ?? "",
        siteCode: item.siteDisplay?.code ?? "",
        location: item.locationDisplay?.name ?? "",
        locationCode: item.locationDisplay?.code ?? "",
        status: item.status,
        operationalStatus: item.operationalStatus ?? "UNKNOWN",
        purchaseDate: item.purchaseDate ?? "",
        handoverDate: item.handoverDate ?? "",
        installationDate: item.installationDate ?? "",
        warranty: item.warranty?.result ?? "",
        warrantyEndDate: item.warranty?.endDate ?? "",
        exportedAt,
        appliedFilters: activeFilters.join(" | ") || "Không lọc",
      }));
      const scopeLabel = onlySelected ? "da-chon" : "ket-qua-loc";
      const date = new Date().toISOString().slice(0, 10);
      if (format === "xlsx") downloadBlob(new Blob([makeXlsx(exportHeaders, rows)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `thiet-bi-${scopeLabel}-${date}.xlsx`);
      else downloadBlob(new Blob([makeCsv(exportHeaders, rows)], { type: "text/csv;charset=utf-8" }), `thiet-bi-${scopeLabel}-${date}.csv`);
    } catch (cause) {
      setExportError(cause instanceof Error ? cause.message : "Không xuất được dữ liệu thiết bị.");
    } finally { setExporting(false); setExportProgress(""); }
  };
  const currentItems = data.value?.items ?? [];
  const pageSelected = currentItems.length > 0 && currentItems.every(item => selected[item.id]);
  const togglePage = () => setSelected(current => {
    const next = { ...current };
    if (pageSelected) currentItems.forEach(item => delete next[item.id]);
    else currentItems.forEach(item => { next[item.id] = item; });
    return next;
  });
  return (
    <Frame
      title="Thiết bị"
      description="Tra cứu theo khách hàng, cơ sở, vị trí lắp đặt, ngày mua, ngày bàn giao, tình trạng và bảo hành trong phạm vi bạn được phép xem."
      action={
        canManage ? (
          <div className="equipment-header-actions">
            <Link className="ws-button ws-button--secondary" to="/app/bulk-handovers">Nhập lô CSV / XLSX</Link>
            <Link className="m1-button" to="/app/equipment-registrations/new">+ Ghi nhận bàn giao</Link>
          </div>
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
          <div className="equipment-summary" aria-label="Tổng quan kết quả đã lọc">
            {[
              ["Thiết bị phù hợp", data.value?.total],
              ["Hoạt động", summary?.active],
              ["Đang sử dụng", summary?.inService],
              ["Ngoài dịch vụ", summary?.outOfService],
              ["Còn bảo hành", summary?.inWarranty],
              ["Chưa ghi nhận ngày lắp", summary?.withoutInstallationDate],
            ].map(([label, value]) => (
              <div className="equipment-summary__card" key={String(label)}>
                <span>{label}</span>
                <strong>{typeof value === "number" ? value.toLocaleString("vi-VN") : "—"}</strong>
                <small>Trong kết quả lọc</small>
              </div>
            ))}
          </div>
          <section className="m1-card equipment-filter-card" aria-labelledby="equipment-filter-title">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setSearch(query.trim());
                setFilters({ ...draftFilters });
                setPage(1);
                setSelected({});
              }}
              className="equipment-filter-form"
            >
              <div className="equipment-filter-heading">
                <div>
                  <SlidersHorizontal size={18} aria-hidden="true" />
                  <div>
                    <h2 id="equipment-filter-title">Tìm và lọc thiết bị</h2>
                    <p>Tìm trên dữ liệu thuộc phạm vi của bạn; ngày bắt đầu và kết thúc đều được tính.</p>
                  </div>
                </div>
                <button type="button" className="equipment-reset-button" onClick={clearFilters}>
                  <RotateCcw size={15} aria-hidden="true" /> Xóa điều kiện
                </button>
              </div>
              <div className="equipment-filter-grid">
                <label className="equipment-filter-search">
                  <span>Mã thiết bị, serial hoặc model</span>
                  <div className="equipment-search-input">
                    <Search size={17} aria-hidden="true" />
                    <input
                      aria-label="Tìm mã thiết bị, serial hoặc model"
                      placeholder="Nhập mã, số sê-ri hoặc model"
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                    />
                  </div>
                </label>
                <label>
                  <span>Trạng thái thiết bị</span>
                  <select value={draftFilters.status} onChange={(e) => setDraftFilters({ ...draftFilters, status: e.target.value })}>
                    <option value="">Tất cả</option>
                    <option value="ACTIVE">Hoạt động</option>
                    <option value="IN_SERVICE">Đang sử dụng</option>
                    <option value="OUT_OF_SERVICE">Ngừng hoạt động</option>
                    <option value="RETIRED">Ngừng sử dụng</option>
                  </select>
                </label>
                {canFilterOrganization && <label>
                  <span>Tìm khách hàng theo mã / tên</span>
                  <input aria-label="Tìm khách hàng" placeholder="Nhập mã hoặc tên khách" value={customerLookup} onChange={e => setCustomerLookup(e.target.value)} />
                </label>}
                {canFilterOrganization && <label>
                  <span>Khách hàng</span>
                  <select value={draftFilters.customerId} onChange={e => setDraftFilters({ ...draftFilters, customerId: e.target.value, siteId: "", locationId: "" })}>
                    <option value="">Tất cả khách hàng</option>
                    {(customers.value?.items ?? []).map(customer => <option key={customer.id} value={customer.id}>{customer.code} · {customer.name}</option>)}
                  </select>
                </label>}
                {canFilterOrganization && <label>
                  <span>Cơ sở khách hàng</span>
                  <select value={draftFilters.siteId} disabled={!draftFilters.customerId || filterSites.loading} onChange={e => setDraftFilters({ ...draftFilters, siteId: e.target.value, locationId: "" })}>
                    <option value="">Tất cả cơ sở</option>
                    {(filterSites.value ?? []).map(site => <option key={site.id} value={site.id}>{site.code ? `${site.code} · ` : ""}{site.name}</option>)}
                  </select>
                </label>}
                {canFilterOrganization && <label>
                  <span>Vị trí lắp đặt</span>
                  <select value={draftFilters.locationId} disabled={!draftFilters.siteId || filterLocations.loading} onChange={e => setDraftFilters({ ...draftFilters, locationId: e.target.value })}>
                    <option value="">Tất cả vị trí</option>
                    {(filterLocations.value ?? []).map(location => <option key={location.id} value={location.id}>{location.code ? `${location.code} · ` : ""}{location.name}</option>)}
                  </select>
                </label>}
                <label>
                  <span>Tình trạng vận hành</span>
                  <select value={draftFilters.operationalStatus} onChange={(e) => setDraftFilters({ ...draftFilters, operationalStatus: e.target.value })}>
                    <option value="">Tất cả</option>
                    {Object.entries(operationalLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </label>
                <label>
                  <span>Bảo hành</span>
                  <select value={draftFilters.warranty} onChange={(e) => setDraftFilters({ ...draftFilters, warranty: e.target.value })}>
                    <option value="">Tất cả</option>
                    <option value="IN_WARRANTY">Còn hiệu lực hôm nay</option>
                    <option value="OUT_OF_WARRANTY">Đã hết hạn</option>
                    <option value="NO_WARRANTY">Không có hiệu lực hôm nay</option>
                  </select>
                </label>
                <label>
                  <span>Tình trạng lắp đặt</span>
                  <select value={draftFilters.installationDateMissing} onChange={(e) => setDraftFilters({ ...draftFilters, installationDateMissing: e.target.value })}>
                    <option value="">Tất cả</option>
                    <option value="YES">Chưa ghi nhận ngày lắp</option>
                    <option value="NO">Đã ghi nhận ngày lắp</option>
                  </select>
                </label>
                {canManage && (
                  <label>
                    <span>Hồ sơ dịch vụ</span>
                    <select value={draftFilters.registrationStatus} onChange={(e) => setDraftFilters({ ...draftFilters, registrationStatus: e.target.value })}>
                      <option value="">Tất cả</option>
                      {Object.entries(registrationLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </label>
                )}
                <fieldset className="equipment-date-filter">
                  <legend>Ngày mua</legend>
                  <label><span>Từ ngày</span><input type="date" value={draftFilters.purchaseFrom} onChange={(e) => setDraftFilters({ ...draftFilters, purchaseFrom: e.target.value })} /></label>
                  <label><span>Đến ngày</span><input type="date" value={draftFilters.purchaseTo} onChange={(e) => setDraftFilters({ ...draftFilters, purchaseTo: e.target.value })} /></label>
                </fieldset>
                <fieldset className="equipment-date-filter">
                  <legend>Ngày bàn giao thực tế</legend>
                  <label><span>Từ ngày</span><input type="date" value={draftFilters.handoverFrom} onChange={(e) => setDraftFilters({ ...draftFilters, handoverFrom: e.target.value })} /></label>
                  <label><span>Đến ngày</span><input type="date" value={draftFilters.handoverTo} onChange={(e) => setDraftFilters({ ...draftFilters, handoverTo: e.target.value })} /></label>
                </fieldset>
                <fieldset className="equipment-date-filter">
                  <legend>Ngày lắp đặt thực tế</legend>
                  <label><span>Từ ngày</span><input type="date" value={draftFilters.installationFrom} onChange={(e) => setDraftFilters({ ...draftFilters, installationFrom: e.target.value })} /></label>
                  <label><span>Đến ngày</span><input type="date" value={draftFilters.installationTo} onChange={(e) => setDraftFilters({ ...draftFilters, installationTo: e.target.value })} /></label>
                </fieldset>
              </div>
              {activeFilters.length > 0 && (
                <div className="equipment-active-filters" aria-live="polite">
                  <strong>Điều kiện đang áp dụng</strong>
                  {activeFilters.map((filter) => <span key={filter}>{filter}</span>)}
                </div>
              )}
              <div className="equipment-filter-actions">
                <span>Model, serial và mã thiết bị được tìm trên toàn bộ dữ liệu theo quyền.</span>
                <button type="submit" className="m1-button">Áp dụng bộ lọc</button>
              </div>
            </form>
          </section>
          <section className="m1-card m1-table-card equipment-results-card" aria-label="Danh sách thiết bị">
            <div className="equipment-results-heading">
              <div>
                <h2>Danh sách thiết bị</h2>
                <p>{data.value?.total ?? 0} kết quả · sắp xếp theo thời gian tạo mới nhất</p>
              </div>
              <div className="equipment-export-actions">
                {canManage && <button type="button" className="ws-button ws-button--secondary" onClick={() => setShowBulkUpdate(value => !value)}>{showBulkUpdate ? "Đóng nhập lô" : "Nhập / cập nhật lô"}</button>}
                <button type="button" className="ws-button ws-button--secondary" disabled={exporting || !data.value?.total} onClick={() => void exportRows(false, "csv")}>{exporting ? "Đang xuất " + exportProgress + "…" : "Xuất tất cả đã lọc · CSV"}</button>
                <button type="button" className="ws-button ws-button--secondary" disabled={exporting || !data.value?.total} onClick={() => void exportRows(false, "xlsx")}>{exporting ? "Đang xuất " + exportProgress + "…" : "XLSX"}</button>
                <button type="button" className="ws-button ws-button--secondary" disabled={exporting || !Object.keys(selected).length} onClick={() => void exportRows(true, "csv")}>Xuất {Object.keys(selected).length} dòng đã chọn</button>
                <button type="button" className="ws-button ws-button--secondary" disabled={exporting || !Object.keys(selected).length} onClick={() => void exportRows(true, "xlsx")}>XLSX đã chọn</button>
              </div>
            </div>
            {exportError && <p className="m1-error" role="alert">{exportError}</p>}
            {showBulkUpdate && canManage && <EquipmentBatchUpdatePanel onClose={() => setShowBulkUpdate(false)} onUpdated={() => setEquipmentRevision(value => value + 1)} onComplete={() => { setShowBulkUpdate(false); setSelected({}); setPage(1); setEquipmentRevision(value => value + 1); }} />}
            {!data.value?.items.length ? (
              <div className="equipment-empty-state">
                <strong>Không tìm thấy thiết bị</strong>
                <span>Thử bỏ bớt điều kiện lọc hoặc kiểm tra mã/serial đã nhập.</span>
              </div>
            ) : (
              <>
                <div className="equipment-grid-scroll" role="region" aria-label="Bảng thiết bị, cuộn ngang để xem thêm cột" tabIndex={0}>
                  <table className="equipment-grid">
                  <thead>
                    <tr>
                      <th><input type="checkbox" aria-label="Chọn tất cả thiết bị trang này" checked={pageSelected} onChange={togglePage} /></th>
                      <th className="equipment-grid__identity">Thiết bị</th>
                      <th>Khách hàng / vị trí</th>
                      <th>Số sê-ri</th>
                      <th>Mua / bàn giao / lắp đặt</th>
                      <th>Hiệu lực bảo hành</th>
                      <th>Tình trạng</th>
                      {canManage && <th>Hồ sơ dịch vụ</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {data.value?.items.map((item) => (
                      <tr key={item.id}>
                        <td><input type="checkbox" aria-label={`Chọn ${item.assetCode}`} checked={!!selected[item.id]} onChange={event => setSelected(current => { const next = { ...current }; if (event.target.checked) next[item.id] = item; else delete next[item.id]; return next; })} /></td>
                        <td className="equipment-grid__identity">
                          <Link
                            to={`${profile?.userType === "CUSTOMER" ? "/portal" : "/app"}/equipment/${item.id}`}
                          >
                            {item.assetCode}
                          </Link>
                          <strong>{item.displayName || item.model?.name || "Thiết bị chưa có tên"}</strong>
                          <small>{[item.model?.manufacturer, item.model?.modelCode].filter(Boolean).join(" · ") || item.model?.name || "Chưa có thông tin model"}</small>
                        </td>
                        <td className="equipment-context-cell">
                          <strong>{item.customerDisplay ? `${item.customerDisplay.code ? `${item.customerDisplay.code} · ` : ""}${item.customerDisplay.name}` : "Tên khách hàng chưa sẵn sàng"}</strong>
                          <span>{item.siteDisplay ? `${item.siteDisplay.code ? `${item.siteDisplay.code} · ` : ""}${item.siteDisplay.name}` : "Tên cơ sở chưa sẵn sàng"}</span>
                          {item.siteDisplay?.address && <small>{item.siteDisplay.address}</small>}
                          {item.locationDisplay && <span>Vị trí: {item.locationDisplay.code ? `${item.locationDisplay.code} · ` : ""}{item.locationDisplay.name}</span>}
                        </td>
                        <td>{item.serialNumber}</td>
                        <td className="equipment-dates-cell">
                          <span><b>Mua</b>{item.purchaseDate || "Chưa ghi nhận"}</span>
                          <span><b>Bàn giao</b>{item.handoverDate || "Chưa ghi nhận"}</span>
                          <span><b>Lắp đặt</b>{item.installationDate || "Chưa ghi nhận"}</span>
                        </td>
                        <td>
                          {item.warranty?.result ? (
                            <div className="equipment-warranty-cell">
                              <StatusBadge status={item.warranty.result} />
                              {item.warranty?.endDate && <small>Đến {item.warranty.endDate}</small>}
                            </div>
                          ) : (
                            "Chưa có dữ liệu"
                          )}
                        </td>
                        <td>
                          <div className="equipment-status-cell">
                            <StatusBadge status={item.status} label={equipmentLifecycleLabel(item.status)} />
                            <small>{operationalLabels[item.operationalStatus || "UNKNOWN"]}</small>
                          </div>
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
                                  : item.registrationStatus ===
                                      "PENDING_CUSTOMER_CONFIRMATION"
                                    ? "Chờ khách xác nhận"
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
                </div>
                <footer className="m1-table-pagination ws-pagination">
                  <span>
                    Hiển thị {(page - 1) * 20 + 1}–{Math.min(page * 20, data.value?.total ?? 0)} / {data.value?.total ?? 0}
                  </span>
                  <div>
                    <button
                      type="button"
                      className="ws-button ws-button--secondary"
                      disabled={page === 1}
                      onClick={() => setPage(page - 1)}
                    >
                      Trước
                    </button>
                    <button
                      type="button"
                      className="ws-button ws-button--secondary"
                      disabled={page * 20 >= (data.value?.total ?? 0)}
                      onClick={() => setPage(page + 1)}
                    >
                      Sau
                    </button>
                  </div>
                </footer>
              </>
            )}
          </section>
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
    <div
      className={`m1-activity${mode !== "all" ? ` m1-activity--${mode}` : ""}`}
    >
      {mode !== "comments" && (
        <section
          className="request-status-history"
          aria-label="Lịch sử trạng thái"
        >
          {mode !== "history" && <h3>Lịch sử trạng thái</h3>}
          {history.loading ? (
            <Loading />
          ) : history.error ? (
            <Problem error={history.error} />
          ) : !history.value?.length ? (
            <Empty />
          ) : (
            <ol className="request-status-list">
              {history.value
                .filter((item) => item.newStatus)
                .map((item) => (
                  <li className="request-status-event" key={item.id}>
                    <div className="request-status-meta">
                      <div className="request-status-transition">
                        {item.oldStatus ? (
                          <>
                            <StatusBadge status={item.oldStatus} />
                            <span
                              className="request-status-arrow"
                              role="img"
                              aria-label="chuyển sang"
                            >
                              →
                            </span>
                          </>
                        ) : (
                          <span className="request-status-created">Tạo yêu cầu</span>
                        )}
                        <StatusBadge status={item.newStatus} />
                      </div>
                      <time dateTime={item.changedAt}>
                        <DateText value={item.changedAt} />
                      </time>
                    </div>
                    {item.reason && (
                      <p className="request-status-reason">{item.reason}</p>
                    )}
                  </li>
                ))}
            </ol>
          )}
        </section>
      )}
      {mode !== "history" && (
        <section className="request-conversation" aria-label="Danh sách bình luận">
          {mode !== "comments" && <h3>Bình luận</h3>}
          {comments.loading ? (
            <Loading />
          ) : comments.error ? (
            <Problem error={comments.error} />
          ) : !comments.value?.length ? (
            <p className="request-conversation-empty">
              Chưa có bình luận. Trao đổi về yêu cầu tại đây.
            </p>
          ) : (
            <ul className="request-comment-list">
              {comments.value.map((item) => (
                <li className="request-comment" key={item.id}>
                  <div className="request-comment-meta">
                    <span
                      className={`request-comment-scope${item.visibility === "INTERNAL" ? " request-comment-scope--internal" : ""}`}
                    >
                      {item.visibility === "INTERNAL"
                        ? "Trao đổi nội bộ"
                        : "Khách hàng thấy"}
                    </span>
                    <time dateTime={item.createdAt}>
                      <DateText value={item.createdAt} />
                    </time>
                  </div>
                  <p className="request-comment-content">{item.content}</p>
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
  const isManager = profile?.roles.includes("SERVICE_MANAGER") === true;
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
  const [nextFocus, setNextFocus] = useState<{ id: string; generation: number; target: string }>();
  const appliedFocus = useRef<typeof nextFocus>(undefined);
  const [draftStart, setDraftStart] = useState<{ id: string; generation: number; sequence: number }>();
  const [comment, setComment] = useState("");
  const [visibility, setVisibility] = useState<"CUSTOMER" | "INTERNAL">(
    "CUSTOMER",
  );
  const currentOverride =
    override?.generation === sessionGeneration ? override.value : null;
  const current =
    currentOverride?.id === data.value?.id ? currentOverride : data.value;
  const intake = current && isManager ? requestIntake(current) : null;
  const inspectionEligible = isManager && canCreateInspection(current, 0);
  const activeOrders = useWorkspaceData<Page<{ id: string; workOrderNo: string }>>(
    "workorders",
    inspectionEligible
      ? `/work-orders?serviceRequestId=${current?.id}&status=CREATED,ASSIGNED,ACCEPTED,TRAVELLING,IN_PROGRESS,ON_HOLD&pageSize=1`
      : null,
    version,
  );
  const inspectionAllowed = isManager && canCreateInspection(current, activeOrders.data?.total);
  const activeOrder = activeOrders.data?.items[0];
  const completedOrderNo = isManager && current?.status === "REVIEWING" ? current.resolvedWorkOrderNo : null;
  const completedOrderState = useWorkspaceData<Page<{ id: string; workOrderNo: string; type: string }>>(
    "workorders",
    completedOrderNo
      ? `/work-orders?serviceRequestId=${current?.id}&q=${encodeURIComponent(completedOrderNo)}&pageSize=10`
      : null,
    version,
  );
  const completedOrder = completedOrderState.data?.items.find((item) => item.workOrderNo === completedOrderNo);
  const completedInspection = completedOrder?.type === "INSPECTION" ? completedOrder : null;
  const showRepairResult = !completedInspection && !completedOrderState.loading;
  useEffect(() => {
    if (
      busy || !nextFocus || nextFocus.id !== current?.id ||
      nextFocus.generation !== sessionGeneration || nextFocus === appliedFocus.current
    ) return;
    const target = document.getElementById(nextFocus.target);
    if (!target) return;
    appliedFocus.current = nextFocus;
    target.focus();
  }, [busy, current?.id, nextFocus, sessionGeneration]);

  function advanceRequest(refreshed: RequestDetail, afterAssessment = false) {
    if (!isManager) return;
    const step = requestIntake(refreshed);
    setNextFocus({ id: refreshed.id, generation: sessionGeneration, target: step.target ?? "request-intake" });
    if (
      afterAssessment && refreshed.coverageAssessment?.decision === "NOT_COVERED" &&
      refreshed.allowedActions.includes("create-estimate")
    ) {
      setDraftStart(previous => ({ id: refreshed.id, generation: sessionGeneration, sequence: (previous?.sequence ?? 0) + 1 }));
    }
  }
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
      return refreshed;
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
  const inspectionDialog = useRef<HTMLDialogElement>(null);
  async function createWorkOrder(type?: "INSPECTION") {
    if (
      !current ||
      actionLock.current ||
      !isManager ||
      (type ? !inspectionAllowed : current.status !== "ACCEPTED") ||
      getSessionGeneration() !== sessionGeneration
    )
      return;
    actionLock.current = true;
    setBusy(true);
    setError(null);
    try {
      const order = await api.workorders<{ id: string }>("/work-orders", {
        method: "POST",
        body: { serviceRequestId: current.id, ...(type && { type }) },
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
      if (["review", "warranty-check", "accept"].includes(action)) advanceRequest(refreshed);
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
  const assessmentPanel = current && (
    <WarrantyAssessmentPanel
      key={`${sessionGeneration}:${current.id}`}
      request={current}
      changed={async () => {
        const refreshed = await refreshRequest();
        if (refreshed) advanceRequest(refreshed, true);
      }}
    />
  );
  const estimatePanel = current && (
    <EstimatePanel
      key={`${sessionGeneration}:${current.id}`}
      requestNo={current.requestNo}
      equipmentSummary={equipmentLabel.value
        ? recordLabel(equipmentLabel.value.assetCode, equipmentLabel.value.displayName, "Thiết bị chưa xác định")
        : undefined}
      requestId={current.id}
      allowedActions={current.allowedActions ?? []}
      openDraft={draftStart?.id === current.id && draftStart.generation === sessionGeneration ? draftStart.sequence : 0}
      onChange={() => void refreshRequest()}
    />
  );
  return (
    <Frame
      title={current?.title ?? "Yêu cầu dịch vụ"}
      eyebrow={current?.requestNo}
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
              (Boolean(current.resolutionResult) && showRepairResult)) && (
              <RequestCloseoutSummary request={current} />
            )}
            {completedInspection && (
              <ServiceNotice title="Đã hoàn tất khảo sát">
                <p>{current.resolutionSummary || "Xem báo cáo khảo sát để xác định phạm vi sửa chữa."}</p>
                <p>Lập dự toán khi đã xác định được công việc và chi phí.</p>
                <Link to={`/app/work-orders/${completedInspection.id}`}>Mở lệnh {completedInspection.workOrderNo}</Link>
              </ServiceNotice>
            )}
            {isManager && showRepairResult && current.resolutionResult === "UNRESOLVED" && (
              <section className="m1-card workshop-outcome-warning" aria-label="Kết quả xử lý trước">
                <strong>Lần xử lý trước chưa giải quyết được sự cố</strong>
                <p>{current.resolutionSummary || "Chưa có tóm tắt kết quả kỹ thuật."}</p>
                <p>Đọc lệnh liên quan và xác định phương án xử lý tiếp.</p>
              </section>
            )}
            {error ? <Problem error={error} /> : null}
            {intake && (
              <section id="request-intake" tabIndex={-1} aria-label="Tiến trình tiếp nhận">
                <ol className="sd-progress request-intake-progress">
                  {["Xem sự cố", "Thẩm định bảo hành", "Chọn phương án", "Điều phối & theo dõi"].map((label, index) => (
                    <li key={label} data-state={index < intake.stage ? "done" : index === intake.stage ? "current" : "pending"}
                      aria-current={index === intake.stage ? "step" : undefined}>
                      <span aria-hidden="true">{index < intake.stage ? "✓" : index + 1}</span>{label}
                    </li>
                  ))}
                </ol>
                <ServiceNotice title={intake.title}>
                  <p>{intake.detail}</p>
                </ServiceNotice>
              </section>
            )}
            <div className="m1-actions">
              <button className="request-refresh-action" disabled={busy} onClick={() => void refreshRequest()}>
                Làm mới trạng thái
              </button>
              {inspectionAllowed && (
                <button type="button" disabled={busy} onClick={() => inspectionDialog.current?.showModal()}>
                  Tạo lệnh khảo sát
                </button>
              )}
              {current.status === "ACCEPTED" &&
                isManager && (
                  <button
                    id="request-create-order"
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
                    id={`request-${action}`}
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
            {inspectionEligible && activeOrders.error && <p role="alert">Chưa kiểm tra được lệnh đang mở. Dùng Làm mới trạng thái để thử lại.</p>}
            {activeOrder && (
              <p><Link to={`/app/work-orders/${activeOrder.id}`}>Mở lệnh đang xử lý {activeOrder.workOrderNo}</Link></p>
            )}
            <dialog ref={inspectionDialog} aria-label="Xác nhận tạo lệnh khảo sát">
              <form method="dialog" className="m1-form">
                <h2>Tạo lệnh khảo sát</h2>
                <p>Xác nhận đã thống nhất phạm vi khảo sát với khách. Sau khảo sát, xem lại yêu cầu để thẩm định và lập dự toán nếu đủ điều kiện.</p>
                <div className="m1-actions">
                  <button type="submit">Quay lại</button>
                  <button type="button" disabled={busy || !inspectionAllowed} onClick={() => {
                    inspectionDialog.current?.close();
                    void createWorkOrder("INSPECTION");
                  }}>Xác nhận tạo lệnh</button>
                </div>
              </form>
            </dialog>
            {current.status === "PROCESSING" && (
              <p role="status">
                Đang chờ kết quả từ Work Order. Kết quả có thể xuất hiện sau ít
                phút; dùng “Làm mới trạng thái” để kiểm tra.
              </p>
            )}
            {intake && (
              <>
                <div className="m1-request-detail-grid request-intake-grid">
                  <section className="m1-card m1-section-card">
                    <div className="m1-section-header"><h2>Mô tả sự cố</h2></div>
                    <div className="m1-section-body m1-prose">{current.description}</div>
                    <div className="m1-section-body">
                      <Link to={`/app/equipment/${current.equipmentId}`}>
                        {recordLabel(equipmentLabel.value?.assetCode, equipmentLabel.value?.displayName, "Mở hồ sơ thiết bị")}
                      </Link>
                    </div>
                  </section>
                  <div id="request-assessment" tabIndex={-1}>{assessmentPanel}</div>
                </div>
                <div id="request-estimate" tabIndex={-1}>{estimatePanel}</div>
              </>
            )}
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
                          {!intake && <section className="m1-card m1-section-card">
                            <div className="m1-section-header">
                              <h2>Mô tả sự cố</h2>
                            </div>
                            <div className="m1-section-body m1-prose">
                              {current.description}
                            </div>
                          </section>}
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
                                  className="m1-comment request-comment-composer"
                                  onSubmit={addComment}
                                >
                                  <label htmlFor="request-comment-content">
                                    Viết bình luận
                                  </label>
                                  <textarea
                                    id="request-comment-content"
                                    aria-label="Nội dung trao đổi"
                                    aria-describedby="request-comment-visibility-help"
                                    disabled={busy}
                                    required
                                    maxLength={5000}
                                    rows={3}
                                    value={comment}
                                    onChange={(event) =>
                                      setComment(event.target.value)
                                    }
                                    placeholder="Nhập nội dung trao đổi về yêu cầu…"
                                  />
                                  <div className="request-comment-toolbar">
                                    {profile?.userType !== "CUSTOMER" &&
                                      profile &&
                                      has(profile.roles, [
                                        "SERVICE_MANAGER",
                                        "DISPATCHER",
                                        "TECHNICIAN",
                                      ]) && (
                                        <label className="request-comment-visibility">
                                          <span>Hiển thị với</span>
                                          <select
                                            aria-label="Phạm vi hiển thị trao đổi"
                                            disabled={busy}
                                            value={visibility}
                                            onChange={(event) =>
                                              setVisibility(
                                                event.target.value as
                                                  "CUSTOMER" | "INTERNAL",
                                              )
                                            }
                                          >
                                            <option value="CUSTOMER">
                                              Khách hàng và nhân viên
                                            </option>
                                            <option value="INTERNAL">
                                              Chỉ nội bộ
                                            </option>
                                          </select>
                                        </label>
                                      )}
                                    <button
                                      type="submit"
                                      disabled={busy || !comment.trim()}
                                    >
                                      {busy ? "Đang gửi…" : "Gửi bình luận"}
                                    </button>
                                  </div>
                                  <p
                                    id="request-comment-visibility-help"
                                    className="request-comment-help"
                                  >
                                    {profile?.userType !== "CUSTOMER" && visibility === "INTERNAL"
                                      ? "Chỉ nhân viên có quyền truy cập yêu cầu thấy bình luận này."
                                      : "Khách hàng và nhân viên có quyền truy cập yêu cầu thấy bình luận này."}
                                  </p>
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
                  label: intake ? "Hồ sơ & chính sách" : "Bảo hành & dự toán",
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
                      {!intake && <>{assessmentPanel}{estimatePanel}</>}
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
    { path: '/app/bulk-handovers', element: <BulkHandoverPage />, roles: ['TENANT_ADMIN', 'SERVICE_MANAGER'] },
    { path: '/app/public-qr-inquiries', element: <PublicQrInquiriesPage />, roles: ['SERVICE_MANAGER'] },
    { path: '/app/equipment/:id/public-qr', element: <PublicQrSettingsPage />, roles: ['TENANT_ADMIN', 'SERVICE_MANAGER'] },
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
      path: "/app/inventory/requests",
      element: <PartRequestQueue />,
      roles: ["TENANT_ADMIN", "SERVICE_MANAGER", "INVENTORY_STAFF"],
    },
    {
      path: "/app/inventory/requests/:kind/:id",
      element: <PartRequestDetail />,
      roles: ["TENANT_ADMIN", "SERVICE_MANAGER", "INVENTORY_STAFF"],
    },
    {
      path: "/app/inventory/transactions",
      element: <InventoryTransactionsRoute />,
      roles: ["TENANT_ADMIN", "INVENTORY_STAFF"],
    },
    {
      path: "/app/organization/service-branches",
      element: <BranchAllocationPage />,
      roles: ["TENANT_ADMIN"],
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
          path="/portal/qr/:token/secure"
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
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
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
      <Route path="/portal/qr/:token" element={<PublicQrLandingPage />} />
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

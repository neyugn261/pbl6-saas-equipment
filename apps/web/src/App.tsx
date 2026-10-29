import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import {
  Link,
  Navigate,
  NavLink,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from 'react-router-dom'
import {
  Boxes,
  Building2,
  Bell,
  ChevronRight,
  ClipboardList,
  Factory,
  Gauge,
  History,
  LayoutDashboard,
  LogOut,
  MapPin,
  Menu,
  Package,
  PanelLeftClose,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  UserCog,
  UserPlus,
  Users,
  Wrench,
  X,
  type LucideIcon,
} from 'lucide-react'
import { api, ApiError, isMockMode } from './api/client'
import { creators, has, home, menu } from './auth/access'
import { PriorityBadge, StatusBadge } from './components/Badges'
import ActivatePage from './routes/ActivatePage'
import DashboardPage from './routes/DashboardPage'
import DemoPage from './routes/DemoPage'
import { DossierPage, EquipmentFeedPage, HistoryFeedPage, ResourceHistoryPage, WorkOrderListPage, WorkOrderPage, MaintenancePage as LiveMaintenancePage, MaintenanceHistoryPage, MaintenanceRecordPage, RequestDossierExtras, TechniciansPage as LiveTechniciansPage, TechnicianPage } from './routes/M2Pages'
import { rememberDemoRequest } from './routes/demo-request'
import InvitePage from './routes/InvitePage'
import QrPage from './routes/QrPage'
import EstimatePanel from './routes/EstimatePanel'
import { AppStoreProvider } from './sample/state/AppStore'
import { DashboardPage as SampleDashboardPage } from './sample/pages/DashboardPage'
import { CustomerDetailPage as SampleCustomerDetailPage, CustomerFormPage as SampleCustomerFormPage, CustomersPage as SampleCustomersPage } from './sample/pages/CustomersPage'
import { OrganizationPage, PartDetailPage, PartsPage, PlatformAuxPage, PlatformDashboardPage, TenantDetailPage as SampleTenantDetailPage, TenantsPage as SampleTenantsPage, TransactionsPage, WarehousesPage } from './sample/pages/ManagementPage'
import { PortalDashboardPage, PortalSimplePage } from './sample/pages/PortalPage'
import { TenantFormPage } from './sample/pages/TenantFormPage'
import {
  login,
  logout,
  restoreSession,
  SessionProvider,
  useSession,
} from './auth/session'
import type {
  CustomerRecord,
  EquipmentRecord,
  Page,
  RequestComment,
  RequestDetail,
  RequestRecord,
  RequestStatusChange,
  TenantRecord,
} from './types/domain'
import './sample.css'
import './App.css'
import './restored.css'
import './m2.css'

const actionLabels: Record<string, string> = {
  review: 'Xem xét và kiểm tra bảo hành',
  'request-info': 'Yêu cầu bổ sung',
  'warranty-check': 'Kiểm tra bảo hành',
  accept: 'Tiếp nhận',
  reject: 'Từ chối',
  cancel: 'Hủy yêu cầu',
  confirm: 'Xác nhận hoàn tất',
  reopen: 'Mở lại',
}
const roleLabels: Record<string, string> = {
  PLATFORM_ADMIN: 'Quản trị nền tảng',
  TENANT_ADMIN: 'Quản trị doanh nghiệp',
  SERVICE_MANAGER: 'Quản lý dịch vụ',
  DISPATCHER: 'Điều phối viên',
  INVENTORY_STAFF: 'Nhân viên kho',
  TECHNICIAN: 'Kỹ thuật viên',
  CUSTOMER_ADMIN: 'Quản trị khách hàng',
  CUSTOMER_USER: 'Khách hàng',
}
const requestTypeLabels: Record<string, string> = {
  WARRANTY: 'Bảo hành',
  REPAIR: 'Sửa chữa',
  MAINTENANCE: 'Bảo trì',
  INSPECTION: 'Kiểm tra',
}
function Problem({ error }: { error: unknown }) {
  return (
    <p className="m1-error" role="alert">
      {error instanceof ApiError
        ? `${error.status} · ${error.message}`
        : error instanceof Error
          ? error.message
          : 'Không thể tải dữ liệu.'}
    </p>
  )
}
function Loading() {
  return <p role="status">Đang tải…</p>
}
function Empty() {
  return <p>Chưa có dữ liệu.</p>
}
function Gate({ roles, children }: { roles: string[]; children: ReactNode }) {
  const { profile } = useSession()
  return profile && has(profile.roles, roles) ? (
    children
  ) : (
    <Navigate to="/403" replace />
  )
}

function LoginPage() {
  const { profile, setProfile } = useSession()
  const navigate = useNavigate()
  const location = useLocation()
  const requestedNext = new URLSearchParams(location.search).get('next')
  const next =
    requestedNext?.startsWith('/portal/qr/') && !requestedNext.startsWith('//')
      ? requestedNext
      : null
  const [tenantCode, setTenantCode] = useState('DEMO')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [platform, setPlatform] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [busy, setBusy] = useState(false)
  if (profile) return <Navigate to={next ?? home(profile.roles)} replace />
  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const user = await login({
        email,
        password,
        ...(platform ? {} : { tenantCode }),
      })
      setProfile(user)
      navigate(next ?? home(user.roles), { replace: true })
    } catch (cause) {
      setError(cause)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="m1-login">
      <div className="login-story">
        <div className="login-story__brand"><span><Wrench size={22} /></span><strong>Servio</strong></div>
        <div><span className="m1-eyebrow">FIELD SERVICE CLOUD</span><h2 style={{ color: '#ffffff' }}>Quản lý dịch vụ thiết bị trong một không gian.</h2><p>Theo dõi thiết bị, bảo hành và yêu cầu hỗ trợ xuyên suốt hành trình sau bàn giao.</p></div>
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
          />{' '}
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
          {busy ? 'Đang đăng nhập…' : 'Đăng nhập'}
        </button>
      </form>
    </div>
  )
}
function Layout({ children }: { children: ReactNode }) {
  const { profile, clear } = useSession()
  const navigate = useNavigate()
  const location = useLocation()
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  if (!profile) return null
  const icons: Record<string, LucideIcon> = {
    '/customers': Building2,
    '/equipment': Boxes,
    '/requests': ClipboardList,
    '/tenants': ShieldCheck,
    '/users/invite': UserPlus,
  }
  const sampleItems: { path: string; label: string; icon: LucideIcon; group: string; roles: string[] }[] = [
    { path: '/app/work-orders', label: 'Lệnh công việc', icon: Wrench, group: 'Vận hành dịch vụ', roles: ['TENANT_ADMIN', 'SERVICE_MANAGER', 'DISPATCHER', 'TECHNICIAN'] },
    { path: '/app/equipment-history', label: 'Lịch sử thiết bị', icon: History, group: 'Vận hành dịch vụ', roles: ['TENANT_ADMIN', 'SERVICE_MANAGER', 'DISPATCHER', 'TECHNICIAN'] },
    { path: '/portal/equipment-history', label: 'Lịch sử thiết bị', icon: History, group: 'Cổng khách hàng', roles: ['CUSTOMER_ADMIN', 'CUSTOMER_USER'] },
    { path: '/portal/maintenance', label: 'Bảo trì định kỳ', icon: History, group: 'Cổng khách hàng', roles: ['CUSTOMER_ADMIN'] },
    { path: '/portal/maintenance-history', label: 'Lịch sử bảo trì', icon: History, group: 'Cổng khách hàng', roles: ['CUSTOMER_ADMIN'] },
    { path: '/app/technicians', label: 'Kỹ thuật viên', icon: UserCog, group: 'Vận hành dịch vụ', roles: ['TENANT_ADMIN', 'SERVICE_MANAGER', 'DISPATCHER'] },
    { path: '/app/maintenance', label: 'Bảo trì định kỳ', icon: History, group: 'Vận hành dịch vụ', roles: ['TENANT_ADMIN', 'SERVICE_MANAGER'] },
    { path: '/app/maintenance-history', label: 'Lịch sử bảo trì', icon: History, group: 'Vận hành dịch vụ', roles: ['TENANT_ADMIN', 'SERVICE_MANAGER'] },
    { path: '/app/inventory/parts', label: 'Phụ tùng', icon: Package, group: 'Kho phụ tùng', roles: ['TENANT_ADMIN', 'INVENTORY_STAFF'] },
    { path: '/app/inventory/warehouses', label: 'Kho & tồn kho', icon: Factory, group: 'Kho phụ tùng', roles: ['TENANT_ADMIN', 'INVENTORY_STAFF'] },
    { path: '/app/inventory/transactions', label: 'Giao dịch kho', icon: SlidersHorizontal, group: 'Kho phụ tùng', roles: ['TENANT_ADMIN', 'INVENTORY_STAFF'] },
    { path: '/app/organization/branches', label: 'Chi nhánh', icon: MapPin, group: 'Tổ chức', roles: ['TENANT_ADMIN'] },
    { path: '/app/organization/users', label: 'Người dùng', icon: Users, group: 'Tổ chức', roles: ['TENANT_ADMIN'] },
    { path: '/app/organization/roles', label: 'Vai trò & quyền', icon: ShieldCheck, group: 'Tổ chức', roles: ['TENANT_ADMIN'] },
    { path: '/app/reports', label: 'Báo cáo', icon: Gauge, group: 'Hệ thống', roles: ['TENANT_ADMIN', 'SERVICE_MANAGER'] },
    { path: '/app/settings', label: 'Cài đặt', icon: Settings, group: 'Hệ thống', roles: ['TENANT_ADMIN'] },
    { path: '/admin/audit-logs', label: 'Nhật ký kiểm toán', icon: History, group: 'Nền tảng', roles: ['PLATFORM_ADMIN'] },
    { path: '/admin/settings', label: 'Cài đặt nền tảng', icon: Settings, group: 'Nền tảng', roles: ['PLATFORM_ADMIN'] },
    { path: '/portal/locations', label: 'Địa điểm', icon: MapPin, group: 'Cổng khách hàng', roles: ['CUSTOMER_ADMIN', 'CUSTOMER_USER'] },
    { path: '/portal/notifications', label: 'Thông báo', icon: Bell, group: 'Cổng khách hàng', roles: ['CUSTOMER_ADMIN', 'CUSTOMER_USER'] },
    { path: '/portal/profile', label: 'Hồ sơ cá nhân', icon: UserCog, group: 'Cổng khách hàng', roles: ['CUSTOMER_ADMIN', 'CUSTOMER_USER'] },
  ]
  const liveOperations = menu.filter((item) => ['/customers', '/equipment', '/requests'].includes(item.path) && has(profile.roles, item.roles))
  const liveAdmin = menu.filter((item) => ['/tenants', '/users/invite'].includes(item.path) && has(profile.roles, item.roles))
  const navigation = [
    { path: '/dashboard', label: 'Tổng quan', icon: LayoutDashboard, group: 'Không gian làm việc' },
    ...liveOperations.map((item) => ({ path: item.path, label: item.label, icon: icons[item.path], group: 'Vận hành dịch vụ' })),
    ...sampleItems.filter((item) => has(profile.roles, item.roles)),
    ...liveAdmin.map((item) => ({ path: item.path, label: item.label, icon: icons[item.path], group: 'Quản trị' })),
  ]
  const section = navigation.find((item) => location.pathname === item.path || location.pathname.startsWith(`${item.path}/`))
  const initials = profile.fullName.split(' ').slice(-2).map((part) => part[0]).join('').toUpperCase()
  const scope = profile.userType === 'PLATFORM_STAFF' ? 'Phạm vi nền tảng' : profile.userType === 'CUSTOMER' ? 'Cổng khách hàng' : 'Doanh nghiệp hiện tại'
  const liveM2Page = /^\/(app|portal)\/(equipment(?:\/|$)|equipment-history$|warranties\/|models\/|service-requests(?:\/|$)|requests(?:\/|$)|work-orders(?:\/|$)|technicians(?:\/|$)|maintenance(?:\/|$)|maintenance-history$)/.test(location.pathname)
  const samplePage = !liveM2Page && (location.pathname.startsWith('/app/') || location.pathname === '/admin' || location.pathname.startsWith('/admin/') || location.pathname === '/portal' || (location.pathname.startsWith('/portal/') && !location.pathname.startsWith('/portal/qr/')))
  return (
    <div className={`m1-layout ${collapsed ? 'm1-layout--collapsed' : ''}`}>
      {mobileOpen && <button className="m1-mobile-overlay" aria-label="Đóng menu" onClick={() => setMobileOpen(false)} />}
      <aside className={`m1-sidebar ${mobileOpen ? 'm1-sidebar--open' : ''}`}>
        <div className="m1-brand">
          <Link to="/dashboard" onClick={() => setMobileOpen(false)}><span className="m1-brand__mark"><Wrench size={20} /></span><span className="m1-brand__name"><strong>Servio</strong><small>Field Service Cloud</small></span></Link>
          <button className="m1-mobile-close" aria-label="Đóng menu" onClick={() => setMobileOpen(false)}><X size={20} /></button>
        </div>
        <div className="m1-scope"><small>{scope}</small><strong>{profile.userType === 'PLATFORM_STAFF' ? 'PBL6 Service Cloud' : 'Không gian PBL6'}</strong><span>{profile.roles.map((role) => roleLabels[role] ?? role).join(', ')}</span></div>
        <nav className="m1-nav" aria-label="Điều hướng chính">
          {navigation.map((item, index) => {
            const Icon = item.icon
            return <div key={item.path}>
              {(index === 0 || item.group !== navigation[index - 1]?.group) && <p className="m1-nav-group">{item.group}</p>}
              <NavLink to={item.path} end={item.path === '/dashboard'} title={collapsed ? item.label : undefined} onClick={() => setMobileOpen(false)}><Icon size={19} /><span>{item.label}</span></NavLink>
            </div>
          })}
        </nav>
        <div className="m1-sidebar-footer">
          <button
            onClick={async () => {
              await logout()
              clear()
              navigate('/login')
            }}
          >
            <LogOut size={19} /><span>Đăng xuất</span>
          </button>
        </div>
      </aside>
      <div className="m1-workspace">
        <header className="m1-topbar">
          <div className="m1-topbar__left">
            <button className="m1-topbar-icon m1-mobile-menu" aria-label="Mở menu" onClick={() => setMobileOpen(true)}><Menu size={20} /></button>
            <button className="m1-topbar-icon m1-desktop-collapse" aria-label={collapsed ? 'Mở rộng menu' : 'Thu gọn menu'} onClick={() => setCollapsed((value) => !value)}><PanelLeftClose size={19} /></button>
            <Link className="m1-topbar-search" to={has(profile.roles, menu[1].roles) ? '/equipment' : '/tenants'}><Search size={17} /><span>{has(profile.roles, menu[1].roles) ? 'Tra cứu thiết bị' : 'Xem doanh nghiệp'}</span></Link>
          </div>
          <div className="m1-topbar-user"><span className="m1-avatar">{initials}</span><span><strong>{profile.fullName}</strong><small>{profile.roles.map((role) => roleLabels[role] ?? role).join(', ')}</small></span></div>
        </header>
        <main className="m1-main">
          <nav className="m1-breadcrumbs" aria-label="Đường dẫn"><Link to="/dashboard">Trang chủ</Link>{location.pathname !== '/dashboard' && <><ChevronRight size={14} /><Link to={section?.path ?? '/dashboard'}>{section?.label ?? 'Trang'}</Link>{section && location.pathname !== section.path && <><ChevronRight size={14} /><span>{location.pathname.endsWith('/new') ? 'Tạo mới' : 'Chi tiết'}</span></>}</>}</nav>
          {samplePage && <div className="m1-sample-notice" role="note">Dữ liệu mẫu giao diện Servio · Các thao tác trên trang này không gọi service thật.</div>}
          {isMockMode && samplePage && <p className="m1-mock-notice">Đang xem dữ liệu mẫu từ OpenAPI. Các thay đổi trên mock server không được lưu.</p>}
          {children}
        </main>
      </div>
    </div>
  )
}
function useLoad<T>(load: () => Promise<T>, key: string) {
  const [state, setState] = useState<{
    key: string
    value: T | null
    error: unknown
  }>({ key: '', value: null, error: null })
  useEffect(() => {
    let active = true
    load()
      .then((value) => {
        if (active) setState({ key, value, error: null })
      })
      .catch((error) => {
        if (active) setState({ key, value: null, error })
      })
    return () => {
      active = false
    }
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps
  return {
    value: state.key === key ? state.value : null,
    error: state.key === key ? state.error : null,
    loading: state.key !== key,
  }
}
function Frame({
  title,
  action,
  eyebrow = 'VẬN HÀNH DỊCH VỤ',
  description,
  children,
}: {
  title: string
  action?: ReactNode
  eyebrow?: string
  description?: string
  children: ReactNode
}) {
  return (
    <>
      <header className="m1-header">
        <div><span className="m1-eyebrow">{eyebrow}</span><h1>{title}</h1>{description && <p>{description}</p>}</div>
        {action}
      </header>
      {children}
    </>
  )
}
function formatDate(value: string | null | undefined) {
  const date = value ? new Date(value) : null
  return date && !Number.isNaN(date.getTime())
    ? new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' }).format(date)
    : '—'
}
function DateText({ value }: { value: string }) {
  return <>{formatDate(value)}</>
}

function CustomersPage() {
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('')
  const data = useLoad<Page<CustomerRecord>>(
    () => api.organization('/customers?page=1&pageSize=100'),
    'customers',
  )
  return (
    <Frame title="Khách hàng" description="Quản lý doanh nghiệp sử dụng thiết bị và các địa điểm vận hành.">
      {data.loading ? (
        <Loading />
      ) : data.error ? (
        <Problem error={data.error} />
      ) : (
        <div className="m1-card m1-table-card">
          <div className="m1-table-toolbar">
            <label className="m1-table-search"><Search size={17} /><input aria-label="Tìm khách hàng" placeholder="Tìm theo tên hoặc mã..." value={query} onChange={(event) => setQuery(event.target.value)} /></label>
            <select aria-label="Lọc trạng thái" value={status} onChange={(event) => setStatus(event.target.value)}><option value="">Tất cả trạng thái</option><option value="ACTIVE">Đang hoạt động</option><option value="INACTIVE">Ngừng hoạt động</option></select>
          </div>
          {!data.value?.items.filter((item) => `${item.name} ${item.code}`.toLowerCase().includes(query.toLowerCase()) && (!status || item.status === status)).length ? <div className="m1-list-empty">Không tìm thấy khách hàng phù hợp.</div> : <>
          <table>
            <thead>
              <tr>
                <th>Khách hàng</th>
                <th>Liên hệ</th>
                <th>Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {data.value?.items.filter((item) => `${item.name} ${item.code}`.toLowerCase().includes(query.toLowerCase()) && (!status || item.status === status)).map((item) => (
                <tr key={item.id}>
                  <td><Link className="m1-entity-cell" to={`/customers/${item.id}`}><span className="m1-entity-avatar"><Building2 size={18} /></span><span><strong>{item.name}</strong><small>{item.code}</small></span></Link></td>
                  <td>{item.email ?? item.phone ?? '—'}</td>
                  <td><StatusBadge status={item.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="m1-table-pagination">Hiển thị {data.value?.items.length ?? 0} trong {data.value?.total ?? 0} khách hàng</div>
          </>}
        </div>
      )}
    </Frame>
  )
}
function TenantsPage() {
  const data = useLoad<Page<TenantRecord>>(
    () => api.organization('/tenants?page=1&pageSize=100'),
    'tenants',
  )
  return (
    <Frame title="Doanh nghiệp">
      {data.loading ? (
        <Loading />
      ) : data.error ? (
        <Problem error={data.error} />
      ) : !data.value?.items.length ? (
        <Empty />
      ) : (
        <div className="m1-card">
          <table>
            <thead>
              <tr>
                <th>Mã</th>
                <th>Tên</th>
                <th>Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {data.value.items.map((item) => (
                <tr key={item.id}>
                  <td>{item.code}</td>
                  <td>{item.name}</td>
                  <td><StatusBadge status={item.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <small>
            {Math.max(data.value.total, data.value.items.length)} doanh nghiệp
          </small>
        </div>
      )}
    </Frame>
  )
}
function CustomerDetailPage() {
  const { id } = useParams()
  const data = useLoad<CustomerRecord>(
    () => api.organization(`/customers/${id}`),
    id ?? '',
  )
  return (
    <Frame title={data.value?.name ?? 'Khách hàng'} eyebrow={data.value?.code ?? 'KHÁCH HÀNG'} description={data.value?.address ?? undefined}>
      {data.loading ? (
        <Loading />
      ) : data.error ? (
        <Problem error={data.error} />
      ) : (
        data.value && (
          <div className="m1-detail-grid">
            <section className="m1-card m1-section-card"><div className="m1-section-header"><h2>Thông tin doanh nghiệp</h2></div><div className="m1-section-body"><dl><dt>Mã khách hàng</dt><dd>{data.value.code}</dd><dt>Trạng thái</dt><dd><StatusBadge status={data.value.status} /></dd><dt>Địa chỉ</dt><dd>{data.value.address ?? '—'}</dd></dl></div></section>
            <section className="m1-card m1-section-card"><div className="m1-section-header"><h2>Liên hệ chính</h2></div><div className="m1-section-body"><dl><dt>Email</dt><dd>{data.value.email ?? '—'}</dd><dt>Điện thoại</dt><dd>{data.value.phone ?? '—'}</dd></dl></div></section>
          </div>
        )
      )}
    </Frame>
  )
}
function EquipmentPage() {
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('')
  const data = useLoad<Page<EquipmentRecord>>(
    () => api.assetM2('/equipment?page=1&pageSize=100'),
    'equipment',
  )
  return (
    <Frame title="Thiết bị" description="Theo dõi thiết bị đã bàn giao, bảo hành và lịch sử dịch vụ.">
      {data.loading ? (
        <Loading />
      ) : data.error ? (
        <Problem error={data.error} />
      ) : (
        <>
        <div className="m1-summary-strip"><div><strong>{data.value?.total ?? 0}</strong><span>Tổng thiết bị</span></div><div><strong>{data.value?.items.filter((item) => item.status === 'ACTIVE').length ?? 0}</strong><span>Đang hoạt động</span></div><div><strong>{data.value?.items.filter((item) => item.warranty?.result === 'IN_WARRANTY').length ?? 0}</strong><span>Còn bảo hành</span></div><div><strong>{data.value?.items.filter((item) => item.status === 'OUT_OF_SERVICE').length ?? 0}</strong><span>Cần chú ý</span></div></div>
        <div className="m1-card m1-table-card">
          <div className="m1-table-toolbar"><label className="m1-table-search"><Search size={17} /><input aria-label="Tìm thiết bị" placeholder="Tìm mã tài sản, model, serial..." value={query} onChange={(event) => setQuery(event.target.value)} /></label><select aria-label="Lọc trạng thái" value={status} onChange={(event) => setStatus(event.target.value)}><option value="">Tất cả trạng thái</option><option value="ACTIVE">Hoạt động</option><option value="IN_SERVICE">Đang sử dụng</option><option value="OUT_OF_SERVICE">Ngừng hoạt động</option><option value="RETIRED">Ngừng sử dụng</option></select></div>
          {!data.value?.items.filter((item) => `${item.assetCode} ${item.serialNumber} ${item.model?.name ?? ''}`.toLowerCase().includes(query.toLowerCase()) && (!status || item.status === status)).length ? <div className="m1-list-empty">Không tìm thấy thiết bị phù hợp.</div> : <>
          <table>
            <thead>
              <tr>
                <th>Mã tài sản</th>
                <th>Thiết bị / Model</th>
                <th>Số sê-ri</th>
                <th>Bảo hành</th>
                <th>Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {data.value?.items.filter((item) => `${item.assetCode} ${item.serialNumber} ${item.model?.name ?? ''}`.toLowerCase().includes(query.toLowerCase()) && (!status || item.status === status)).map((item) => (
                <tr key={item.id}>
                  <td><Link to={`/equipment/${item.id}`}>{item.assetCode}</Link></td>
                  <td><strong>{item.model?.name ?? 'Thiết bị'}</strong></td>
                  <td>{item.serialNumber}</td>
                  <td>{item.warranty?.result ? <StatusBadge status={item.warranty.result} /> : '—'}</td>
                  <td><StatusBadge status={item.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="m1-table-pagination">Hiển thị {data.value?.items.length ?? 0} trong {data.value?.total ?? 0} thiết bị</div>
          </>}
        </div>
        </>
      )}
    </Frame>
  )
}
function RequestsPage() {
  const { profile } = useSession()
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('')
  const [priority, setPriority] = useState('')
  const data = useLoad<Page<RequestRecord>>(
    () => api.requestsLive('/service-requests?page=1&pageSize=100'),
    'requests',
  )
  return (
    <Frame
      title="Yêu cầu dịch vụ"
      description="Tiếp nhận, đánh giá và theo dõi các yêu cầu từ khách hàng."
      action={
        profile && has(profile.roles, creators) ? (
          <Link className="m1-button" to="/requests/new">
            <Plus size={17} /> Tạo yêu cầu
          </Link>
        ) : null
      }
    >
      {data.loading ? (
        <Loading />
      ) : data.error ? (
        <Problem error={data.error} />
      ) : (
        <>
        <div className="m1-summary-strip m1-summary-strip--requests"><div><strong>{data.value?.total ?? 0}</strong><span>Tất cả</span></div><div><strong>{data.value?.items.filter((item) => item.status === 'NEW').length ?? 0}</strong><span>Mới</span></div><div><strong>{data.value?.items.filter((item) => ['REVIEWING', 'AWAITING_INFO', 'AWAITING_CUSTOMER_APPROVAL'].includes(item.status)).length ?? 0}</strong><span>Chờ xử lý</span></div><div><strong>{data.value?.items.filter((item) => item.status === 'PROCESSING').length ?? 0}</strong><span>Đang xử lý</span></div><div><strong>{data.value?.items.filter((item) => ['RESOLVED', 'CLOSED'].includes(item.status)).length ?? 0}</strong><span>Hoàn thành</span></div></div>
        <div className="m1-card m1-table-card">
          <div className="m1-table-toolbar"><label className="m1-table-search"><Search size={17} /><input aria-label="Tìm yêu cầu" placeholder="Tìm mã yêu cầu, nội dung..." value={query} onChange={(event) => setQuery(event.target.value)} /></label><div><select aria-label="Lọc ưu tiên" value={priority} onChange={(event) => setPriority(event.target.value)}><option value="">Tất cả ưu tiên</option><option value="URGENT">Khẩn cấp</option><option value="HIGH">Cao</option><option value="NORMAL">Trung bình</option><option value="LOW">Thấp</option></select><select aria-label="Lọc trạng thái" value={status} onChange={(event) => setStatus(event.target.value)}><option value="">Tất cả trạng thái</option><option value="NEW">Mới</option><option value="REVIEWING">Đang xem xét</option><option value="ACCEPTED">Đã tiếp nhận</option><option value="PROCESSING">Đang xử lý</option><option value="RESOLVED">Đã xử lý</option><option value="CLOSED">Đã đóng</option></select></div></div>
          {!data.value?.items.filter((item) => `${item.requestNo} ${item.title}`.toLowerCase().includes(query.toLowerCase()) && (!status || item.status === status) && (!priority || item.priority === priority)).length ? <div className="m1-list-empty">Chưa có yêu cầu phù hợp.</div> : <>
          <table>
            <thead>
              <tr>
                <th>Mã</th>
                <th>Tiêu đề</th>
                <th>Ưu tiên</th>
                <th>Trạng thái</th>
                <th>Ngày tạo</th>
              </tr>
            </thead>
            <tbody>
              {data.value?.items.filter((item) => `${item.requestNo} ${item.title}`.toLowerCase().includes(query.toLowerCase()) && (!status || item.status === status) && (!priority || item.priority === priority)).map((item) => (
                <tr key={item.id}>
                  <td>
                    <Link to={`/requests/${item.id}`}>{item.requestNo}</Link>
                  </td>
                  <td><strong>{item.title}</strong><small className="m1-table-subline">{requestTypeLabels[item.type] ?? item.type}</small></td>
                  <td><PriorityBadge priority={item.priority} /></td>
                  <td><StatusBadge status={item.status} /></td>
                  <td>
                    <DateText value={item.createdAt} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="m1-table-pagination">Hiển thị {data.value?.items.length ?? 0} trong {data.value?.total ?? 0} yêu cầu</div>
          </>}
        </div>
        </>
      )}
    </Frame>
  )
}
function RequestActivity({ id, version }: { id: string; version: number }) {
  const history = useLoad<RequestStatusChange[]>(
    () => api.requestsLive(`/service-requests/${id}/history`),
    `history-${id}-${version}`,
  )
  const comments = useLoad<RequestComment[]>(
    () => api.requestsLive(`/service-requests/${id}/comments`),
    `comments-${id}-${version}`,
  )
  return (
    <div className="m1-activity">
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
            {history.value.filter((item) => item.newStatus).map((item) => (
              <li key={item.id}>
                <StatusBadge status={item.newStatus} /> ·{' '}
                <DateText value={item.changedAt} />
                {item.reason && <p>{item.reason}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>
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
                <strong>{item.visibility}</strong> ·{' '}
                <DateText value={item.createdAt} />
                <p>{item.content}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
function RequestDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { profile } = useSession()
  const data = useLoad<RequestDetail>(
    () => api.requestsLive(`/service-requests/${id}`),
    id ?? '',
  )
  const [override, setOverride] = useState<RequestDetail | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [busy, setBusy] = useState(false)
  const [version, setVersion] = useState(0)
  const [comment, setComment] = useState('')
  const [visibility, setVisibility] = useState<'CUSTOMER' | 'INTERNAL'>(
    'CUSTOMER',
  )
  const current = override?.id === data.value?.id ? override : data.value
  async function refreshRequest() {
    if (!current) return
    setBusy(true)
    setError(null)
    try {
      setOverride(await api.requestsLive(`/service-requests/${current.id}`))
      setVersion((value) => value + 1)
    } catch (cause) {
      setError(cause)
    } finally {
      setBusy(false)
    }
  }
  async function createWorkOrder() {
    if (!current) return
    setBusy(true)
    setError(null)
    try {
      const order = await api.workorders<{ id: string }>('/work-orders', {
        method: 'POST', body: { serviceRequestId: current.id },
      })
      navigate(`/app/work-orders/${order.id}`)
    } catch (cause) {
      setError(cause)
      if (cause instanceof ApiError && cause.status === 409) await refreshRequest()
    } finally { setBusy(false) }
  }
  async function run(action: string) {
    if (!current) return
    const required = ['reject', 'request-info', 'reopen'].includes(action)
    const optional = action === 'cancel'
    const reason = required || optional ? window.prompt('Lý do') : null
    if (required && !reason?.trim()) return
    if (optional && reason === null) return
    setBusy(true)
    setError(null)
    try {
      await api.requestsLive(`/service-requests/${current.id}/${action}`, {
        method: 'POST',
        ...(reason ? { body: { reason } } : {}),
      })
      setOverride(await api.requestsLive(`/service-requests/${current.id}`))
      setVersion((value) => value + 1)
    } catch (cause) {
      setError(cause)
    } finally {
      setBusy(false)
    }
  }
  async function addComment(event: FormEvent) {
    event.preventDefault()
    if (!current || !comment.trim()) return
    setBusy(true)
    setError(null)
    try {
      await api.requestsLive(`/service-requests/${current.id}/comments`, {
        method: 'POST',
        body: {
          content: comment.trim(),
          visibility:
            profile?.userType === 'CUSTOMER' ? 'CUSTOMER' : visibility,
        },
      })
      setComment('')
      setOverride(await api.requestsLive(`/service-requests/${current.id}`))
      setVersion((value) => value + 1)
    } catch (cause) {
      setError(cause)
    } finally {
      setBusy(false)
    }
  }
  const actions = [
    'review',
    'request-info',
    'warranty-check',
    'accept',
    'reject',
    'cancel',
    'confirm',
    'reopen',
  ]
  return (
    <Frame title={current?.title ?? 'Yêu cầu dịch vụ'} eyebrow={current?.requestNo ?? 'YÊU CẦU DỊCH VỤ'} description={current ? `Tạo lúc ${formatDate(current.createdAt)}` : undefined}>
      {data.loading ? (
        <Loading />
      ) : data.error ? (
        <Problem error={data.error} />
      ) : (
        current && (
          <>
            <div className="m1-entity-status"><StatusBadge status={current.status} /><PriorityBadge priority={current.priority} /><span>{requestTypeLabels[current.type] ?? current.type}</span></div>
            {error ? <Problem error={error} /> : null}
            <div className="m1-actions">
              <button disabled={busy} onClick={() => void refreshRequest()}>Làm mới trạng thái</button>
              {current.status === 'ACCEPTED' && profile?.roles.includes('SERVICE_MANAGER') && <button disabled={busy} onClick={() => void createWorkOrder()}>Tạo lệnh công việc</button>}
              {current.allowedActions
                ?.filter((action) => actions.includes(action))
                .map((action) => (
                  <button
                    disabled={busy}
                    key={action}
                    onClick={() => run(action)}
                  >
                    {actionLabels[action] ?? action}
                  </button>
                ))}
            </div>
            {current.status === 'PROCESSING' && <p role="status">Đang chờ kết quả từ Work Order. Kết quả có thể xuất hiện sau ít phút; dùng “Làm mới trạng thái” để kiểm tra.</p>}
            {(current.resolutionSummary || current.resolutionResult) && <section className="m1-card m1-section-card"><div className="m1-section-header"><h2>Kết quả dịch vụ</h2></div><div className="m1-section-body"><p>{current.resolutionSummary ?? '—'}</p><dl><dt>Kết quả</dt><dd>{current.resolutionResult ?? '—'}</dd><dt>Lệnh công việc</dt><dd>{current.resolvedWorkOrderNo ?? '—'}</dd><dt>Hoàn thành lúc</dt><dd>{formatDate(current.resolutionCompletedAt)}</dd></dl></div></section>}
            <div className="m1-request-detail-grid">
              <div>
                <section className="m1-card m1-section-card"><div className="m1-section-header"><h2>Mô tả sự cố</h2></div><div className="m1-section-body m1-prose">{current.description}</div></section>
                <section className="m1-card m1-section-card"><div className="m1-section-header"><h2>Thiết bị & vị trí</h2></div><div className="m1-section-body"><Link className="m1-equipment-link" to={`/equipment/${current.equipmentId}`}><span className="m1-entity-avatar"><Boxes size={19} /></span><span><strong>Mở hồ sơ thiết bị</strong><small>{current.equipmentId}</small></span><ChevronRight size={18} /></Link></div></section>
                <section className="m1-card m1-section-card"><div className="m1-section-header"><h2>Trao đổi</h2></div><div className="m1-section-body"><form className="m1-comment" onSubmit={addComment}>
                  <textarea required maxLength={5000} rows={3} value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Nhập bình luận..." />
                  {profile?.userType !== 'CUSTOMER' && profile && has(profile.roles, ['SERVICE_MANAGER', 'DISPATCHER', 'TECHNICIAN']) && <select value={visibility} onChange={(event) => setVisibility(event.target.value as 'CUSTOMER' | 'INTERNAL')}><option value="CUSTOMER">Khách hàng thấy</option><option value="INTERNAL">Nội bộ</option></select>}
                  <button disabled={busy || !comment.trim()}>Gửi bình luận</button>
                </form></div></section>
              </div>
              <aside><section className="m1-card m1-section-card"><div className="m1-section-header"><h2>Thông tin yêu cầu</h2></div><div className="m1-section-body"><dl><dt>Trạng thái</dt><dd><StatusBadge status={current.status} /></dd><dt>Ưu tiên</dt><dd><PriorityBadge priority={current.priority} /></dd><dt>Bảo hành</dt><dd>{current.warrantyCheck?.result ? <StatusBadge status={current.warrantyCheck.result} /> : 'Chưa kiểm tra'}</dd><dt>Loại yêu cầu</dt><dd>{requestTypeLabels[current.type] ?? current.type}</dd></dl></div></section></aside>
            </div>
            <RequestDossierExtras equipmentId={current.equipmentId} requestId={current.id} revision={version} />
            <EstimatePanel requestId={current.id} onChange={() => void refreshRequest()} />
            <RequestActivity id={current.id} version={version} />
          </>
        )
      )}
    </Frame>
  )
}
function NewRequestPage() {
  const { profile } = useSession()
  const navigate = useNavigate()
  const location = useLocation()
  const requestedEquipmentId = new URLSearchParams(location.search).get(
    'equipmentId',
  )
  const data = useLoad<Page<EquipmentRecord>>(
    () =>
      requestedEquipmentId
        ? api
            .asset<EquipmentRecord>(
              `/equipment/${encodeURIComponent(requestedEquipmentId)}`,
            )
            .then((item) => ({ items: [item], page: 1, pageSize: 1, total: 1 }))
        : api.assetM2('/equipment?page=1&pageSize=100'),
    `request-equipment-${requestedEquipmentId ?? 'list'}`,
  )
  const [equipmentId, setEquipmentId] = useState(requestedEquipmentId ?? '')
  const [type, setType] = useState('REPAIR')
  const [priority, setPriority] = useState('NORMAL')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState<unknown>(null)
  const [busy, setBusy] = useState(false)
  async function submit(event: FormEvent) {
    event.preventDefault()
    const selected = data.value?.items.find((item) => item.id === equipmentId)
    if (!selected) {
      setError(new Error('Vui lòng chọn thiết bị.'))
      return
    }
    setBusy(true)
    setError(null)
    try {
      const created = await api.requestsLive<RequestRecord>('/service-requests', {
        method: 'POST',
        body: {
          equipmentId,
          type,
          priority,
          title,
          description,
          ...(profile?.userType === 'CUSTOMER'
            ? {}
            : { customerId: selected.customerId }),
        },
      })
      rememberDemoRequest(profile?.tenantId ?? null, created.id)
      navigate(`/requests/${created.id}`)
    } catch (cause) {
      setError(cause)
    } finally {
      setBusy(false)
    }
  }
  const selectedEquipment = data.value?.items.find((item) => item.id === equipmentId)
  return (
    <Frame title="Bạn cần hỗ trợ thiết bị nào?" eyebrow="YÊU CẦU MỚI" description="Cung cấp thông tin sự cố để bộ phận dịch vụ tiếp nhận và xử lý.">
      {data.loading ? (
        <Loading />
      ) : data.error ? (
        <Problem error={data.error} />
      ) : (
        <form className="m1-form m1-request-form" onSubmit={submit}>
          {error ? <Problem error={error} /> : null}
          <div className="m1-request-detail-grid"><div>
          <section className="m1-card m1-section-card"><div className="m1-section-header"><h2>1. Chọn thiết bị</h2></div><div className="m1-section-body"><label>
            Thiết bị
            <select
              required
              value={equipmentId}
              onChange={(event) => setEquipmentId(event.target.value)}
            >
              <option value="">Chọn thiết bị</option>
              {data.value?.items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.model?.name ?? item.assetCode} · {item.assetCode}
                </option>
              ))}
            </select>
          </label>{selectedEquipment && <div className="m1-selected-equipment"><span className="m1-entity-avatar"><Boxes size={19} /></span><span><strong>{selectedEquipment.model?.name ?? selectedEquipment.assetCode}</strong><small>{selectedEquipment.assetCode} · Serial {selectedEquipment.serialNumber}</small></span>{selectedEquipment.warranty?.result && <StatusBadge status={selectedEquipment.warranty.result} />}</div>}</div></section>
          <section className="m1-card m1-section-card"><div className="m1-section-header"><h2>2. Mô tả vấn đề</h2></div><div className="m1-section-body m1-form-fields"><label>
            Loại
            <select
              value={type}
              onChange={(event) => setType(event.target.value)}
            >
              {['WARRANTY', 'REPAIR', 'MAINTENANCE', 'INSPECTION'].map(
                (value) => (
                  <option key={value} value={value}>{{ WARRANTY: 'Bảo hành', REPAIR: 'Sửa chữa sự cố', MAINTENANCE: 'Bảo trì', INSPECTION: 'Kiểm tra thiết bị' }[value]}</option>
                ),
              )}
            </select>
          </label>
          <label>
            Ưu tiên
            <select
              value={priority}
              onChange={(event) => setPriority(event.target.value)}
            >
              {['LOW', 'NORMAL', 'HIGH', 'URGENT'].map((value) => (
                <option key={value} value={value}>{{ LOW: 'Thấp', NORMAL: 'Trung bình', HIGH: 'Cao', URGENT: 'Khẩn cấp' }[value]}</option>
              ))}
            </select>
          </label>
          <label>
            Tiêu đề
            <input
              required
              maxLength={200}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
          <label>
            Mô tả
            <textarea
              required
              maxLength={10000}
              rows={5}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </label></div></section></div>
          <aside><section className="m1-card m1-section-card"><div className="m1-section-header"><h2>Xác nhận yêu cầu</h2></div><div className="m1-section-body m1-submit-panel"><p>Kiểm tra thông tin thiết bị và mô tả trước khi gửi yêu cầu.</p><button disabled={busy || !data.value?.items.length}>{busy ? 'Đang gửi…' : 'Gửi yêu cầu dịch vụ'}</button></div></section></aside></div>
        </form>
      )}
    </Frame>
  )
}
function Message({ code, title }: { code: string; title: string }) {
  return (
    <div className="m1-card">
      <h1>
        {code} · {title}
      </h1>
      <Link to="/">Về trang chính</Link>
    </div>
  )
}
const sampleTenantRoles = ['TENANT_ADMIN', 'SERVICE_MANAGER', 'DISPATCHER', 'TECHNICIAN', 'INVENTORY_STAFF']
const sampleCustomerRoles = ['CUSTOMER_ADMIN', 'CUSTOMER_USER']
function HistoryFeedPageRoute() {
  const { id } = useParams()
  return <HistoryFeedPage equipmentId={id} />
}
function EquipmentMaintenanceHistoryRoute() {
  const { id } = useParams()
  return <MaintenanceHistoryPage equipmentId={id} />
}
const sampleRoutes: { path: string; element: ReactNode; roles: string[] }[] = [
  { path: '/app/dashboard', element: <SampleDashboardPage />, roles: sampleTenantRoles },
  { path: '/app/customers', element: <SampleCustomersPage />, roles: sampleTenantRoles },
  { path: '/app/customers/new', element: <SampleCustomerFormPage />, roles: sampleTenantRoles },
  { path: '/app/customers/:id', element: <SampleCustomerDetailPage />, roles: sampleTenantRoles },
  { path: '/app/equipment', element: <EquipmentPage />, roles: sampleTenantRoles },
  { path: '/app/equipment/:id', element: <DossierPage />, roles: sampleTenantRoles },
  { path: '/app/equipment/:id/timeline', element: <HistoryFeedPageRoute />, roles: sampleTenantRoles },
  { path: '/app/equipment/:id/service-requests', element: <EquipmentFeedPage kind="service-requests" />, roles: sampleTenantRoles },
  { path: '/app/equipment/:id/work-orders', element: <EquipmentFeedPage kind="work-orders" />, roles: sampleTenantRoles },
  { path: '/app/equipment/:id/maintenance-plans', element: <EquipmentFeedPage kind="maintenance-plans" />, roles: sampleTenantRoles },
  { path: '/app/equipment/:id/maintenance-tasks', element: <EquipmentFeedPage kind="maintenance-tasks" />, roles: sampleTenantRoles },
  { path: '/app/equipment/:id/maintenance-history', element: <EquipmentMaintenanceHistoryRoute />, roles: ['TENANT_ADMIN', 'SERVICE_MANAGER'] },
  { path: '/app/equipment-history', element: <HistoryFeedPage />, roles: sampleTenantRoles },
  { path: '/app/models/:id/history', element: <ResourceHistoryPage kind="model" />, roles: sampleTenantRoles },
  { path: '/app/warranties/:id/history', element: <ResourceHistoryPage kind="warranty" />, roles: sampleTenantRoles },
  { path: '/app/service-requests', element: <RequestsPage />, roles: ['TENANT_ADMIN', 'SERVICE_MANAGER', 'DISPATCHER', 'TECHNICIAN'] },
  { path: '/app/service-requests/new', element: <NewRequestPage />, roles: ['SERVICE_MANAGER'] },
  { path: '/app/service-requests/:id', element: <RequestDetailPage />, roles: ['TENANT_ADMIN', 'SERVICE_MANAGER', 'DISPATCHER', 'TECHNICIAN'] },
  { path: '/app/work-orders', element: <WorkOrderListPage />, roles: sampleTenantRoles },
  { path: '/app/work-orders/:id', element: <WorkOrderPage />, roles: sampleTenantRoles },
  { path: '/app/technicians', element: <LiveTechniciansPage />, roles: ['TENANT_ADMIN', 'SERVICE_MANAGER', 'DISPATCHER'] },
  { path: '/app/technicians/:id', element: <TechnicianPage />, roles: ['TENANT_ADMIN', 'SERVICE_MANAGER', 'DISPATCHER'] },
  { path: '/app/maintenance', element: <LiveMaintenancePage />, roles: ['TENANT_ADMIN', 'SERVICE_MANAGER', 'DISPATCHER'] },
  { path: '/app/maintenance-history', element: <MaintenanceHistoryPage />, roles: ['TENANT_ADMIN', 'SERVICE_MANAGER'] },
  { path: '/app/maintenance/:id', element: <MaintenanceRecordPage />, roles: ['TENANT_ADMIN', 'SERVICE_MANAGER', 'DISPATCHER'] },
  { path: '/app/inventory/parts', element: <PartsPage />, roles: sampleTenantRoles },
  { path: '/app/inventory/parts/:id', element: <PartDetailPage />, roles: sampleTenantRoles },
  { path: '/app/inventory/warehouses', element: <WarehousesPage />, roles: sampleTenantRoles },
  { path: '/app/inventory/transactions', element: <TransactionsPage />, roles: sampleTenantRoles },
  { path: '/app/organization/branches', element: <OrganizationPage type="branches" />, roles: sampleTenantRoles },
  { path: '/app/organization/users', element: <OrganizationPage type="users" />, roles: sampleTenantRoles },
  { path: '/app/organization/roles', element: <OrganizationPage type="roles" />, roles: sampleTenantRoles },
  { path: '/app/reports', element: <OrganizationPage type="reports" />, roles: sampleTenantRoles },
  { path: '/app/settings', element: <OrganizationPage type="settings" />, roles: sampleTenantRoles },
  { path: '/admin', element: <PlatformDashboardPage />, roles: ['PLATFORM_ADMIN'] },
  { path: '/admin/tenants', element: <SampleTenantsPage />, roles: ['PLATFORM_ADMIN'] },
  { path: '/admin/tenants/new', element: <TenantFormPage />, roles: ['PLATFORM_ADMIN'] },
  { path: '/admin/tenants/:id', element: <SampleTenantDetailPage />, roles: ['PLATFORM_ADMIN'] },
  { path: '/admin/audit-logs', element: <PlatformAuxPage type="audit" />, roles: ['PLATFORM_ADMIN'] },
  { path: '/admin/settings', element: <PlatformAuxPage type="settings" />, roles: ['PLATFORM_ADMIN'] },
  { path: '/portal', element: <PortalDashboardPage />, roles: sampleCustomerRoles },
  { path: '/portal/equipment', element: <EquipmentPage />, roles: sampleCustomerRoles },
  { path: '/portal/equipment/:id', element: <DossierPage />, roles: sampleCustomerRoles },
  { path: '/portal/equipment/:id/timeline', element: <HistoryFeedPageRoute />, roles: sampleCustomerRoles },
  { path: '/portal/equipment/:id/service-requests', element: <EquipmentFeedPage kind="service-requests" />, roles: sampleCustomerRoles },
  { path: '/portal/equipment/:id/work-orders', element: <EquipmentFeedPage kind="work-orders" />, roles: sampleCustomerRoles },
  { path: '/portal/equipment/:id/maintenance-plans', element: <EquipmentFeedPage kind="maintenance-plans" />, roles: ['CUSTOMER_ADMIN'] },
  { path: '/portal/equipment/:id/maintenance-tasks', element: <EquipmentFeedPage kind="maintenance-tasks" />, roles: ['CUSTOMER_ADMIN'] },
  { path: '/portal/equipment/:id/maintenance-history', element: <EquipmentMaintenanceHistoryRoute />, roles: ['CUSTOMER_ADMIN'] },
  { path: '/portal/equipment-history', element: <HistoryFeedPage />, roles: sampleCustomerRoles },
  { path: '/portal/warranties/:id/history', element: <ResourceHistoryPage kind="warranty" />, roles: sampleCustomerRoles },
  { path: '/portal/requests', element: <RequestsPage />, roles: sampleCustomerRoles },
  { path: '/portal/requests/new', element: <NewRequestPage />, roles: sampleCustomerRoles },
  { path: '/portal/requests/:id', element: <RequestDetailPage />, roles: sampleCustomerRoles },
  { path: '/portal/maintenance', element: <LiveMaintenancePage />, roles: ['CUSTOMER_ADMIN'] },
  { path: '/portal/maintenance-history', element: <MaintenanceHistoryPage />, roles: ['CUSTOMER_ADMIN'] },
  { path: '/portal/maintenance/:id', element: <MaintenanceRecordPage />, roles: ['CUSTOMER_ADMIN'] },
  { path: '/portal/locations', element: <PortalSimplePage type="locations" />, roles: sampleCustomerRoles },
  { path: '/portal/notifications', element: <PortalSimplePage type="notifications" />, roles: sampleCustomerRoles },
  { path: '/portal/profile', element: <PortalSimplePage type="profile" />, roles: sampleCustomerRoles },
]
function Authenticated() {
  const { profile } = useSession()
  const location = useLocation()
  if (!profile) {
    const target = location.pathname.startsWith('/portal/qr/')
      ? `/login?next=${encodeURIComponent(location.pathname)}`
      : '/login'
    return <Navigate to={target} replace />
  }
  return (
    <Layout>
      <Routes>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/demo" element={<DemoPage />} />
        {sampleRoutes.map((item) => <Route key={item.path} path={item.path} element={<Gate roles={item.roles}>{item.element}</Gate>} />)}
        <Route
          path="/"
          element={<Navigate to={home(profile.roles)} replace />}
        />
        <Route
          path="/tenants"
          element={
            <Gate roles={menu[3].roles}>
              <TenantsPage />
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
  )
}
function Content() {
  const { setProfile } = useSession()
  const [ready, setReady] = useState(false)
  useEffect(() => {
    let active = true
    restoreSession()
      .then((profile) => {
        if (active) setProfile(profile)
      })
      .finally(() => {
        if (active) setReady(true)
      })
    return () => {
      active = false
    }
  }, [setProfile])
  return !ready ? (
    <div className="m1-login">
      <Loading />
    </div>
  ) : (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/activate" element={<ActivatePage />} />
      <Route path="/*" element={<Authenticated />} />
    </Routes>
  )
}
export default function App() {
  return (
    <SessionProvider>
      <AppStoreProvider><Content /></AppStoreProvider>
    </SessionProvider>
  )
}

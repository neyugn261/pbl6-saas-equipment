import { Bell, Boxes, Building2, ChevronRight, ClipboardList, Factory, Gauge, HelpCircle, History, LayoutDashboard, LogOut, MapPin, Menu, Package, PanelLeftClose, Search, Settings, ShieldCheck, SlidersHorizontal, UserCog, Users, Wrench, X } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { Link, Navigate, NavLink, useLocation } from 'react-router-dom'
import { useAppStore } from '../state/AppStore'
import type { Role } from '../types/domain'
import { IconButton } from './ui'

interface NavItem { label: string; to: string; icon: typeof Gauge; roles?: Role[]; group?: string }

const adminItems: NavItem[] = [
  { label: 'Tổng quan', to: '/app/dashboard', icon: LayoutDashboard },
  { label: 'Khách hàng', to: '/app/customers', icon: Building2, roles: ['TENANT_ADMIN', 'SERVICE_MANAGER'], group: 'Vận hành dịch vụ' },
  { label: 'Thiết bị', to: '/app/equipment', icon: Boxes, roles: ['TENANT_ADMIN', 'SERVICE_MANAGER'], group: 'Vận hành dịch vụ' },
  { label: 'Yêu cầu dịch vụ', to: '/app/service-requests', icon: ClipboardList, roles: ['TENANT_ADMIN', 'SERVICE_MANAGER'], group: 'Vận hành dịch vụ' },
  { label: 'Lệnh công việc', to: '/app/work-orders', icon: Wrench, roles: ['TENANT_ADMIN', 'SERVICE_MANAGER'], group: 'Vận hành dịch vụ' },
  { label: 'Kỹ thuật viên', to: '/app/technicians', icon: UserCog, roles: ['TENANT_ADMIN', 'SERVICE_MANAGER'], group: 'Vận hành dịch vụ' },
  { label: 'Bảo trì định kỳ', to: '/app/maintenance', icon: History, roles: ['TENANT_ADMIN', 'SERVICE_MANAGER'], group: 'Vận hành dịch vụ' },
  { label: 'Phụ tùng', to: '/app/inventory/parts', icon: Package, roles: ['TENANT_ADMIN', 'INVENTORY_STAFF'], group: 'Kho phụ tùng' },
  { label: 'Kho & tồn kho', to: '/app/inventory/warehouses', icon: Factory, roles: ['TENANT_ADMIN', 'INVENTORY_STAFF'], group: 'Kho phụ tùng' },
  { label: 'Giao dịch kho', to: '/app/inventory/transactions', icon: SlidersHorizontal, roles: ['TENANT_ADMIN', 'INVENTORY_STAFF'], group: 'Kho phụ tùng' },
  { label: 'Chi nhánh', to: '/app/organization/branches', icon: MapPin, roles: ['TENANT_ADMIN'], group: 'Tổ chức' },
  { label: 'Người dùng', to: '/app/organization/users', icon: Users, roles: ['TENANT_ADMIN'], group: 'Tổ chức' },
  { label: 'Vai trò & quyền', to: '/app/organization/roles', icon: ShieldCheck, roles: ['TENANT_ADMIN'], group: 'Tổ chức' },
  { label: 'Báo cáo', to: '/app/reports', icon: Gauge, roles: ['TENANT_ADMIN', 'SERVICE_MANAGER'], group: 'Hệ thống' },
  { label: 'Cài đặt', to: '/app/settings', icon: Settings, roles: ['TENANT_ADMIN'], group: 'Hệ thống' },
]

const platformItems: NavItem[] = [
  { label: 'Tổng quan nền tảng', to: '/admin', icon: LayoutDashboard },
  { label: 'Quản lý doanh nghiệp', to: '/admin/tenants', icon: Building2, group: 'Nền tảng' },
  { label: 'Cài đặt nền tảng', to: '/admin/settings', icon: Settings, group: 'Hệ thống' },
]

const portalItems: NavItem[] = [
  { label: 'Tổng quan', to: '/portal', icon: LayoutDashboard },
  { label: 'Thiết bị của tôi', to: '/portal/equipment', icon: Boxes },
  { label: 'Yêu cầu dịch vụ', to: '/portal/requests', icon: ClipboardList },
  { label: 'Địa điểm', to: '/portal/locations', icon: MapPin },
  { label: 'Thông báo', to: '/portal/notifications', icon: Bell },
  { label: 'Hồ sơ cá nhân', to: '/portal/profile', icon: UserCog },
]

const roleLabels: Record<Role, string> = { PLATFORM_ADMIN: 'Platform Admin', TENANT_ADMIN: 'Tenant Admin', SERVICE_MANAGER: 'Điều phối dịch vụ', DISPATCHER: 'Dispatcher', TECHNICIAN: 'Technician', INVENTORY_STAFF: 'Nhân viên kho', CUSTOMER_ADMIN: 'Customer Admin', CUSTOMER_USER: 'Customer User' }

function Navigation({ items, collapsed, onNavigate }: { items: NavItem[]; collapsed: boolean; onNavigate: () => void }) {
  return <nav className="sidebar__nav" aria-label="Điều hướng chính">{items.map((item, index) => {
    const group = item.group ?? ''
    const showGroup = group && group !== (items[index - 1]?.group ?? '')
    return <div key={item.to}>{showGroup && !collapsed && <p className="nav-group">{group}</p>}<NavLink to={item.to} onClick={onNavigate} end={item.to === '/admin' || item.to === '/portal'} title={collapsed ? item.label : undefined}><item.icon size={19} aria-hidden="true" /><span>{item.label}</span></NavLink></div>
  })}</nav>
}

function Breadcrumbs() {
  const { pathname } = useLocation()
  const labels: Record<string, string> = { app: 'Ứng dụng', admin: 'Nền tảng', portal: 'Cổng khách hàng', dashboard: 'Tổng quan', customers: 'Khách hàng', equipment: 'Thiết bị', 'service-requests': 'Yêu cầu dịch vụ', requests: 'Yêu cầu dịch vụ', 'work-orders': 'Lệnh công việc', technicians: 'Kỹ thuật viên', maintenance: 'Bảo trì', inventory: 'Kho phụ tùng', parts: 'Phụ tùng', warehouses: 'Kho', transactions: 'Giao dịch kho', organization: 'Tổ chức', branches: 'Chi nhánh', users: 'Người dùng', roles: 'Vai trò & quyền', reports: 'Báo cáo', settings: 'Cài đặt', tenants: 'Doanh nghiệp', locations: 'Địa điểm', notifications: 'Thông báo', profile: 'Hồ sơ', new: 'Tạo mới' }
  const parts = pathname.split('/').filter(Boolean)
  return <nav className="breadcrumbs" aria-label="Breadcrumb"><Link to={pathname.startsWith('/portal') ? '/portal' : pathname.startsWith('/admin') ? '/admin' : '/app/dashboard'}>Trang chủ</Link>{parts.slice(1).map((part, index) => <span key={`${part}-${index}`}><ChevronRight size={13} />{labels[part] ?? (part.startsWith('eq-') || part.startsWith('req-') || part.startsWith('cus-') || part.startsWith('wo-') || part.startsWith('ten-') ? 'Chi tiết' : part)}</span>)}</nav>
}

export function AppShell({ children }: { children: ReactNode }) {
  const { role, toasts, dismissToast } = useAppStore()
  const location = useLocation()
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const portal = location.pathname.startsWith('/portal')
  const platform = location.pathname.startsWith('/admin')
  const navItems = useMemo(() => platform ? platformItems : portal ? portalItems : adminItems.filter((item) => !item.roles || item.roles.includes(role)), [platform, portal, role])
  const tenantName = platform ? 'PBL6 Service Cloud' : portal ? 'Công ty CP Sản xuất Hòa Phát' : 'Thiết bị Kỹ thuật An Tín'

  const isCustomerRole = role === 'CUSTOMER_ADMIN' || role === 'CUSTOMER_USER'
  const isTenantRole = role === 'TENANT_ADMIN' || role === 'SERVICE_MANAGER' || role === 'INVENTORY_STAFF'
  const inventoryPathAllowed = location.pathname === '/app/dashboard' || location.pathname.startsWith('/app/inventory')
  const permitted = platform
    ? role === 'PLATFORM_ADMIN'
    : portal
      ? isCustomerRole
      : isTenantRole && (role !== 'INVENTORY_STAFF' || inventoryPathAllowed)
  if (!permitted) {
    const target = role === 'PLATFORM_ADMIN' ? '/admin' : isCustomerRole ? '/portal' : '/app/dashboard'
    return <Navigate to={target} replace />
  }

  return <div className={`app-shell ${collapsed ? 'app-shell--collapsed' : ''}`}>
    {mobileOpen && <button className="mobile-overlay" aria-label="Đóng menu" onClick={() => setMobileOpen(false)} />}
    <aside className={`sidebar ${mobileOpen ? 'sidebar--open' : ''}`}>
      <div className="brand"><div className="brand__mark"><Wrench size={20} /></div><div><strong>Servio</strong><small>Field Service Cloud</small></div><IconButton label="Đóng menu" className="mobile-close" onClick={() => setMobileOpen(false)}><X size={20} /></IconButton></div>
      <div className="scope"><span>{platform ? 'PHẠM VI NỀN TẢNG' : portal ? 'TỔ CHỨC KHÁCH HÀNG' : 'DOANH NGHIỆP HIỆN TẠI'}</span><strong>{tenantName}</strong>{!portal && !platform && <small>Chi nhánh Đà Nẵng</small>}</div>
      <Navigation items={navItems} collapsed={collapsed} onNavigate={() => setMobileOpen(false)} />
      <div className="sidebar__footer"><Link to="/help"><HelpCircle size={19} /><span>Trợ giúp & hướng dẫn</span></Link><button><LogOut size={19} /><span>Đăng xuất</span></button></div>
    </aside>
    <div className="workspace">
      <header className="topbar"><div className="topbar__left"><IconButton label="Mở menu" className="mobile-menu" onClick={() => setMobileOpen(true)}><Menu size={20} /></IconButton><IconButton label={collapsed ? 'Mở rộng sidebar' : 'Thu gọn sidebar'} className="desktop-collapse" onClick={() => setCollapsed((value) => !value)}><PanelLeftClose size={19} /></IconButton><button className="global-search"><Search size={18} /><span>Tìm kiếm khách hàng, thiết bị, yêu cầu...</span><kbd>⌘ K</kbd></button></div><div className="topbar__right"><IconButton label="Thông báo"><Bell size={19} /><span className="notification-dot" /></IconButton><button className="user-menu"><span className="avatar">TH</span><span><strong>{portal ? 'Trần Thu Hà' : platform ? 'Phạm Gia Hưng' : 'Trần Quốc Huy'}</strong><small>{roleLabels[role]}</small></span><ChevronRight size={15} /></button></div></header>
      <main><Breadcrumbs />{children}</main>
    </div>
    <div className="toast-region" aria-live="polite">{toasts.map((toast) => <div className="toast" key={toast.id}><div className="toast__check">✓</div><div><strong>{toast.title}</strong><p>{toast.description}</p></div><IconButton label="Đóng" onClick={() => dismissToast(toast.id)}><X size={16} /></IconButton></div>)}</div>
  </div>
}

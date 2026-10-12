import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { AppStoreProvider } from './state/AppStore'
import { DashboardPage } from './pages/DashboardPage'
import { CustomerDetailPage, CustomerFormPage, CustomersPage } from './pages/CustomersPage'
import { EquipmentDetailPage, EquipmentFormPage, EquipmentPage } from './pages/EquipmentPage'
import { RequestFormPage, ServiceRequestDetailPage, ServiceRequestsPage } from './pages/ServiceRequestsPage'
import { MaintenanceDetailPage, MaintenancePage, TechnicianDetailPage, TechniciansPage, WorkOrderDetailPage, WorkOrdersPage } from './pages/OperationsPage'
import { OrganizationPage, PartDetailPage, PartsPage, PlatformAuxPage, PlatformDashboardPage, TenantDetailPage, TenantsPage, TransactionsPage, WarehousesPage } from './pages/ManagementPage'
import { PortalDashboardPage, PortalEquipmentPage, PortalSimplePage } from './pages/PortalPage'
import { Button, EmptyState, Field, PageHeader, Section } from './components/ui'

function TenantFormPage() { return <div className="page page--narrow"><PageHeader eyebrow="Nền tảng" title="Tạo doanh nghiệp" description="Khởi tạo tenant và tài khoản quản trị đầu tiên." /><Section title="Thông tin doanh nghiệp"><div className="form-grid"><Field label="Tên doanh nghiệp" required><input /></Field><Field label="Mã tenant" required hint="Mã duy nhất, không thể đổi sau khi tạo."><input placeholder="TNT-XXX" /></Field><Field label="Tên Tenant Admin" required><input /></Field><Field label="Email quản trị" required><input type="email" /></Field><Field label="Số điện thoại"><input type="tel" /></Field><div className="form-actions"><Button variant="secondary">Hủy</Button><Button>Tạo doanh nghiệp</Button></div></div></Section></div> }
function NotFoundPage() { return <div className="page"><EmptyState title="Không tìm thấy trang" description="Đường dẫn này không tồn tại hoặc bạn không có quyền truy cập." action={<a href="/app/dashboard" className="button button--primary button--md">Về trang tổng quan</a>} /></div> }

export default function App() {
  return <AppStoreProvider><AppShell><Routes>
    <Route path="/" element={<Navigate to="/app/dashboard" replace />} />
    <Route path="/app/dashboard" element={<DashboardPage />} />
    <Route path="/app/customers" element={<CustomersPage />} /><Route path="/app/customers/new" element={<CustomerFormPage />} /><Route path="/app/customers/:id" element={<CustomerDetailPage />} />
    <Route path="/app/equipment" element={<EquipmentPage />} /><Route path="/app/equipment/new" element={<EquipmentFormPage />} /><Route path="/app/equipment/:id" element={<EquipmentDetailPage />} />
    <Route path="/app/service-requests" element={<ServiceRequestsPage />} /><Route path="/app/service-requests/new" element={<RequestFormPage />} /><Route path="/app/service-requests/:id" element={<ServiceRequestDetailPage />} />
    <Route path="/app/work-orders" element={<WorkOrdersPage />} /><Route path="/app/work-orders/:id" element={<WorkOrderDetailPage />} />
    <Route path="/app/technicians" element={<TechniciansPage />} /><Route path="/app/technicians/:id" element={<TechnicianDetailPage />} />
    <Route path="/app/maintenance" element={<MaintenancePage />} /><Route path="/app/maintenance/:id" element={<MaintenanceDetailPage />} />
    <Route path="/app/inventory/parts" element={<PartsPage />} /><Route path="/app/inventory/parts/:id" element={<PartDetailPage />} /><Route path="/app/inventory/warehouses" element={<WarehousesPage />} /><Route path="/app/inventory/transactions" element={<TransactionsPage />} />
    <Route path="/app/organization/branches" element={<OrganizationPage type="branches" />} /><Route path="/app/organization/users" element={<OrganizationPage type="users" />} /><Route path="/app/organization/roles" element={<OrganizationPage type="roles" />} /><Route path="/app/reports" element={<OrganizationPage type="reports" />} /><Route path="/app/settings" element={<OrganizationPage type="settings" />} />
    <Route path="/admin" element={<PlatformDashboardPage />} /><Route path="/admin/tenants" element={<TenantsPage />} /><Route path="/admin/tenants/new" element={<TenantFormPage />} /><Route path="/admin/tenants/:id" element={<TenantDetailPage />} /><Route path="/admin/audit-logs" element={<PlatformAuxPage type="audit" />} /><Route path="/admin/settings" element={<PlatformAuxPage type="settings" />} />
    <Route path="/portal" element={<PortalDashboardPage />} /><Route path="/portal/equipment" element={<PortalEquipmentPage />} /><Route path="/portal/equipment/:id" element={<EquipmentDetailPage portal />} /><Route path="/portal/requests" element={<ServiceRequestsPage portal />} /><Route path="/portal/requests/new" element={<RequestFormPage portal />} /><Route path="/portal/requests/:id" element={<ServiceRequestDetailPage portal />} /><Route path="/portal/locations" element={<PortalSimplePage type="locations" />} /><Route path="/portal/notifications" element={<PortalSimplePage type="notifications" />} /><Route path="/portal/profile" element={<PortalSimplePage type="profile" />} />
    <Route path="*" element={<NotFoundPage />} />
  </Routes></AppShell></AppStoreProvider>
}

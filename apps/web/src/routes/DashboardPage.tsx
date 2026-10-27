import { useEffect, useState } from 'react'
import { AlertTriangle, Boxes, Building2, ClipboardList, ShieldCheck, ArrowRight } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import { has, menu } from '../auth/access'
import { useSession } from '../auth/session'
import { PriorityBadge, StatusBadge } from '../components/Badges'
import type { CustomerRecord, EquipmentRecord, Page, RequestRecord, TenantRecord } from '../types/domain'

interface Summary {
  customers?: number
  equipment?: number
  requests?: number
  tenants?: number
  recentRequests: RequestRecord[]
}

const initialSummary: Summary = { recentRequests: [] }
const statusGroups = [
  { name: 'Đang xử lý', statuses: ['PROCESSING', 'ACCEPTED'], color: '#2563eb' },
  { name: 'Chờ xử lý', statuses: ['NEW', 'REVIEWING', 'AWAITING_INFO', 'AWAITING_CUSTOMER_APPROVAL'], color: '#f59e0b' },
  { name: 'Hoàn thành', statuses: ['RESOLVED', 'CLOSED'], color: '#16a34a' },
  { name: 'Khác', statuses: ['REJECTED', 'COST_REJECTED', 'CANCELLED'], color: '#94a3b8' },
]

export default function DashboardPage() {
  const { profile } = useSession()
  const roles = profile?.roles ?? []
  const canCustomers = has(roles, menu[0].roles)
  const canEquipment = has(roles, menu[1].roles)
  const canRequests = has(roles, menu[2].roles)
  const canTenants = has(roles, menu[3].roles)
  const [state, setState] = useState<{ summary: Summary; loading: boolean; partialError: boolean }>({
    summary: initialSummary,
    loading: true,
    partialError: false,
  })

  useEffect(() => {
    let active = true
    const summary: Summary = { recentRequests: [] }
    const loads: Promise<void>[] = []
    if (canCustomers) loads.push(api.organization<Page<CustomerRecord>>('/customers?page=1&pageSize=1').then((page) => { summary.customers = page.total }))
    if (canEquipment) loads.push(api.asset<Page<EquipmentRecord>>('/equipment?page=1&pageSize=1').then((page) => { summary.equipment = page.total }))
    if (canRequests) loads.push(api.requests<Page<RequestRecord>>('/service-requests?page=1&pageSize=100').then((page) => { summary.requests = page.total; summary.recentRequests = page.items }))
    if (canTenants) loads.push(api.organization<Page<TenantRecord>>('/tenants?page=1&pageSize=1').then((page) => { summary.tenants = page.total }))
    Promise.allSettled(loads).then((results) => {
      if (active) setState({ summary, loading: false, partialError: results.some((result) => result.status === 'rejected') })
    })
    return () => { active = false }
  }, [canCustomers, canEquipment, canRequests, canTenants])

  if (!profile) return null
  const today = new Date()
  const dateLabel = new Intl.DateTimeFormat('vi-VN', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Ho_Chi_Minh' }).format(today)
  const metrics = [
    { label: 'Khách hàng', value: state.summary.customers, path: '/customers', icon: Building2, tone: 'blue', visible: canCustomers },
    { label: 'Tổng thiết bị', value: state.summary.equipment, path: '/equipment', icon: Boxes, tone: 'violet', visible: canEquipment },
    { label: 'Yêu cầu dịch vụ', value: state.summary.requests, path: '/requests', icon: ClipboardList, tone: 'amber', visible: canRequests },
    { label: 'Doanh nghiệp', value: state.summary.tenants, path: '/tenants', icon: ShieldCheck, tone: 'green', visible: canTenants },
  ].filter((metric) => metric.visible)
  const recent = state.summary.recentRequests
  const monthly = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(today.getFullYear(), today.getMonth() - 5 + index, 1)
    return { month: `T${date.getMonth() + 1}`, value: recent.filter((request) => { const created = new Date(request.createdAt); return created.getMonth() === date.getMonth() && created.getFullYear() === date.getFullYear() }).length }
  })
  const distribution = statusGroups.map((group) => ({ name: group.name, value: recent.filter((request) => group.statuses.includes(request.status)).length, color: group.color }))
  const highlighted = recent.filter((request) => ['HIGH', 'URGENT'].includes(request.priority) || ['NEW', 'REVIEWING', 'AWAITING_INFO'].includes(request.status)).slice(0, 4)

  return (
    <div className="dashboard-page">
      <header className="m1-header">
        <div>
          <span className="m1-eyebrow">{dateLabel}</span>
          <h1>Chào mừng, {profile.fullName}</h1>
          <p>Đây là tình hình vận hành dịch vụ trong phạm vi tài khoản của bạn.</p>
        </div>
        {canRequests && <Link className="m1-button" to="/requests">Xem yêu cầu dịch vụ</Link>}
      </header>
      {state.partialError && <p className="m1-error" role="alert">Một số số liệu chưa tải được. Bạn vẫn có thể mở từng mục trong menu.</p>}
      <div className="metrics-grid">
        {metrics.map(({ label, value, path, icon: Icon, tone }) => (
          <Link className="metric-card" to={path} key={path}>
            <span className={`metric-card__icon metric-card__icon--${tone}`}><Icon size={20} /></span>
            <span className="metric-card__body">
              <small>{label}</small>
              <strong>{state.loading ? '…' : value ?? '—'}</strong>
              <span>Xem chi tiết <ArrowRight size={13} /></span>
            </span>
          </Link>
        ))}
      </div>
      {canRequests && <div className="dashboard-grid">
        <section className="m1-card dashboard-section">
          <div className="dashboard-section__header"><div><h2>Yêu cầu dịch vụ</h2><p>Xu hướng 6 tháng gần nhất · tối đa 100 yêu cầu gần đây</p></div></div>
          <div className="dashboard-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={monthly} margin={{ left: -24, right: 8, top: 8 }}><CartesianGrid vertical={false} stroke="#e8edf3" /><XAxis dataKey="month" axisLine={false} tickLine={false} /><YAxis allowDecimals={false} axisLine={false} tickLine={false} /><Tooltip cursor={{ fill: '#f5f7fa' }} /><Bar dataKey="value" fill="#5967ef" radius={[5, 5, 0, 0]} maxBarSize={34} /></BarChart></ResponsiveContainer></div>
        </section>
        <section className="m1-card dashboard-section">
          <div className="dashboard-section__header"><div><h2>Trạng thái yêu cầu</h2><p>Trong tối đa 100 yêu cầu gần đây</p></div></div>
          <div className="dashboard-donut-wrap"><div className="dashboard-donut"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={distribution.filter((item) => item.value > 0)} dataKey="value" innerRadius={52} outerRadius={72} paddingAngle={3}>{distribution.filter((item) => item.value > 0).map((item) => <Cell key={item.name} fill={item.color} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer><div className="dashboard-donut-total"><strong>{recent.length}</strong><span>Tổng yêu cầu</span></div></div><ul className="dashboard-chart-legend">{distribution.map((item) => <li key={item.name}><span style={{ background: item.color }} />{item.name}<strong>{item.value}</strong></li>)}</ul></div>
        </section>
      </div>}
      <div className="dashboard-grid">
        {canRequests && (
          <section className="m1-card dashboard-section">
            <div className="dashboard-section__header"><div><h2>Yêu cầu cần chú ý</h2><p>Ưu tiên cao hoặc đang chờ xử lý</p></div><Link to="/requests">Xem tất cả <ArrowRight size={14} /></Link></div>
            {state.loading ? <p className="dashboard-empty">Đang tải…</p> : highlighted.length ? (
              <div className="dashboard-request-list">
                {highlighted.map((request) => (
                  <Link to={`/requests/${request.id}`} key={request.id}>
                    <span className="dashboard-request-icon"><AlertTriangle size={18} /></span>
                    <span className="dashboard-request-main"><strong>{request.title}</strong><small>{request.requestNo}</small></span>
                    <PriorityBadge priority={request.priority} />
                    <StatusBadge status={request.status} />
                  </Link>
                ))}
              </div>
            ) : <p className="dashboard-empty">Không có yêu cầu cần chú ý.</p>}
          </section>
        )}
        <section className="m1-card dashboard-section dashboard-quicklinks">
          <div className="dashboard-section__header"><div><h2>Truy cập nhanh</h2><p>Tiếp tục công việc của bạn</p></div></div>
          {canEquipment && <Link to="/equipment"><Boxes size={18} /><span>Tra cứu thiết bị</span><ArrowRight size={15} /></Link>}
          {canRequests && <Link to="/requests"><ClipboardList size={18} /><span>Theo dõi yêu cầu</span><ArrowRight size={15} /></Link>}
          {has(roles, ['CUSTOMER_USER', 'CUSTOMER_ADMIN', 'SERVICE_MANAGER']) && <Link to="/requests/new"><ClipboardList size={18} /><span>Tạo yêu cầu mới</span><ArrowRight size={15} /></Link>}
          {canTenants && <Link to="/tenants"><Building2 size={18} /><span>Quản lý doanh nghiệp</span><ArrowRight size={15} /></Link>}
        </section>
      </div>
    </div>
  )
}

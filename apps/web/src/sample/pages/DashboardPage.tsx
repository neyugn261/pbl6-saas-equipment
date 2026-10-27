import { AlertTriangle, Boxes, Building2, CalendarClock, ClipboardCheck, ClipboardList, PackageMinus, UserCheck, Wrench } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Link } from 'react-router-dom'
import { customers, equipment, maintenancePlans, parts, technicians } from '../data/mock-data'
import { useAppStore } from '../state/AppStore'
import { MetricCard, PageHeader, PriorityBadge, Section, StatusBadge } from '../components/ui'

const requestTrend = [{ month: 'T4', value: 28 }, { month: 'T5', value: 35 }, { month: 'T6', value: 31 }, { month: 'T7', value: 43 }, { month: 'T8', value: 39 }, { month: 'T9', value: 52 }]
const statusData = [{ name: 'Đang xử lý', value: 18, color: '#2563eb' }, { name: 'Chờ xử lý', value: 11, color: '#f59e0b' }, { name: 'Hoàn thành', value: 32, color: '#16a34a' }, { name: 'Tạm dừng', value: 4, color: '#94a3b8' }]

export function DashboardPage() {
  const { requests, workOrders } = useAppStore()
  return <div className="page">
    <PageHeader eyebrow="Thứ Ba, 29 tháng 9" title="Chào buổi sáng, anh Huy" description="Đây là tình hình vận hành dịch vụ của doanh nghiệp hôm nay." actions={<Link className="button button--primary button--md" to="/app/service-requests">Xem yêu cầu dịch vụ</Link>} />
    <div className="metrics-grid metrics-grid--4">
      <MetricCard label="Khách hàng" value={customers.length + 125} detail="+8 trong tháng này" icon={<Building2 />} />
      <MetricCard label="Tổng thiết bị" value="486" detail="472 đang hoạt động" icon={<Boxes />} tone="violet" />
      <MetricCard label="Yêu cầu đang mở" value={requests.filter((r) => !['CLOSED', 'RESOLVED', 'CANCELLED'].includes(r.status)).length + 20} detail="5 cần xử lý hôm nay" icon={<ClipboardList />} tone="amber" />
      <MetricCard label="Lệnh đang thực hiện" value={workOrders.filter((w) => w.status === 'IN_PROGRESS').length + 11} detail="3 có độ ưu tiên cao" icon={<Wrench />} tone="green" />
      <MetricCard label="Bảo hành hiệu lực" value="391" detail="80,5% tổng thiết bị" icon={<ClipboardCheck />} tone="green" />
      <MetricCard label="Kỹ thuật viên sẵn sàng" value={technicians.filter((t) => t.availability === 'AVAILABLE').length + 6} detail="trên 14 kỹ thuật viên" icon={<UserCheck />} />
      <MetricCard label="Bảo trì sắp tới" value={maintenancePlans.filter((m) => m.status !== 'ACTIVE').length + 7} detail="2 kế hoạch quá hạn" icon={<CalendarClock />} tone="amber" />
      <MetricCard label="Phụ tùng sắp hết" value={parts.filter((p) => p.stock <= p.minimum).length} detail="Cần bổ sung tồn kho" icon={<PackageMinus />} tone="violet" />
    </div>
    <div className="dashboard-grid">
      <Section title="Yêu cầu dịch vụ" description="Xu hướng 6 tháng gần nhất" actions={<button className="text-button">Xem báo cáo →</button>}>
        <div className="chart chart--bar"><ResponsiveContainer width="100%" height="100%"><BarChart data={requestTrend} margin={{ left: -24, right: 8, top: 8 }}><CartesianGrid vertical={false} stroke="#e8edf3" /><XAxis dataKey="month" axisLine={false} tickLine={false} /><YAxis axisLine={false} tickLine={false} /><Tooltip cursor={{ fill: '#f5f7fa' }} /><Bar dataKey="value" fill="#2563eb" radius={[5, 5, 0, 0]} maxBarSize={34} /></BarChart></ResponsiveContainer></div>
      </Section>
      <Section title="Trạng thái lệnh công việc" description="Tổng hợp trong tháng 9">
        <div className="donut-wrap"><div className="chart chart--donut"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={statusData} dataKey="value" innerRadius={52} outerRadius={72} paddingAngle={3}>{statusData.map((entry) => <Cell key={entry.name} fill={entry.color} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer><div className="donut-total"><strong>65</strong><span>Tổng lệnh</span></div></div><ul className="chart-legend">{statusData.map((item) => <li key={item.name}><span style={{ background: item.color }} />{item.name}<strong>{item.value}</strong></li>)}</ul></div>
      </Section>
    </div>
    <div className="dashboard-grid">
      <Section title="Yêu cầu cần chú ý" description="Ưu tiên cao hoặc đang chờ xử lý" actions={<Link to="/app/service-requests" className="text-button">Xem tất cả</Link>}>
        <div className="compact-list">{requests.slice(0, 4).map((request) => <Link to={`/app/service-requests/${request.id}`} key={request.id} className="compact-list__item"><div className="entity-icon"><AlertTriangle size={18} /></div><div><strong>{request.title}</strong><span>{request.number} · {equipment.find((e) => e.id === request.equipmentId)?.name}</span></div><PriorityBadge priority={request.priority} /><StatusBadge status={request.status} /></Link>)}</div>
      </Section>
      <Section title="Lịch công việc hôm nay" description="Thứ Ba, 29/09/2026" actions={<Link to="/app/work-orders" className="text-button">Xem lịch</Link>}>
        <div className="schedule-list"><div><time>08:00</time><span /><p><strong>Kiểm tra máy nén khí</strong><small>Phạm Quốc Bảo · Nhà máy Đà Nẵng</small></p></div><div><time>10:30</time><span /><p><strong>Bảo trì máy CNC Robodrill</strong><small>Võ Thành Công · Xưởng Gia công</small></p></div><div><time>14:00</time><span /><p><strong>Khảo sát hệ thống AOI</strong><small>Nguyễn Hoàng Lâm · Nhà máy Thủ Đức</small></p></div></div>
      </Section>
    </div>
  </div>
}


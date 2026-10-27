import { MoreHorizontal, Plus, QrCode } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Button, EmptyState, Field, IconButton, InfoGrid, PageHeader, Pagination, SearchInput, Section, Select, StatusBadge, Table, Tabs } from '../components/ui'
import { customers, equipment, locations, maintenancePlans } from '../data/mock-data'
import { useAppStore } from '../state/AppStore'

export function EquipmentPage() {
  const [query, setQuery] = useState('')
  const filtered = useMemo(() => equipment.filter((item) => `${item.name} ${item.assetCode} ${item.serial}`.toLowerCase().includes(query.toLowerCase())), [query])
  return <div className="page"><PageHeader eyebrow="Vận hành dịch vụ" title="Thiết bị" description="Theo dõi thiết bị đã bàn giao, bảo hành và lịch sử dịch vụ." actions={<Link to="/app/equipment/new" className="button button--primary button--md"><Plus size={17} /> Thêm thiết bị</Link>} />
    <div className="summary-strip"><div><strong>486</strong><span>Tổng thiết bị</span></div><div><strong>472</strong><span>Đang hoạt động</span></div><div><strong>391</strong><span>Còn bảo hành</span></div><div><strong>8</strong><span>Cần chú ý</span></div></div>
    <Section><div className="table-toolbar"><SearchInput placeholder="Tìm mã tài sản, tên, model, serial..." value={query} onChange={(event) => setQuery(event.target.value)} /><div><Select label="Bảo hành"><option>Tất cả bảo hành</option><option>Còn hiệu lực</option><option>Hết hạn</option></Select><Select label="Trạng thái"><option>Tất cả trạng thái</option><option>Hoạt động</option></Select></div></div>
      {filtered.length ? <><Table headers={['Mã tài sản', 'Thiết bị', 'Model / Serial', 'Khách hàng', 'Vị trí', 'Bảo hành', 'Trạng thái', '']}>
        {filtered.map((item) => <tr key={item.id}><td><Link className="link mono" to={`/app/equipment/${item.id}`}>{item.assetCode}</Link></td><td><strong>{item.name}</strong><small>{item.manufacturer}</small></td><td>{item.model}<small>{item.serial}</small></td><td>{customers.find((c) => c.id === item.customerId)?.name.replace('Công ty ', '')}</td><td>{locations.find((l) => l.id === item.locationId)?.name}</td><td><StatusBadge status={item.warranty} /></td><td><StatusBadge status={item.status} /></td><td><IconButton label="Thao tác"><MoreHorizontal size={18} /></IconButton></td></tr>)}
      </Table><Pagination total={486} /></> : <EmptyState title="Không tìm thấy thiết bị" />}
    </Section></div>
}

export function EquipmentDetailPage({ portal = false }: { portal?: boolean }) {
  const { id } = useParams()
  const { requests } = useAppStore()
  const item = equipment.find((value) => value.id === id) ?? equipment[0]
  const [tab, setTab] = useState('overview')
  const customer = customers.find((value) => value.id === item.customerId)
  const location = locations.find((value) => value.id === item.locationId)
  const serviceRequests = requests.filter((request) => request.equipmentId === item.id)
  const maintenance = maintenancePlans.find((plan) => plan.equipmentId === item.id)
  return <div className="page"><PageHeader eyebrow={item.assetCode} title={item.name} description={`${item.manufacturer} ${item.model} · Serial ${item.serial}`} actions={portal ? <Link className="button button--primary button--md" to={`/portal/requests/new?equipment=${item.id}`}>Tạo yêu cầu dịch vụ</Link> : <><Button variant="secondary"><QrCode size={17} /> Mã QR</Button><Button>Chỉnh sửa thiết bị</Button></>} />
    <div className="entity-status-bar"><StatusBadge status={item.status} /><span>•</span><StatusBadge status={item.warranty} /><span>Bảo hành đến {item.warrantyEnd}</span><span>•</span><span>{location?.name}</span></div>
    <Tabs active={tab} onChange={setTab} items={[{ id: 'overview', label: 'Tổng quan' }, { id: 'location', label: 'Khách hàng & vị trí' }, { id: 'warranty', label: 'Bảo hành' }, { id: 'history', label: 'Lịch sử dịch vụ', count: serviceRequests.length }, { id: 'maintenance', label: 'Bảo trì' }, { id: 'attachments', label: 'Tệp & QR' }]} />
    {tab === 'overview' && <div className="detail-grid"><Section title="Thông tin thiết bị"><InfoGrid items={[{ label: 'Mã tài sản', value: item.assetCode }, { label: 'Tên thiết bị', value: item.name }, { label: 'Hãng sản xuất', value: item.manufacturer }, { label: 'Model', value: item.model }, { label: 'Số serial', value: item.serial }, { label: 'Trạng thái', value: <StatusBadge status={item.status} /> }]} /></Section><Section title="Mốc bàn giao"><InfoGrid items={[{ label: 'Ngày lắp đặt', value: item.installationDate }, { label: 'Ngày bàn giao', value: item.handoverDate }, { label: 'Kết thúc bảo hành', value: item.warrantyEnd }, { label: 'Tình trạng bảo hành', value: <StatusBadge status={item.warranty} /> }]} /></Section></div>}
    {tab === 'location' && <Section title="Đơn vị sử dụng và vị trí lắp đặt"><div className="location-summary"><div><span className="entity-avatar">KH</span><div><strong>{customer?.name}</strong><small>{customer?.address}</small></div></div><div className="location-path"><span>Nhà máy Đà Nẵng</span><b>›</b><span>Xưởng Gia công</span><b>›</b><strong>{location?.name}</strong></div></div></Section>}
    {tab === 'warranty' && <Section title="Thông tin bảo hành"><InfoGrid items={[{ label: 'Trạng thái', value: <StatusBadge status={item.warranty} /> }, { label: 'Ngày bắt đầu', value: item.handoverDate }, { label: 'Ngày kết thúc', value: item.warrantyEnd }, { label: 'Phạm vi', value: 'Linh kiện và nhân công theo điều kiện tiêu chuẩn' }]} /></Section>}
    {tab === 'history' && <Section>{serviceRequests.length ? <Table headers={['Mã yêu cầu', 'Nội dung', 'Ngày tạo', 'Trạng thái']}>{serviceRequests.map((request) => <tr key={request.id}><td><Link className="link" to={`${portal ? '/portal/requests' : '/app/service-requests'}/${request.id}`}>{request.number}</Link></td><td>{request.title}</td><td>{request.createdAt}</td><td><StatusBadge status={request.status} /></td></tr>)}</Table> : <EmptyState />}</Section>}
    {tab === 'maintenance' && <Section title="Kế hoạch bảo trì"><InfoGrid items={maintenance ? [{ label: 'Chu kỳ', value: maintenance.frequency }, { label: 'Lần gần nhất', value: maintenance.lastDate }, { label: 'Kỳ tiếp theo', value: maintenance.nextDate }, { label: 'Trạng thái', value: <StatusBadge status={maintenance.status} /> }] : [{ label: 'Kế hoạch', value: 'Chưa thiết lập' }]} /></Section>}
    {tab === 'attachments' && <Section title="Tài liệu & mã nhận diện"><div className="qr-placeholder"><QrCode size={88} /><strong>{item.assetCode}</strong><p>Dùng ứng dụng kỹ thuật viên để quét và mở hồ sơ thiết bị.</p></div></Section>}
  </div>
}

export function EquipmentFormPage() {
  return <div className="page page--narrow"><PageHeader title="Thêm thiết bị" description="Gán thiết bị đã bàn giao cho khách hàng và địa điểm sử dụng." /><Section title="Thông tin nhận diện"><form className="form-grid"><Field label="Khách hàng" required><select defaultValue=""><option value="" disabled>Chọn khách hàng</option>{customers.map((c) => <option key={c.id}>{c.name}</option>)}</select></Field><Field label="Địa điểm" required><select><option>Nhà máy Đà Nẵng › Xưởng Gia công › Khu CNC</option></select></Field><Field label="Tên thiết bị" required><input /></Field><Field label="Model" required><input /></Field><Field label="Số serial" required><input /></Field><Field label="Hãng sản xuất"><input /></Field><Field label="Ngày lắp đặt"><input type="date" /></Field><Field label="Ngày bàn giao"><input type="date" /></Field><Field label="Thời hạn bảo hành (tháng)"><input type="number" min="0" defaultValue="24" /></Field><div className="form-actions"><Button variant="secondary" type="button">Hủy</Button><Button type="submit">Tạo thiết bị</Button></div></form></Section></div>
}

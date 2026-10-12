import { Building2, MoreHorizontal, Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Button, EmptyState, Field, IconButton, InfoGrid, PageHeader, Pagination, SearchInput, Section, Select, StatusBadge, Table, Tabs } from '../components/ui'
import { customers, equipment, locations } from '../data/mock-data'
import { useAppStore } from '../state/AppStore'

export function CustomersPage() {
  const [query, setQuery] = useState('')
  const filtered = useMemo(() => customers.filter((customer) => customer.name.toLowerCase().includes(query.toLowerCase()) || customer.code.toLowerCase().includes(query.toLowerCase())), [query])
  return <div className="page"><PageHeader eyebrow="Vận hành dịch vụ" title="Khách hàng" description="Quản lý doanh nghiệp sử dụng thiết bị và các địa điểm vận hành." actions={<Button><Plus size={17} /> Thêm khách hàng</Button>} />
    <Section><div className="table-toolbar"><SearchInput placeholder="Tìm theo tên, mã, mã số thuế..." value={query} onChange={(event) => setQuery(event.target.value)} /><div><Select label="Ngành"><option>Tất cả ngành</option><option>Sản xuất</option></Select><Select label="Trạng thái"><option>Đang hoạt động</option><option>Tất cả trạng thái</option></Select></div></div>
      {filtered.length ? <><Table headers={['Khách hàng', 'Liên hệ chính', 'Thiết bị', 'Yêu cầu mở', 'Trạng thái', '']}>
        {filtered.map((customer) => <tr key={customer.id}><td><Link to={`/app/customers/${customer.id}`} className="entity-cell"><span className="entity-avatar"><Building2 size={18} /></span><span><strong>{customer.name}</strong><small>{customer.code} · MST {customer.taxCode}</small></span></Link></td><td><strong>{customer.contact}</strong><small>{customer.email}</small></td><td>{equipment.filter((item) => item.customerId === customer.id).length}</td><td>{customer.id === 'cus-1' ? 2 : 1}</td><td><StatusBadge status="ACTIVE" /></td><td><IconButton label="Thao tác"><MoreHorizontal size={18} /></IconButton></td></tr>)}
      </Table><Pagination total={customers.length} /></> : <EmptyState title="Không tìm thấy khách hàng" description="Thử thay đổi từ khóa hoặc bộ lọc của bạn." />}
    </Section></div>
}

export function CustomerDetailPage() {
  const { id } = useParams()
  const { requests } = useAppStore()
  const customer = customers.find((item) => item.id === id) ?? customers[0]
  const [tab, setTab] = useState('overview')
  const customerEquipment = equipment.filter((item) => item.customerId === customer.id)
  const customerRequests = requests.filter((item) => item.customerId === customer.id)
  return <div className="page"><PageHeader eyebrow={customer.code} title={customer.name} description={`${customer.industry} · ${customer.address}`} actions={<><Button variant="secondary">Chỉnh sửa</Button><Button><Plus size={17} /> Tạo yêu cầu</Button></>} />
    <Tabs active={tab} onChange={setTab} items={[{ id: 'overview', label: 'Tổng quan' }, { id: 'locations', label: 'Địa điểm', count: locations.filter((l) => l.customerId === customer.id).length }, { id: 'equipment', label: 'Thiết bị', count: customerEquipment.length }, { id: 'requests', label: 'Yêu cầu dịch vụ', count: customerRequests.length }, { id: 'history', label: 'Lịch sử dịch vụ' }]} />
    {tab === 'overview' && <div className="detail-grid"><Section title="Thông tin doanh nghiệp"><InfoGrid items={[{ label: 'Mã khách hàng', value: customer.code }, { label: 'Mã số thuế', value: customer.taxCode }, { label: 'Ngành', value: customer.industry }, { label: 'Điện thoại', value: customer.phone }, { label: 'Email', value: customer.email }, { label: 'Địa chỉ', value: customer.address }]} /></Section><Section title="Liên hệ chính"><div className="contact-card"><span className="avatar avatar--large">{customer.contact.split(' ').slice(-2).map((s) => s[0]).join('')}</span><div><strong>{customer.contact}</strong><p>Quản lý kỹ thuật</p><small>{customer.email}<br />{customer.phone}</small></div></div></Section></div>}
    {tab === 'locations' && <Section title="Cây địa điểm" description="Cấu trúc vị trí lắp đặt thiết bị"><div className="location-tree">{locations.filter((l) => l.customerId === customer.id).map((location) => <div key={location.id} style={{ marginLeft: location.parentId ? location.type === 'AREA' ? 64 : 32 : 0 }}><span /><div><strong>{location.name}</strong><small>{location.type} · {location.address}</small></div></div>)}</div></Section>}
    {tab === 'equipment' && <Section><Table headers={['Mã tài sản', 'Thiết bị', 'Model / Serial', 'Bảo hành', 'Trạng thái']}>{customerEquipment.map((item) => <tr key={item.id}><td><Link to={`/app/equipment/${item.id}`} className="link">{item.assetCode}</Link></td><td><strong>{item.name}</strong></td><td>{item.model}<small>{item.serial}</small></td><td><StatusBadge status={item.warranty} /></td><td><StatusBadge status={item.status} /></td></tr>)}</Table></Section>}
    {tab === 'requests' && <Section><Table headers={['Mã yêu cầu', 'Vấn đề', 'Ưu tiên', 'Trạng thái']}>{customerRequests.map((request) => <tr key={request.id}><td><Link className="link" to={`/app/service-requests/${request.id}`}>{request.number}</Link></td><td>{request.title}</td><td>{request.priority}</td><td><StatusBadge status={request.status} /></td></tr>)}</Table></Section>}
    {tab === 'history' && <EmptyState title="Lịch sử được tổng hợp từ báo cáo dịch vụ" description="Các báo cáo đã xác nhận sẽ hiển thị theo dòng thời gian tại đây." />}
  </div>
}

export function CustomerFormPage() { return <div className="page page--narrow"><PageHeader title="Thêm khách hàng" description="Tạo hồ sơ doanh nghiệp sử dụng thiết bị." /><Section title="Thông tin doanh nghiệp"><form className="form-grid"><Field label="Tên doanh nghiệp" required><input placeholder="Ví dụ: Công ty TNHH Cơ khí Đông Á" /></Field><Field label="Mã số thuế" required><input placeholder="10 hoặc 13 chữ số" /></Field><Field label="Ngành hoạt động"><select><option>Chọn ngành</option><option>Sản xuất công nghiệp</option><option>Điện tử</option></select></Field><Field label="Điện thoại"><input type="tel" /></Field><Field label="Email"><input type="email" /></Field><Field label="Người liên hệ chính"><input /></Field><Field label="Địa chỉ" required><textarea rows={3} /></Field><div className="form-actions"><Button variant="secondary" type="button">Hủy</Button><Button type="submit">Tạo khách hàng</Button></div></form></Section></div> }

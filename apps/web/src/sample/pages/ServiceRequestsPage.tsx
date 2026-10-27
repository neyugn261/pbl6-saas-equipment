import { Check, ChevronRight, FileText, MoreHorizontal, Paperclip, Plus, Send, ShieldCheck, X } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ActivityTimeline, Button, Currency, Dialog, EmptyState, Field, IconButton, InfoGrid, PageHeader, Pagination, PriorityBadge, SearchInput, Section, Select, StatusBadge, Table } from '../components/ui'
import { customers, equipment, locations, technicians } from '../data/mock-data'
import { useAppStore } from '../state/AppStore'
import type { Priority, RequestStatus } from '../types/domain'

export function ServiceRequestsPage({ portal = false }: { portal?: boolean }) {
  const { requests } = useAppStore()
  const [query, setQuery] = useState('')
  const visible = useMemo(() => requests.filter((request) => {
    const matchesPortal = !portal || request.customerId === 'cus-1'
    return matchesPortal && `${request.number} ${request.title}`.toLowerCase().includes(query.toLowerCase())
  }), [requests, query, portal])
  return <div className="page"><PageHeader eyebrow={portal ? 'Hỗ trợ kỹ thuật' : 'Vận hành dịch vụ'} title="Yêu cầu dịch vụ" description={portal ? 'Theo dõi tiến độ xử lý và trao đổi với bộ phận kỹ thuật.' : 'Tiếp nhận, đánh giá và điều phối các yêu cầu từ khách hàng.'} actions={<Link to={portal ? '/portal/requests/new' : '/app/service-requests/new'} className="button button--primary button--md"><Plus size={17} /> Tạo yêu cầu</Link>} />
    <div className="request-status-cards"><div><strong>{visible.length}</strong><span>Tất cả</span></div><div><strong>{visible.filter((r) => r.status === 'NEW').length}</strong><span>Mới</span></div><div><strong>{visible.filter((r) => ['REVIEWING', 'AWAITING_CUSTOMER_APPROVAL'].includes(r.status)).length}</strong><span>Chờ xử lý</span></div><div><strong>{visible.filter((r) => r.status === 'PROCESSING').length}</strong><span>Đang xử lý</span></div><div><strong>{visible.filter((r) => ['RESOLVED', 'CLOSED'].includes(r.status)).length}</strong><span>Hoàn thành</span></div></div>
    <Section><div className="table-toolbar"><SearchInput placeholder="Tìm mã yêu cầu, nội dung..." value={query} onChange={(event) => setQuery(event.target.value)} /><div><Select label="Ưu tiên"><option>Tất cả ưu tiên</option><option>Khẩn cấp</option><option>Cao</option></Select><Select label="Trạng thái"><option>Tất cả trạng thái</option><option>Mới</option><option>Đang xử lý</option></Select></div></div>
      {visible.length ? <><Table headers={portal ? ['Mã yêu cầu', 'Thiết bị', 'Ngày tạo', 'Ưu tiên', 'Trạng thái', ''] : ['Mã yêu cầu', 'Nội dung', 'Khách hàng / Thiết bị', 'Ngày tạo', 'Ưu tiên', 'Trạng thái', '']}>
        {visible.map((request) => { const item = equipment.find((e) => e.id === request.equipmentId); const customer = customers.find((c) => c.id === request.customerId); return <tr key={request.id}><td><Link className="link mono" to={`${portal ? '/portal/requests' : '/app/service-requests'}/${request.id}`}>{request.number}</Link></td>{!portal && <td><strong>{request.title}</strong><small>{request.type}</small></td>}<td><strong>{portal ? item?.name : customer?.name}</strong><small>{portal ? item?.assetCode : item?.name}</small></td><td>{request.createdAt}</td><td><PriorityBadge priority={request.priority} /></td><td><StatusBadge status={request.status} /></td><td><IconButton label="Thao tác"><MoreHorizontal size={18} /></IconButton></td></tr> })}
      </Table><Pagination total={visible.length} /></> : <EmptyState title="Chưa có yêu cầu phù hợp" description="Tạo yêu cầu mới hoặc thay đổi điều kiện tìm kiếm." />}
    </Section></div>
}

export function ServiceRequestDetailPage({ portal = false }: { portal?: boolean }) {
  const { id } = useParams()
  const { requests, updateRequestStatus, approveEstimate } = useAppStore()
  const [estimateOpen, setEstimateOpen] = useState(false)
  const [rejectOpen, setRejectOpen] = useState(false)
  const request = requests.find((value) => value.id === id) ?? requests[0]
  const item = equipment.find((value) => value.id === request.equipmentId) ?? equipment[0]
  const customer = customers.find((value) => value.id === request.customerId)
  const location = locations.find((value) => value.id === item.locationId)
  const total = request.estimate ? request.estimate.labor + request.estimate.parts + request.estimate.other : 0
  const action = (status: RequestStatus, message: string) => updateRequestStatus(request.id, status, message)
  return <div className="page"><PageHeader eyebrow={request.number} title={request.title} description={`Tạo lúc ${request.createdAt}`} actions={portal ? undefined : <div className="action-group">{request.status === 'NEW' && <Button onClick={() => action('REVIEWING', 'Bắt đầu xem xét')}>Bắt đầu xem xét</Button>}{request.status === 'REVIEWING' && <><Button variant="secondary" onClick={() => setRejectOpen(true)}>Từ chối</Button>{item.warranty === 'EXPIRED' && <Button variant="secondary" onClick={() => setEstimateOpen(true)}>Tạo báo giá</Button>}<Button onClick={() => action('ACCEPTED', 'Đã tiếp nhận yêu cầu')}>Tiếp nhận</Button></>}{request.status === 'ACCEPTED' && <Button onClick={() => action('PROCESSING', 'Bắt đầu xử lý')}>Bắt đầu xử lý</Button>}{request.status === 'PROCESSING' && <Button onClick={() => action('RESOLVED', 'Đã hoàn thành công việc')}>Đánh dấu đã xử lý</Button>}</div>} />
    <div className="request-header-bar"><StatusBadge status={request.status} /><PriorityBadge priority={request.priority} /><span>{request.type}</span><span><Paperclip size={15} /> {request.attachments} tệp đính kèm</span></div>
    <div className="detail-layout"><div className="detail-main"><Section title="Mô tả sự cố"><p className="prose">{request.description}</p><div className="attachment-row"><div><FileText size={18} /><span><strong>video-loi-van-hanh.mp4</strong><small>12,4 MB</small></span></div><div><FileText size={18} /><span><strong>anh-ma-loi-e104.jpg</strong><small>1,8 MB</small></span></div></div></Section>
      <Section title="Thiết bị & vị trí"><Link className="equipment-summary" to={`${portal ? '/portal/equipment' : '/app/equipment'}/${item.id}`}><span className="entity-avatar">EQ</span><div><strong>{item.name}</strong><p>{item.assetCode} · {item.model} · {item.serial}</p><small>{location?.name} · {location?.address}</small></div><ChevronRight /></Link></Section>
      {request.estimate && <Section title="Chi phí dự kiến" description="Báo giá sửa chữa ngoài phạm vi bảo hành"><div className="estimate"><div><span>Nhân công</span><strong><Currency value={request.estimate.labor} /></strong></div><div><span>Phụ tùng</span><strong><Currency value={request.estimate.parts} /></strong></div><div><span>Chi phí khác</span><strong><Currency value={request.estimate.other} /></strong></div><div className="estimate__total"><span>Tổng cộng</span><strong><Currency value={total} /></strong></div><div className="estimate__status"><StatusBadge status={request.estimate.status} />{portal && request.estimate.status === 'PENDING' && <div><Button variant="secondary" onClick={() => approveEstimate(request.id, false)}>Từ chối</Button><Button onClick={() => approveEstimate(request.id, true)}><Check size={17} /> Phê duyệt báo giá</Button></div>}</div></div></Section>}
      {(request.status === 'RESOLVED' || request.status === 'CLOSED') && <Section title="Báo cáo dịch vụ"><div className="service-report"><div className="service-report__icon"><ShieldCheck /></div><div><strong>Thiết bị đã vận hành ổn định</strong><p>Đã thay cảm biến nhiệt PT100, vệ sinh giàn giải nhiệt và chạy thử tải 60 phút. Các thông số nằm trong phạm vi cho phép.</p><small>Kỹ thuật viên: {technicians[0].name} · Hoàn thành 29/09/2026, 11:42</small></div></div>{portal && request.status === 'RESOLVED' && <Button onClick={() => action('CLOSED', 'Khách hàng xác nhận hoàn thành')}>Xác nhận hoàn thành dịch vụ</Button>}</Section>}
    </div><aside className="detail-aside"><Section title="Thông tin yêu cầu"><InfoGrid items={[{ label: 'Khách hàng', value: customer?.name }, { label: 'Người liên hệ', value: request.contact }, { label: 'Bảo hành', value: <StatusBadge status={item.warranty} /> }, { label: 'Điều phối viên', value: 'Lê Anh Tuấn' }, { label: 'Kỹ thuật viên', value: request.status === 'NEW' ? 'Chưa phân công' : 'Phạm Quốc Bảo' }]} /></Section><Section title="Dòng thời gian"><ActivityTimeline events={request.timeline} /></Section></aside></div>
    <Dialog open={estimateOpen} onClose={() => setEstimateOpen(false)} title="Tạo báo giá chi phí" description="Chi phí dự kiến để khách hàng xem xét và phê duyệt."><form className="dialog-form"><Field label="Chi phí nhân công"><input type="number" defaultValue="1800000" /></Field><Field label="Chi phí phụ tùng"><input type="number" defaultValue="4250000" /></Field><Field label="Chi phí khác"><input type="number" defaultValue="350000" /></Field><Field label="Ghi chú"><textarea rows={3} defaultValue="Báo giá có hiệu lực trong 7 ngày." /></Field><div className="dialog-actions"><Button variant="secondary" type="button" onClick={() => setEstimateOpen(false)}>Hủy</Button><Button type="button" onClick={() => { action('AWAITING_CUSTOMER_APPROVAL', 'Đã gửi báo giá'); setEstimateOpen(false) }}><Send size={17} /> Gửi báo giá</Button></div></form></Dialog>
    <Dialog open={rejectOpen} onClose={() => setRejectOpen(false)} title="Từ chối yêu cầu" description="Khách hàng sẽ nhận được lý do từ chối."><div className="dialog-form"><Field label="Lý do" required><textarea rows={4} placeholder="Nhập lý do rõ ràng..." /></Field><div className="dialog-actions"><Button variant="secondary" onClick={() => setRejectOpen(false)}>Quay lại</Button><Button variant="danger" onClick={() => { action('REQUEST_REJECTED', 'Yêu cầu bị từ chối'); setRejectOpen(false) }}><X size={17} /> Xác nhận từ chối</Button></div></div></Dialog>
  </div>
}

export function RequestFormPage({ portal = false }: { portal?: boolean }) {
  const { createRequest } = useAppStore()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const initialEquipment = searchParams.get('equipment') ?? 'eq-1'
  const [equipmentId, setEquipmentId] = useState(initialEquipment)
  const [description, setDescription] = useState('')
  const [title, setTitle] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const selected = equipment.find((item) => item.id === equipmentId) ?? equipment[0]
  const submit = (event: FormEvent) => {
    event.preventDefault()
    const nextErrors: Record<string, string> = {}
    if (!title.trim()) nextErrors.title = 'Vui lòng nhập tiêu đề sự cố.'
    if (description.trim().length < 20) nextErrors.description = 'Mô tả cần ít nhất 20 ký tự để kỹ thuật viên có đủ thông tin.'
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length) return
    const request = createRequest({ customerId: selected.customerId, equipmentId, type: 'Sửa chữa', priority: 'MEDIUM' as Priority, title, description, contact: 'Nguyễn Minh Quân · 0905 228 910' })
    navigate(`${portal ? '/portal/requests' : '/app/service-requests'}/${request.id}`)
  }
  return <div className="page page--form"><PageHeader eyebrow="Yêu cầu mới" title="Bạn cần hỗ trợ thiết bị nào?" description={portal ? 'Cung cấp thông tin sự cố, đội ngũ kỹ thuật sẽ phản hồi sớm nhất.' : 'Tạo yêu cầu thay mặt khách hàng.'} />
    <form onSubmit={submit}><div className="detail-layout"><div className="detail-main"><Section title="1. Chọn thiết bị"><Field label="Thiết bị" required><select value={equipmentId} onChange={(event) => setEquipmentId(event.target.value)}>{equipment.filter((item) => !portal || item.customerId === 'cus-1').map((item) => <option key={item.id} value={item.id}>{item.name} · {item.assetCode}</option>)}</select></Field><div className="selected-equipment"><span className="entity-avatar">EQ</span><div><strong>{selected.name}</strong><p>{selected.model} · Serial {selected.serial}</p><small>{locations.find((l) => l.id === selected.locationId)?.name}</small></div><StatusBadge status={selected.warranty} /></div></Section>
      <Section title="2. Mô tả vấn đề"><div className="form-grid"><Field label="Loại yêu cầu" required><select><option>Sửa chữa sự cố</option><option>Kiểm tra thiết bị</option><option>Bảo trì</option></select></Field><Field label="Mức độ ưu tiên"><select><option>Trung bình</option><option>Cao</option><option>Khẩn cấp</option><option>Thấp</option></select></Field><Field label="Tiêu đề" required error={errors.title}><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Ví dụ: Máy báo lỗi nhiệt độ cao" /></Field><Field label="Mô tả chi tiết" required error={errors.description} hint="Nêu hiện tượng, thời điểm xảy ra và bước đã thử xử lý."><textarea rows={6} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Mô tả vấn đề thiết bị đang gặp phải..." /></Field></div></Section>
      <Section title="3. Tệp đính kèm"><label className="file-upload"><input type="file" multiple /><Paperclip /><strong>Thả ảnh hoặc video vào đây</strong><span>PNG, JPG, MP4 hoặc PDF · tối đa 20 MB/tệp</span></label></Section></div>
      <aside className="detail-aside"><Section title="Thông tin liên hệ"><InfoGrid items={[{ label: 'Người liên hệ', value: 'Nguyễn Minh Quân' }, { label: 'Số điện thoại', value: '0905 228 910' }, { label: 'Email', value: 'baotri@hoaphatdn.vn' }]} /><button type="button" className="text-button">Thay đổi liên hệ</button></Section><div className="submit-panel"><p>Bằng việc gửi yêu cầu, bạn xác nhận thông tin trên là chính xác.</p><Button type="submit"><Send size={17} /> Gửi yêu cầu dịch vụ</Button></div></aside></div></form>
  </div>
}

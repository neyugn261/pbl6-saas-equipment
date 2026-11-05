import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { api } from '../api/client'
import { getSessionGeneration, useSession } from '../auth/session'
import type { Page } from '../types/domain'
import { DirectoryPicker } from './registration-shared'
import { errorText } from './registration-data'
import { displayName } from '../display-names'

const labels: Record<string, string> = { DRAFT: 'Bản nháp', PENDING_CUSTOMER_CONFIRMATION: 'Chờ khách xác nhận',
  ACTIVATED: 'Đã xác nhận và kích hoạt', REJECTED: 'Đã từ chối', CANCELLED: 'Đã hủy', EXPIRED: 'Hết hạn' }
type Handover = { id: string; handoverNo: string; equipmentId: string; customerId: string; status: string;
  createdByName?: string | null; customerSiteName?: string | null; customerSiteCode?: string | null;
  snapshot: { assetCode: string; name: string; model: string; serialNumber: string; customerName: string; customerSiteId: string;
    customerSiteName?: string; createdByName?: string; deliveryAt: string; condition: string; notes: string; contentVersion: number }; createdBy?: string;
  expiresAt: string; submittedAt: string | null; acceptedAt: string | null; activatedAt: string | null; rejectedReason: string | null;
  supersededById: string | null; equipmentStatus?: string; isCurrent?: boolean; audit?: { action: string; occurredAt: string }[] }
const date = (value: string | null) => value ? new Date(value).toLocaleString('vi-VN') : '—'
function useContext() {
  const { profile } = useSession()
  const customer = profile?.userType === 'CUSTOMER'
  return { customer, canRespond: profile?.roles.includes('CUSTOMER_ADMIN'),
    base: `${customer ? '/my' : ''}/equipment-handovers`, path: `${customer ? '/portal' : '/app'}/equipment-handovers` }
}

export function HandoverListPage() {
  const { customer, base, path } = useContext()
  const [page, setPage] = useState(1), [status, setStatus] = useState(''), [q, setQ] = useState('')
  const [revision, setRevision] = useState(0)
  const generation = getSessionGeneration()
  const key = `${base}:${page}:${status}:${q}:${revision}:${generation}`
  const [state, setState] = useState<{ key: string; data?: Page<Handover>; error?: string }>({ key: '' })
  useEffect(() => {
    let active = true
    api.asset<Page<Handover>>(`${base}?${new URLSearchParams({ page: String(page), pageSize: '20', ...(status ? { status } : {}), ...(q ? { q } : {}) })}`)
      .then(data => { if (active) setState({ key, data }) }, error => { if (active) setState({ key, error: errorText(error) }) })
    return () => { active = false }
  }, [base, page, status, q, key])
  const data = state.key === key ? state.data : undefined
  return <section className="m2-page"><h1>{customer ? 'Xác nhận bàn giao thiết bị' : 'Quản lý bàn giao thiết bị'}</h1>
    {!customer && <p><Link className="m1-button" to={`${path}/new`}>Tạo yêu cầu bàn giao</Link>{' · '}
      <Link to="/app/equipment-registrations/new?handoverRequired=true">Đăng ký thiết bị mới chờ xác nhận</Link></p>}
    <div className="registration-actions"><label>Tìm mã bàn giao / thiết bị<input value={q} maxLength={100} onChange={e => { setQ(e.target.value); setPage(1) }} /></label>
      <label>Trạng thái<select value={status} onChange={e => { setStatus(e.target.value); setPage(1) }}><option value="">Tất cả</option>
        {Object.entries(labels).filter(([s]) => !customer || s !== 'DRAFT').map(([s, label]) => <option key={s} value={s}>{label}</option>)}</select></label>
      <button onClick={() => setRevision(v => v + 1)}>Làm mới</button></div>
    {state.key !== key ? <p role="status">Đang tải…</p> : state.error ? <p role="alert" className="m1-error">{state.error}</p> : !data?.items.length ? <p>Chưa có yêu cầu phù hợp.</p> :
      <ul className="m2-linked-list">{data.items.map(row => <li key={row.id}><span><Link to={`${path}/${row.id}`}>{row.handoverNo}</Link>
        <p>{row.snapshot.assetCode} · {row.snapshot.name} · {row.snapshot.serialNumber}</p><p>{row.snapshot.customerName}</p>
        <small>Gửi: {date(row.submittedAt)} · Hạn: {date(row.expiresAt)} · Xác nhận: {date(row.acceptedAt)}</small>
        {!customer && <small> · Người tạo: {displayName('user', { name: row.createdByName }, { name: row.snapshot.createdByName })}</small>}</span><strong>{labels[row.status] ?? row.status}</strong></li>)}</ul>}
    <div className="registration-pagination"><button disabled={page === 1} onClick={() => setPage(v => v - 1)}>Trước</button><span>Trang {page} · {data?.total ?? '…'} yêu cầu</span>
      <button disabled={!data || page * 20 >= data.total} onClick={() => setPage(v => v + 1)}>Sau</button></div>
  </section>
}

export function HandoverCreatePage() {
  const navigate = useNavigate(), [params] = useSearchParams()
  const [equipmentId, setEquipmentId] = useState(params.get('equipmentId') ?? '')
  const [condition, setCondition] = useState(''), [notes, setNotes] = useState('')
  const [deliveryAt, setDeliveryAt] = useState(''), [expiresAt, setExpiresAt] = useState('')
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError('')
    try {
      const row = await api.asset<Handover>('/equipment-handovers', { method: 'POST', body: {
        equipmentId, condition: condition.trim(), notes: notes.trim(), deliveryAt: new Date(deliveryAt).toISOString(), expiresAt: new Date(expiresAt).toISOString(),
      } })
      navigate(`/app/equipment-handovers/${row.id}`)
    } catch (cause) { setError(errorText(cause)) } finally { setBusy(false) }
  }
  return <section className="m2-page"><h1>Tạo yêu cầu bàn giao</h1><p>Khách hàng và địa điểm nhận lấy từ hồ sơ thiết bị. Nội dung dưới đây được hiển thị cho khách hàng.</p>
    <form className="m1-card m1-form" onSubmit={submit}>
      <DirectoryPicker label="Thiết bị" area="assetM2" path="/equipment" selected={equipmentId} onChange={setEquipmentId} />
      <label>Thời gian bàn giao<input required type="datetime-local" value={deliveryAt} onChange={e => setDeliveryAt(e.target.value)} /></label>
      <label>Hạn xác nhận (tối đa 90 ngày)<input required type="datetime-local" value={expiresAt} onChange={e => setExpiresAt(e.target.value)} /></label>
      <label>Tình trạng thiết bị<textarea required maxLength={2000} value={condition} onChange={e => setCondition(e.target.value)} /></label>
      <label>Ghi chú bàn giao cho khách hàng<textarea maxLength={4000} value={notes} onChange={e => setNotes(e.target.value)} /></label>
      {error && <p role="alert" className="m1-error">{error}</p>}
      <button disabled={busy || !equipmentId || !condition.trim()}>{busy ? 'Đang lưu…' : 'Lưu bản nháp'}</button>
    </form></section>
}

export function HandoverDetailPage() {
  const { id } = useParams(), { customer, canRespond, base, path } = useContext()
  const [revision, setRevision] = useState(0), [busy, setBusy] = useState(false)
  const [error, setError] = useState(''), [message, setMessage] = useState(''), [reason, setReason] = useState('')
  const [action, setAction] = useState<'accept' | 'reject' | 'submit' | 'cancel' | null>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  const generation = getSessionGeneration(), key = `${base}:${id}:${revision}:${generation}`
  const [state, setState] = useState<{ key: string; data?: Handover; error?: string }>({ key: '' })
  useEffect(() => {
    let active = true
    api.asset<Handover>(`${base}/${id}`).then(data => { if (active) setState({ key, data }) }, cause => { if (active) setState({ key, error: errorText(cause) }) })
    return () => { active = false }
  }, [base, id, key])
  const row = state.key === key ? state.data : undefined
  async function confirm(e: FormEvent) {
    e.preventDefault(); if (!action || busy) return
    setBusy(true); setError('')
    try {
      await api.asset(`${base}/${id}/${action}`, { method: 'POST', body: action === 'reject' ? { reason: reason.trim() } : {} })
      setMessage(action === 'reject' ? 'Đã gửi phản hồi từ chối.' : 'Đã ghi nhận thao tác. Trạng thái mới nhất hiển thị bên dưới.')
      dialog.current?.close(); setAction(null); setRevision(v => v + 1)
    } catch (cause) { setError(errorText(cause)); setRevision(v => v + 1) } finally { setBusy(false) }
  }
  const open = (value: NonNullable<typeof action>) => { setAction(value); setReason(''); setError(''); dialog.current?.showModal() }
  const pending = row?.status === 'PENDING_CUSTOMER_CONFIRMATION' && row.isCurrent && !row.supersededById && new Date(row.expiresAt) > new Date()
  return <section className="m2-page"><Link to={path}>← Danh sách bàn giao</Link><h1>Chi tiết bàn giao</h1>
    {message && <p role="status">{message}</p>}{error && <p role="alert" className="m1-error">{error}</p>}
    {state.key !== key ? <p role="status">Đang tải…</p> : state.error ? <p role="alert" className="m1-error">{state.error}</p> : row && <>
      <h2>{row.snapshot.assetCode} · {row.snapshot.name}</h2><p>{row.handoverNo} · <strong>{labels[row.status] ?? row.status}</strong></p>
      <dl><dt>Model / Serial</dt><dd>{row.snapshot.model} / {row.snapshot.serialNumber}</dd>
        <dt>Khách hàng / Địa điểm</dt><dd>{row.snapshot.customerName} / {displayName('site', { name: row.customerSiteName, code: row.customerSiteCode }, { name: row.snapshot.customerSiteName })}{!row.snapshot.customerSiteName && row.customerSiteName && <small> (tên hiện tại)</small>}</dd>
        <dt>Thời gian bàn giao</dt><dd>{date(row.snapshot.deliveryAt)}</dd><dt>Hạn xác nhận</dt><dd>{date(row.expiresAt)}</dd>
        <dt>Tình trạng khi bàn giao</dt><dd>{row.snapshot.condition}</dd><dt>Ghi chú công khai</dt><dd style={{ whiteSpace: 'pre-wrap' }}>{row.snapshot.notes || 'Không có'}</dd>
        <dt>Phiên bản nội dung</dt><dd>{row.snapshot.contentVersion}</dd><dt>Trạng thái thiết bị hiện tại</dt><dd>{row.equipmentStatus}</dd>
        <dt>Khách xác nhận</dt><dd>{date(row.acceptedAt)}</dd><dt>Kích hoạt hoàn tất</dt><dd>{date(row.activatedAt)}</dd></dl>
      {row.rejectedReason && <p>Lý do từ chối: {row.rejectedReason}</p>}
      {row.supersededById && <p>Yêu cầu đã được thay thế. <Link to={`${path}/${row.supersededById}`}>Mở yêu cầu mới</Link></p>}
      {row.status === 'PENDING_CUSTOMER_CONFIRMATION' && !pending && <p>Yêu cầu không còn đủ điều kiện xác nhận hoặc đã hết hạn. Hãy làm mới trạng thái.</p>}
      <div className="registration-actions"><button disabled={busy} onClick={() => setRevision(v => v + 1)}>Làm mới trạng thái</button>
        {customer && canRespond && pending && <><button disabled={busy} onClick={() => open('accept')}>Chấp thuận</button><button disabled={busy} onClick={() => open('reject')}>Từ chối</button></>}
        {!customer && row.status === 'DRAFT' && <button disabled={busy} onClick={() => open('submit')}>Gửi khách xác nhận</button>}
        {!customer && ['DRAFT', 'PENDING_CUSTOMER_CONFIRMATION'].includes(row.status) && <button disabled={busy} onClick={() => open('cancel')}>Hủy yêu cầu</button>}
        {!customer && ['REJECTED', 'CANCELLED', 'EXPIRED', 'ACTIVATED'].includes(row.status) && <Link to={`${path}/new?equipmentId=${row.equipmentId}`}>Tạo lần bàn giao mới</Link>}</div>
      <h2>Lịch sử bàn giao</h2><ol>{row.audit?.map((entry, i) => <li key={i}>{entry.action} · {date(entry.occurredAt)}</li>)}</ol>
    </>}
    <dialog ref={dialog} aria-labelledby="handover-confirm-title" onCancel={e => { if (busy) e.preventDefault(); else setAction(null) }}>
      <form className="m1-form" onSubmit={confirm}><h2 id="handover-confirm-title">Xác nhận thao tác</h2>
        <p>{action === 'accept' ? 'Bạn xác nhận đã nhận thiết bị theo nội dung bàn giao. Thiết bị sẽ được yêu cầu kích hoạt sau xác nhận.' : action === 'reject' ? 'Vui lòng nêu lý do từ chối bàn giao.' : action === 'cancel' ? 'Hủy yêu cầu này? Khách hàng sẽ không thể xác nhận bằng liên kết cũ.' : 'Gửi nội dung bàn giao này cho khách hàng xác nhận?'}</p>
        {action === 'reject' && <label>Lý do<textarea autoFocus required maxLength={2000} value={reason} onChange={e => setReason(e.target.value)} /></label>}
        {error && <p role="alert">{error}</p>}<button disabled={busy || (action === 'reject' && !reason.trim())}>{busy ? 'Đang xử lý…' : 'Xác nhận'}</button>
        <button type="button" disabled={busy} onClick={() => { dialog.current?.close(); setAction(null) }}>Quay lại</button>
      </form></dialog>
  </section>
}

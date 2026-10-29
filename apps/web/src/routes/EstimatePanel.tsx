import { useEffect, useState, type FormEvent } from 'react'
import { api, ApiError } from '../api/client'
import { useSession } from '../auth/session'

type Item = { itemType: string; description: string; quantity: string; unitPrice: string; amount?: string }
type Estimate = { id: string; revisionNo: number; status: string; currency: string; totalAmount: string; validUntil?: string | null; notes?: string | null; items: Item[] }
const blankItem = (): Item => ({ itemType: 'LABOR', description: '', quantity: '1', unitPrice: '0' })
const message = (error: unknown) => error instanceof ApiError ? `${error.status} · ${error.message}` : error instanceof Error ? error.message : String(error)

export default function EstimatePanel({ requestId, onChange }: { requestId: string; onChange: () => void }) {
  const { profile } = useSession()
  const customer = profile?.roles.includes('CUSTOMER_ADMIN')
  const manager = profile?.roles.includes('SERVICE_MANAGER')
  const [estimates, setEstimates] = useState<Estimate[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [items, setItems] = useState<Item[]>([blankItem()])
  const [validUntil, setValidUntil] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  async function reload() {
    const rows = await api.requestsLive<Estimate[]>(`/service-requests/${requestId}/estimates`)
    setEstimates(rows)
    onChange()
  }
  useEffect(() => {
    let active = true
    api.requestsLive<Estimate[]>(`/service-requests/${requestId}/estimates`).then(
      (rows) => { if (active) { setEstimates(rows); setLoading(false) } },
      (cause) => { if (active) { setError(message(cause)); setLoading(false) } },
    )
    return () => { active = false }
  }, [requestId])
  function edit(estimate: Estimate) {
    setSelected(estimate.id)
    setItems(estimate.items.map(({ itemType, description, quantity, unitPrice }) => ({ itemType, description, quantity, unitPrice })))
    setValidUntil(estimate.validUntil?.slice(0, 10) ?? '')
    setNotes(estimate.notes ?? '')
  }
  async function act(path: string, method = 'POST', body?: unknown) {
    setBusy(true); setError('')
    try {
      await api.requestsLive(path, { method, body })
      await reload()
      setSelected(null)
    } catch (cause) {
      setError(message(cause))
      if (cause instanceof ApiError && cause.status === 409) await reload().catch(() => undefined)
    } finally { setBusy(false) }
  }
  function save(event: FormEvent) {
    event.preventDefault()
    const body = { currency: 'VND', ...(validUntil ? { validUntil } : {}), ...(notes.trim() ? { notes: notes.trim() } : {}), items: items.map((item) => ({ ...item, description: item.description.trim() })) }
    void act(selected ? `/service-requests/estimates/${selected}` : `/service-requests/${requestId}/estimates`, selected ? 'PUT' : 'POST', body)
  }
  return <section className="m1-card m1-section-card">
    <div className="m1-section-header"><h2>Dự toán chi phí</h2></div>
    <div className="m1-section-body">
      {loading ? <p>Đang tải…</p> : null}
      {error ? <p role="alert" className="m1-error">{error}</p> : null}
      {!loading && estimates.length === 0 ? <p>Chưa có dự toán.</p> : null}
      {estimates.map((estimate) => <div className="m2-estimate" key={estimate.id}>
        <strong>Bản {estimate.revisionNo} · {estimate.status}</strong>
        <p>Tổng: {estimate.totalAmount} {estimate.currency} · Hiệu lực đến: {estimate.validUntil?.slice(0, 10) ?? 'Không giới hạn'}</p>
        {estimate.notes ? <p>Điều khoản: {estimate.notes}</p> : null}
        <ul>{estimate.items.map((item, index) => <li key={index}>{item.description} · {item.quantity} × {item.unitPrice} = {item.amount ?? '—'}</li>)}</ul>
        <div className="m1-actions">
          {manager && estimate.status === 'DRAFT' ? <><button disabled={busy} onClick={() => edit(estimate)}>Sửa</button><button disabled={busy} onClick={() => void act(`/service-requests/estimates/${estimate.id}/send`)}>Gửi khách hàng</button><button disabled={busy} onClick={() => void act(`/service-requests/estimates/${estimate.id}`, 'DELETE')}>Xóa bản nháp</button></> : null}
          {manager && estimate.status === 'SENT' ? <button disabled={busy} onClick={() => void act(`/service-requests/estimates/${estimate.id}/revise`)}>Tạo bản sửa</button> : null}
          {customer && estimate.status === 'SENT' ? <><button disabled={busy} onClick={() => void act(`/service-requests/estimates/${estimate.id}/approve`)}>Chấp nhận</button><button disabled={busy} onClick={() => { const reason = window.prompt('Lý do từ chối (có thể bỏ trống)'); if (reason !== null) void act(`/service-requests/estimates/${estimate.id}/reject`, 'POST', reason.trim() ? { reason: reason.trim() } : undefined) }}>Từ chối</button></> : null}
        </div>
      </div>)}
      {manager && (selected || !estimates.some((estimate) => estimate.status === 'DRAFT' || estimate.status === 'SENT')) ? <form className="m2-editor" onSubmit={save}>
        <h3>{selected ? 'Sửa bản nháp' : 'Lập dự toán'}</h3>
        <label>Hiệu lực đến <input type="date" value={validUntil} onChange={(event) => setValidUntil(event.target.value)} /></label>
        <label>Điều khoản hiển thị cho khách <textarea value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
        {items.map((item, index) => <fieldset key={index}><legend>Hạng mục {index + 1}</legend>
          <select value={item.itemType} onChange={(event) => setItems(items.map((row, i) => i === index ? { ...row, itemType: event.target.value } : row))}><option value="LABOR">Nhân công</option><option value="PART">Phụ tùng</option><option value="TRAVEL">Di chuyển</option><option value="OTHER">Khác</option></select>
          <input required maxLength={255} placeholder="Mô tả" value={item.description} onChange={(event) => setItems(items.map((row, i) => i === index ? { ...row, description: event.target.value } : row))} />
          <input required type="number" min="0.01" step="0.01" aria-label="Số lượng" value={item.quantity} onChange={(event) => setItems(items.map((row, i) => i === index ? { ...row, quantity: event.target.value } : row))} />
          <input required type="number" min="0" step="0.01" aria-label="Đơn giá" value={item.unitPrice} onChange={(event) => setItems(items.map((row, i) => i === index ? { ...row, unitPrice: event.target.value } : row))} />
          <button type="button" disabled={items.length === 1} onClick={() => setItems(items.filter((_, i) => i !== index))}>Bỏ</button>
        </fieldset>)}
        <button type="button" onClick={() => setItems([...items, blankItem()])}>Thêm hạng mục</button>
        <button disabled={busy}>{busy ? 'Đang lưu…' : 'Lưu bản nháp'}</button>
        {selected ? <button type="button" onClick={() => setSelected(null)}>Đóng</button> : null}
        <p>Tổng tiền do server tính và trả về sau khi lưu.</p>
      </form> : null}
    </div>
  </section>
}

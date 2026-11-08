import { statusNames } from '../workspace/workspace-data'
import { useEffect, useState, type FormEvent } from 'react'
import { ApiError, api } from '../../api/client'
import { getSessionGeneration } from '../../auth/session'

const statuses = [
  'CREATED',
  'ASSIGNED',
  'ACCEPTED',
  'TRAVELLING',
  'IN_PROGRESS',
  'ON_HOLD',
  'COMPLETED',
  'CANCELLED',
] as const
type Status = (typeof statuses)[number]
type WorkOrderSummary = {
  from: string
  to: string
  timezone: 'Asia/Ho_Chi_Minh'
  createdCount: number
  createdByStatus: Record<Status, number>
  completedCount: number
}

function dateInput(date: Date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(date)
}

function addDay(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  const next = new Date(Date.UTC(year, month - 1, day + 1))
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(next.getUTCDate()).padStart(2, '0')}`
}

function apiError(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 401) return 'Phiên đăng nhập hết hạn. Đăng nhập lại để xem báo cáo.'
    if (error.status === 403) return 'Tài khoản chưa có quyền xem báo cáo dịch vụ.'
    if (error.status === 400) return `Khoảng ngày không hợp lệ: ${error.message}`
    if (error.status === 503) return 'Dịch vụ báo cáo Work Order tạm thời không khả dụng.'
    return `${error.status} · ${error.message}`
  }
  return error instanceof Error ? error.message : 'Không thể tải báo cáo Work Order.'
}

function useCurrentMonth() {
  const now = new Date()
  const today = dateInput(now)
  return { from: `${today.slice(0, 7)}-01`, to: today }
}

export function WorkOrderReportsPage() {
  return (
    <div className="m2-page">
      <h1>Báo cáo dịch vụ</h1>
      <p>Theo dõi khối lượng và trạng thái công việc theo khoảng thời gian. Số lệnh hoàn tất chưa thể hiện tỷ lệ sửa chữa thành công hoặc mức hài lòng của khách hàng.</p>
      <WorkOrderSummaryPanel />
    </div>
  )
}

export function WorkOrderSummaryPanel() {
  const sessionGeneration = getSessionGeneration()
  const initial = useCurrentMonth()
  const [from, setFrom] = useState(initial.from)
  const [to, setTo] = useState(initial.to)
  const [query, setQuery] = useState({ from: initial.from, to: initial.to })
  const [reportState, setReportState] = useState<{ key: string; data: WorkOrderSummary | null; error: string }>({
    key: '', data: null, error: '',
  })
  const [validationError, setValidationError] = useState('')
  const queryKey = `${query.from}:${query.to}:session-${sessionGeneration}`
  const loading = reportState.key !== queryKey
  const data = loading ? null : reportState.data
  const error = validationError || (loading ? '' : reportState.error)

  useEffect(() => {
    let active = true
    const fromInstant = `${query.from}T00:00:00+07:00`
    const toInstant = `${addDay(query.to)}T00:00:00+07:00`
    const search = new URLSearchParams({ from: fromInstant, to: toInstant })
    api.workorders<WorkOrderSummary>(`/reports/work-orders/summary?${search}`).then(
      (summary) => {
        if (active) {
          setReportState({ key: queryKey, data: summary, error: '' })
        }
      },
      (cause: unknown) => {
        if (active) {
          setReportState({ key: queryKey, data: null, error: apiError(cause) })
        }
      },
    )
    return () => { active = false }
  }, [query, queryKey])

  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!from || !to || from > to) {
      setValidationError('Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.')
      return
    }
    setValidationError('')
    setQuery({ from, to })
  }

  return (
    <section className="m1-card m1-section-card">
      <div className="m1-section-header"><h2>Khối lượng công việc đã ghi nhận</h2></div>
      <div className="m1-section-body">
        <form className="m2-editor" onSubmit={apply}>
          <label>Từ ngày (giờ Việt Nam)
            <input type="date" required value={from} onChange={(event) => setFrom(event.target.value)} />
          </label>
          <label>Đến ngày, bao gồm cả ngày này
            <input type="date" required value={to} onChange={(event) => setTo(event.target.value)} />
          </label>
          <button type="submit">Áp dụng</button>
        </form>
        {loading && <p role="status">Đang tải báo cáo…</p>}
        {error && <p role="alert" className="m1-error">{error}</p>}
        {!loading && !error && data && (
          <>
            <p>Từ {new Date(data.from).toLocaleDateString('vi-VN', {timeZone:'Asia/Ho_Chi_Minh'})} đến {new Date(new Date(data.to).getTime() - 1).toLocaleDateString('vi-VN', {timeZone:'Asia/Ho_Chi_Minh'})} · Giờ Việt Nam (UTC+7).</p>
            <div className="m1-summary-strip">
              <div><strong>{data.createdCount}</strong><span>WO được tạo trong kỳ</span></div>
              <div><strong>{data.completedCount}</strong><span>WO hoàn tất trong kỳ</span></div>
              <div><strong>{data.createdByStatus.COMPLETED}</strong><span>Đã hoàn tất trong nhóm được tạo kỳ này</span></div>
              <div><strong>{data.createdByStatus.CANCELLED}</strong><span>Đã hủy trong nhóm được tạo kỳ này</span></div>
            </div>
            <h3>Trạng thái hiện tại của nhóm Work Order được tạo trong kỳ</h3>
            <ul className="m2-linked-list">
              {statuses.map((status) => (
                <li key={status}><strong>{statusNames[status]}</strong><span className="sd-report-bar"><meter min={0} max={Math.max(1,data.createdCount)} value={data.createdByStatus[status]} aria-label={statusNames[status]}/><b>{data.createdByStatus[status]}</b></span></li>
              ))}
            </ul>
            <p>WO hoàn tất trong kỳ là chỉ số độc lập; có thể bao gồm WO được tạo trước khoảng thời gian đang xem.</p>
          </>
        )}
      </div>
    </section>
  )
}

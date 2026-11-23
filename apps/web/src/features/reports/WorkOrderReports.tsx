import { statusNames } from '../workspace/workspace-data'
import TechnicianKpiVisuals from './TechnicianKpiVisuals'
import { useEffect, useState, type FormEvent } from 'react'
import { ApiError, api } from '../../api/client'
import { getSessionGeneration } from '../../auth/session'
import { useSession } from '../../auth/session'
import type { Page } from '../../types/domain'
import '../../routes/live-administration.css'
import './workorder-reports.css'

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
    <div className="m2-page workorder-reports">
      <h1>Báo cáo dịch vụ</h1>
      <p>Theo dõi khối lượng và trạng thái công việc theo khoảng thời gian. Số lệnh hoàn tất chưa thể hiện tỷ lệ sửa chữa thành công hoặc mức hài lòng của khách hàng.</p>
      <WorkOrderSummaryPanel />
      <TechnicianKpiPanel />
    </div>
  )
}

type TechnicianKpi = {
  technicianId: string
  employeeCode: string
  fullName: string | null
  branchId: string
  branchName: string | null
  branchCode: string | null
  completedCount: number
  resolvedRepairCount: number
  eligibleRepairCount: number
  repairSuccessRate: number | null
  onTimeCount: number
  scheduledCount: number
  onTimeRate: number | null
  averageMttrHours?: number | null
  firstTimeFixRate?: number | null
}
type KpiReport = {
  from: string
  to: string
  timezone: 'Asia/Ho_Chi_Minh'
  items: TechnicianKpi[]
  summary: {
    totalTechnicians: number
    totalCompletedCount: number
    overallRepairSuccessRate: number | null
    overallOnTimeRate: number | null
    overallMttrHours?: number | null
    overallFirstTimeFixRate?: number | null
  }
}
type Branch = { id: string; code: string; name: string }

function rate(value: number | null) {
  return value === null ? 'Chưa đủ dữ liệu' : `${(value * 100).toLocaleString('vi-VN', { maximumFractionDigits: 2 })}%`
}

export function TechnicianKpiPanel() {
  const { profile } = useSession()
  const canFilterBranch = profile?.roles.includes('TENANT_ADMIN') ?? false
  const sessionGeneration = getSessionGeneration()
  const initial = useCurrentMonth()
  const [from, setFrom] = useState(initial.from)
  const [to, setTo] = useState(initial.to)
  const [branchId, setBranchId] = useState('')
  const [branchSearch, setBranchSearch] = useState('')
  const [branches, setBranches] = useState<Branch[]>([])
  const [branchError, setBranchError] = useState('')
  const [query, setQuery] = useState({ from: initial.from, to: initial.to, branchId: '' })
  const [state, setState] = useState<{ key: string; data: KpiReport | null; error: string }>({ key: '', data: null, error: '' })
  const [validationError, setValidationError] = useState('')
  const key = `${query.from}:${query.to}:${query.branchId}:session-${sessionGeneration}`
  const loading = state.key !== key

  useEffect(() => {
    if (!canFilterBranch) return
    let active = true
    const search = new URLSearchParams({ pageSize: '100', status: 'ACTIVE', q: branchSearch })
    api.organization<Page<Branch>>(`/branches?${search}`).then(
      page => { if (active) { setBranches(page.items); setBranchError(page.total > 100 ? 'Chỉ hiển thị 100 chi nhánh. Tìm theo tên hoặc mã để lọc.' : '') } },
      cause => { if (active) { setBranches([]); setBranchError(apiError(cause)) } },
    )
    return () => { active = false }
  }, [canFilterBranch, branchSearch, sessionGeneration])

  useEffect(() => {
    let active = true
    const search = new URLSearchParams({
      from: `${query.from}T00:00:00+07:00`,
      to: `${addDay(query.to)}T00:00:00+07:00`,
    })
    if (canFilterBranch && query.branchId) search.set('branchId', query.branchId)
    api.workorders<KpiReport>(`/reports/technicians?${search}`).then(
      data => { if (active) setState({ key, data, error: '' }) },
      cause => { if (active) setState({ key, data: null, error: apiError(cause) }) },
    )
    return () => { active = false }
  }, [query, key, canFilterBranch])

  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!from || !to || from > to) { setValidationError('Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.'); return }
    setValidationError('')
    setQuery({ from, to, branchId: canFilterBranch ? branchId : '' })
  }

  return <section className="m1-card m1-section-card technician-kpi">
    <div className="m1-section-header"><h2>KPI kỹ thuật viên</h2></div>
    <div className="m1-section-body">
      <p>Đếm theo ngày hoàn tất Work Order, giờ Việt Nam. Tỷ lệ sửa thành công chỉ tính lệnh sửa có kết quả kỹ thuật; tỷ lệ đúng hạn chỉ tính lệnh có lịch kết thúc.</p>
      <form className="m2-editor technician-kpi-filters" onSubmit={apply}>
        <label>Từ ngày<input type="date" required value={from} onChange={e => setFrom(e.target.value)} /></label>
        <label>Đến ngày (bao gồm)<input type="date" required value={to} onChange={e => setTo(e.target.value)} /></label>
        {canFilterBranch && <>
          <label>Tìm chi nhánh<input value={branchSearch} onChange={e => setBranchSearch(e.target.value)} /></label>
          <label>Chi nhánh<select value={branchId} onChange={e => setBranchId(e.target.value)} disabled={!!branchError && branches.length === 0}>
            <option value="">Tất cả chi nhánh được phép</option>
            {branchId && !branches.some(branch => branch.id === branchId) && <option value={branchId}>Chi nhánh đang chọn</option>}
            {branches.map(branch => <option key={branch.id} value={branch.id}>{branch.code} · {branch.name}</option>)}
          </select></label>
          {branchError && <p role="alert">{branchError}</p>}
        </>}
        <button type="submit">Áp dụng</button>
      </form>
      {validationError && <p role="alert" className="m1-error">{validationError}</p>}
      {loading && <p role="status">Đang tải KPI.</p>}
      {!loading && state.error && <p role="alert" className="m1-error">{state.error}</p>}
      {!loading && state.data && <>
        <div className="technician-kpi-summary" aria-label="Tổng quan KPI">
          <div><strong>{state.data.summary.totalTechnicians}</strong><span>Kỹ thuật viên</span></div>
          <div><strong>{state.data.summary.totalCompletedCount}</strong><span>Lệnh hoàn tất</span></div>
          <div><strong>{rate(state.data.summary.overallRepairSuccessRate)}</strong><span>Sửa thành công</span></div>
          <div><strong>{rate(state.data.summary.overallOnTimeRate)}</strong><span>Đúng hạn</span></div>
          <div><strong>{state.data.summary.overallMttrHours == null ? 'Chưa đủ dữ liệu' : `${state.data.summary.overallMttrHours} giờ`}</strong><span>MTTR · Thời gian xử lý trung bình</span></div>
          <div><strong>{state.data.summary.overallFirstTimeFixRate == null ? 'Chưa đủ dữ liệu' : rate(state.data.summary.overallFirstTimeFixRate)}</strong><span>FTFR · Sửa dứt điểm lần đầu</span></div>
        </div>
        {!!state.data.items.length && <TechnicianKpiVisuals key={key} items={state.data.items} from={`${query.from}T00:00:00+07:00`} to={`${addDay(query.to)}T00:00:00+07:00`}/>}
        {state.data.items.length === 0 && <p>Không có kết quả trong khoảng ngày đã chọn.</p>}
      </>}
    </div>
  </section>
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
    <section className="m1-card m1-section-card workorder-summary-panel">
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
            <p className="workorder-summary-range">Từ {new Date(data.from).toLocaleDateString('vi-VN', {timeZone:'Asia/Ho_Chi_Minh'})} đến {new Date(new Date(data.to).getTime() - 1).toLocaleDateString('vi-VN', {timeZone:'Asia/Ho_Chi_Minh'})} · Giờ Việt Nam (UTC+7).</p>
            <div className="technician-kpi-summary" aria-label="Tổng quan lệnh công việc">
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

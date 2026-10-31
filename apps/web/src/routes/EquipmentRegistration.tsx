import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { api, ApiError } from '../api/client'
import { getSessionGeneration, useSession } from '../auth/session'
import type { Page } from '../types/domain'
import {
  DirectoryPicker,
  LoadState,
  QuickForm,
  type QuickKind,
  SetupPage,
} from './registration-shared'
import { type DirectoryRow, errorText, useDirectory } from './registration-data'
import QRCode from 'qrcode'
import './equipment-registration.css'

type Choice = {
  mode: 'UNCONFIRMED' | 'CREATE' | 'KEEP' | 'NONE'
  reason?: string
  warrantyId?: string
  planId?: string
  startDate?: string
  endDate?: string
  warrantyType?: string
  terms?: string
  name?: string
  description?: string
  frequencyUnit?: string
  frequencyValue?: number
  nextDueDate?: string
}
type Registration = {
  id: string
  equipmentId: string
  status: 'DRAFT' | 'PENDING_MAINTENANCE' | 'COMPLETED'
  version: number
  warranty: Choice
  maintenance: Choice
  warrantyId: string | null
  maintenancePlanId: string | null
  allowedActions: string[]
  lastErrorCode: string | null
  completedAt: string | null
}
type Equipment = {
  id: string
  customerId: string
  customerSiteId: string
  locationId: string | null
  modelId: string
  assetCode: string
  serialNumber: string
  displayName: string | null
  handoverDate: string | null
  installationDate: string | null
  commissionedDate: string | null
  registrationId?: string | null
  registrationStatus?: string
  status: string
}
type PolicyRow = {
  id: string
  name?: string
  startDate?: string
  endDate?: string
  status: string
  nextDueDate?: string
  frequencyUnit?: string
  frequencyValue?: number
}
type FormState = {
  customerId: string
  siteId: string
  locationId: string
  source: 'NEW' | 'EXISTING'
  equipmentId: string
  modelId: string
  assetCode: string
  serialNumber: string
  displayName: string
  handoverDate: string
  installationDate: string
  commissionedDate: string
  warranty: Choice
  maintenance: Choice
}
const unknownChoice = (): Choice => ({ mode: 'UNCONFIRMED' })
const statusNames = {
  NOT_RECORDED: 'Chưa ghi nhận thiết lập',
  DRAFT: 'Hồ sơ chưa hoàn tất',
  PENDING_MAINTENANCE: 'Chờ xác nhận bảo trì',
  COMPLETED: 'Đã hoàn tất thiết lập',
}
function formEquipment(eq: Equipment) {
  return {
    customerId: eq.customerId,
    siteId: eq.customerSiteId,
    locationId: eq.locationId || '',
    source: 'EXISTING' as const,
    equipmentId: eq.id,
    modelId: eq.modelId,
    assetCode: eq.assetCode,
    serialNumber: eq.serialNumber,
    displayName: eq.displayName || '',
    handoverDate: eq.handoverDate || '',
    installationDate: eq.installationDate || '',
    commissionedDate: eq.commissionedDate || '',
  }
}
const today = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(
    new Date(),
  )

export function RegistrationListPage() {
  const [status, setStatus] = useState(''),
    [page, setPage] = useState(1)
  const state = useDirectory<Page<Registration>>(
    'assetM2',
    `/equipment-registrations?page=${page}&pageSize=20${status ? `&status=${status}` : ''}`,
  )
  return (
    <SetupPage
      title="Hồ sơ ghi nhận bàn giao"
      description="Tiếp tục các hồ sơ đã lưu và kiểm tra kết quả thiết lập dịch vụ."
      actions={
        <Link className="m1-button" to="/app/equipment-registrations/new">
          + Ghi nhận bàn giao
        </Link>
      }
    >
      <section className="m1-card">
        <label>
          Trạng thái
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value)
              setPage(1)
            }}
          >
            <option value="">Tất cả</option>
            {(['DRAFT', 'PENDING_MAINTENANCE', 'COMPLETED'] as const).map(
              (s) => (
                <option key={s} value={s}>
                  {statusNames[s]}
                </option>
              ),
            )}
          </select>
        </label>
        <LoadState {...state} />
        {state.value && (
          <>
            <table>
              <thead>
                <tr>
                  <th>Hồ sơ</th>
                  <th>Trạng thái</th>
                  <th>Kết quả</th>
                </tr>
              </thead>
              <tbody>
                {state.value.items.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <Link to={`/app/equipment-registrations/${row.id}`}>
                        Mở hồ sơ · {row.id.slice(0, 8)}
                      </Link>
                    </td>
                    <td>{statusNames[row.status]}</td>
                    <td>
                      <Link to={`/app/equipment/${row.equipmentId}`}>
                        Thiết bị
                      </Link>
                      {row.lastErrorCode && (
                        <small>Cần kiểm tra bước bảo trì</small>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!state.value.items.length && <p>Chưa có hồ sơ phù hợp.</p>}
            <div className="registration-pagination">
              <span>{state.value.total} hồ sơ</span>
              <button disabled={page === 1} onClick={() => setPage(page - 1)}>
                Trước
              </button>
              <button
                disabled={page * 20 >= state.value.total}
                onClick={() => setPage(page + 1)}
              >
                Sau
              </button>
            </div>
          </>
        )}
      </section>
    </SetupPage>
  )
}

export function EquipmentRegistrationPage() {
  const { id } = useParams(),
    navigate = useNavigate(),
    location = useLocation(),
    { profile } = useSession()
  const query = new URLSearchParams(location.search)
  const [form, setForm] = useState<FormState>(() => ({
    customerId: query.get('customerId') || '',
    siteId: query.get('siteId') || '',
    locationId: '',
    source: query.has('equipmentId') ? 'EXISTING' : 'NEW',
    equipmentId: query.get('equipmentId') || '',
    modelId: '',
    assetCode: '',
    serialNumber: '',
    displayName: '',
    handoverDate: '',
    installationDate: '',
    commissionedDate: '',
    warranty: unknownChoice(),
    maintenance: unknownChoice(),
  }))
  const [record, setRecord] = useState<Registration | null>(null),
    [step, setStep] = useState(0),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(Boolean(id || query.has('equipmentId'))),
    [revision, setRevision] = useState(0),
    [quick, setQuick] = useState<QuickKind | null>(null),
    [uncertain, setUncertain] = useState(false),
    [qr, setQr] = useState<{ url: string } | null>(null),
    [datesDirty, setDatesDirty] = useState(false),
    [qrImage, setQrImage] = useState(''),
    [planPage, setPlanPage] = useState(1),
    [needsReload, setNeedsReload] = useState(false)
  const pending = useRef<{ key: string; body: unknown } | null>(null),
    selectedSequence = useRef(0)
  const markerKey = `pbl6.registration.${window.location.origin}.${profile?.tenantId}.${profile?.id}`
  const canMaintain = profile?.roles.includes('SERVICE_MANAGER') === true
  const frozen =
    record?.status === 'PENDING_MAINTENANCE' ||
    record?.status === 'COMPLETED' ||
    uncertain ||
    needsReload
  const sites = useDirectory<DirectoryRow[]>(
    'organization',
    form.customerId ? `/customers/${form.customerId}/sites` : null,
    revision,
  )
  const customer = useDirectory<DirectoryRow>(
    'organization',
    form.customerId ? `/customers/${form.customerId}` : null,
    revision,
  )
  const locations = useDirectory<DirectoryRow[]>(
    'organization',
    form.siteId ? `/sites/${form.siteId}/locations` : null,
    revision,
  )
  const contacts = useDirectory<DirectoryRow[]>(
    'organization',
    form.customerId ? `/customers/${form.customerId}/contacts` : null,
    revision,
  )
  const currentEquipmentId =
    record?.equipmentId || (form.source === 'EXISTING' ? form.equipmentId : '')
  const warranties = useDirectory<PolicyRow[]>(
    'assetM2',
    currentEquipmentId ? `/equipment/${currentEquipmentId}/warranties` : null,
    revision,
  )
  const plans = useDirectory<Page<PolicyRow>>(
    'maintenance',
    currentEquipmentId
      ? `/maintenance-plans?equipmentId=${currentEquipmentId}&pageSize=20&page=${planPage}`
      : null,
    revision,
  )
  const field = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }))
  const policy = (kind: 'warranty' | 'maintenance', patch: Partial<Choice>) =>
    setForm((prev) => ({ ...prev, [kind]: { ...prev[kind], ...patch } }))
  useEffect(() => {
    let active = true
    const initialEquipment = new URLSearchParams(location.search).get(
      'equipmentId',
    )
    if (id)
      api
        .assetM2<Registration>(`/equipment-registrations/${id}`)
        .then(async (row) => ({
          row,
          eq: await api.assetM2<Equipment>(`/equipment/${row.equipmentId}`),
        }))
        .then(
          ({ row, eq }) => {
            if (active) {
              setRecord(row)
              setForm((prev) => ({
                ...prev,
                ...formEquipment(eq),
                warranty: row.warranty,
                maintenance: row.maintenance,
              }))
              setLoading(false)
              setUncertain(false)
              setNeedsReload(false)
              setStep(row.status === 'DRAFT' ? 0 : 4)
            }
          },
          (e) => {
            if (active) {
              setError(errorText(e))
              setLoading(false)
            }
          },
        )
    else if (initialEquipment)
      api.assetM2<Equipment>(`/equipment/${initialEquipment}`).then(
        (eq) => {
          if (active) {
            if (eq.registrationId)
              navigate(`/app/equipment-registrations/${eq.registrationId}`, {
                replace: true,
              })
            else setForm((prev) => ({ ...prev, ...formEquipment(eq) }))
            setLoading(false)
          }
        },
        (e) => {
          if (active) {
            setError(errorText(e))
            setLoading(false)
          }
        },
      )
    else {
      const marker = sessionStorage.getItem(markerKey)
      if (marker) {
        try {
          const saved = JSON.parse(marker) as { key: string; id?: string }
          if (saved.id)
            navigate(`/app/equipment-registrations/${saved.id}`, {
              replace: true,
            })
          else
            Promise.resolve().then(() => {
              if (active) setUncertain(true)
            })
        } catch {
          sessionStorage.removeItem(markerKey)
        }
      }
    }
    return () => {
      active = false
    }
  }, [id, location.search, markerKey, navigate])

  async function selectExisting(equipmentId: string) {
    const sequence = ++selectedSequence.current
    field('equipmentId', equipmentId)
    setError('')
    if (!equipmentId) return
    setBusy(true)
    try {
      const eq = await api.assetM2<Equipment>(`/equipment/${equipmentId}`)
      if (sequence !== selectedSequence.current) return
      if (eq.registrationId)
        navigate(`/app/equipment-registrations/${eq.registrationId}`)
      else
        setForm((prev) => ({
          ...prev,
          ...formEquipment(eq),
          warranty: unknownChoice(),
          maintenance: unknownChoice(),
        }))
    } catch (e) {
      setError(errorText(e))
    } finally {
      if (sequence === selectedSequence.current) setBusy(false)
    }
  }
  function validation(part: number, final = false) {
    if (part === 0 && (!form.customerId || !form.siteId))
      return 'Chọn khách hàng và địa điểm đặt thiết bị.'
    if (part === 1) {
      if (datesDirty)
        return 'Lưu các ngày thực tế vừa chỉnh trước khi tiếp tục.'
      if (
        form.source === 'NEW' &&
        (!form.modelId || !form.assetCode.trim() || !form.serialNumber.trim())
      )
        return 'Chọn model, nhập mã thiết bị và serial.'
      if (form.source === 'EXISTING' && !form.equipmentId)
        return 'Chọn máy cần hoàn thiện hồ sơ.'
      if (final && !form.handoverDate)
        return 'Ghi ngày bàn giao thực tế trước khi hoàn tất.'
      if (
        [form.handoverDate, form.installationDate, form.commissionedDate].some(
          (date) => date && date > today(),
        )
      )
        return 'Ngày thực tế của thiết bị không được ở tương lai.'
    }
    const choice = part === 2 ? form.warranty : form.maintenance
    if (part >= 2 && part <= 3) {
      if (final && choice.mode === 'UNCONFIRMED')
        return 'Xác nhận bảo hành và bảo trì trước khi hoàn tất.'
      if (choice.mode === 'NONE' && !choice.reason?.trim())
        return 'Nhập lý do không áp dụng.'
      if (
        choice.mode === 'KEEP' &&
        !(part === 2 ? choice.warrantyId : choice.planId)
      )
        return 'Chọn bản ghi hiện có để giữ lại.'
      if (
        choice.mode === 'CREATE' &&
        part === 2 &&
        (!choice.startDate ||
          !choice.endDate ||
          choice.endDate < choice.startDate ||
          !choice.warrantyType?.trim())
      )
        return 'Nhập đầy đủ loại và khoảng bảo hành hợp lệ.'
      if (
        choice.mode === 'CREATE' &&
        part === 3 &&
        (!choice.name?.trim() ||
          !choice.nextDueDate ||
          !Number.isInteger(choice.frequencyValue) ||
          choice.frequencyValue! < 1)
      )
        return 'Nhập tên kế hoạch, chu kỳ và kỳ đầu hợp lệ.'
    }
    return ''
  }
  async function recover() {
    setBusy(true)
    setError('')
    try {
      const marker = JSON.parse(sessionStorage.getItem(markerKey) || '{}') as {
        key?: string
        id?: string
      }
      if (marker.id) {
        navigate(`/app/equipment-registrations/${marker.id}`, { replace: true })
        return
      }
      if (!marker.key)
        throw new Error(
          'Không có mã đối soát. Mở danh sách hồ sơ và tìm thiết bị theo mã/serial.',
        )
      const rows = await api.assetM2<Page<Registration>>(
        `/equipment-registrations?createKey=${marker.key}`,
      )
      if (rows.items[0]) {
        sessionStorage.setItem(
          markerKey,
          JSON.stringify({ key: marker.key, id: rows.items[0].id }),
        )
        navigate(`/app/equipment-registrations/${rows.items[0].id}`, {
          replace: true,
        })
      } else if (pending.current) await persist(false, true)
      else
        setError(
          'Chưa tìm thấy kết quả. Không tự gửi một hồ sơ khác. Kiểm tra lại sau hoặc mở danh sách thiết bị để đối soát.',
        )
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }
  async function persist(complete: boolean, retry = false) {
    if (busy && !retry) return
    const operationGeneration = getSessionGeneration()
    if (!retry)
      for (let part = 0; part < 4; part++) {
        const issue = validation(part, complete)
        if (issue) {
          setStep(part)
          setError(issue)
          return
        }
      }
    setBusy(true)
    setError('')
    let saved = record
    try {
      if (!saved) {
        if (!pending.current) {
          const equipment =
            form.source === 'EXISTING'
              ? { mode: 'EXISTING', id: form.equipmentId }
              : {
                  mode: 'NEW',
                  data: {
                    customerId: form.customerId,
                    customerSiteId: form.siteId,
                    ...(form.locationId ? { locationId: form.locationId } : {}),
                    modelId: form.modelId,
                    assetCode: form.assetCode.trim(),
                    serialNumber: form.serialNumber.trim(),
                    ...(form.displayName.trim()
                      ? { displayName: form.displayName.trim() }
                      : {}),
                    ...(form.handoverDate
                      ? { handoverDate: form.handoverDate }
                      : {}),
                    ...(form.installationDate
                      ? { installationDate: form.installationDate }
                      : {}),
                    ...(form.commissionedDate
                      ? { commissionedDate: form.commissionedDate }
                      : {}),
                  },
                }
          pending.current = {
            key: crypto.randomUUID(),
            body: {
              equipment,
              warranty: form.warranty,
              maintenance: form.maintenance,
            },
          }
        }
        sessionStorage.setItem(
          markerKey,
          JSON.stringify({ key: pending.current.key }),
        )
        saved = await api.assetM2<Registration>('/equipment-registrations', {
          method: 'POST',
          body: pending.current.body,
          headers: { 'Idempotency-Key': pending.current.key },
        })
        if (getSessionGeneration() !== operationGeneration) return
        sessionStorage.setItem(
          markerKey,
          JSON.stringify({ key: pending.current.key, id: saved.id }),
        )
        pending.current = null
      } else if (saved.status === 'DRAFT')
        saved = await api.assetM2<Registration>(
          `/equipment-registrations/${saved.id}`,
          {
            method: 'PATCH',
            body: {
              expectedVersion: saved.version,
              warranty: form.warranty,
              ...(canMaintain ? { maintenance: form.maintenance } : {}),
            },
          },
        )
      if (getSessionGeneration() !== operationGeneration) return
      setRecord(saved)
      setUncertain(false)
      if (complete && saved.status === 'DRAFT')
        saved = await api.assetM2<Registration>(
          `/equipment-registrations/${saved.id}/submit`,
          { method: 'POST', body: { expectedVersion: saved.version } },
        )
      if (getSessionGeneration() !== operationGeneration) return
      setRecord(saved)
      setStep(4)
      setRevision((v) => v + 1)
      sessionStorage.removeItem(markerKey)
      navigate(`/app/equipment-registrations/${saved.id}`, { replace: true })
    } catch (e) {
      if (getSessionGeneration() !== operationGeneration) return
      setError(errorText(e))
      if (
        e instanceof ApiError &&
        e.code === 'REGISTRATION_ALREADY_EXISTS' &&
        typeof e.details?.registrationId === 'string'
      ) {
        pending.current = null
        sessionStorage.removeItem(markerKey)
        navigate(`/app/equipment-registrations/${e.details.registrationId}`, {
          replace: true,
        })
      } else if (
        !saved &&
        (!(e instanceof ApiError) ||
          e.status >= 500 ||
          e.status === 401 ||
          e.code === 'IDEMPOTENCY_KEY_REUSED')
      )
        setUncertain(true)
      else if (!saved) {
        pending.current = null
        sessionStorage.removeItem(markerKey)
      } else {
        if (getSessionGeneration() !== operationGeneration) return
        setRecord(saved)
        navigate(`/app/equipment-registrations/${saved.id}`, { replace: true })
        if (
          !(e instanceof ApiError) ||
          e.status >= 500 ||
          e.status === 401 ||
          [
            'REGISTRATION_VERSION_CONFLICT',
            'REGISTRATION_INPUT_FROZEN',
          ].includes(e.code)
        )
          setNeedsReload(true)
      }
    } finally {
      setBusy(false)
    }
  }
  async function reloadStored() {
    if (!record || busy) return
    setBusy(true)
    try {
      const row = await api.assetM2<Registration>(
        `/equipment-registrations/${record.id}`,
      )
      const eq = await api.assetM2<Equipment>(`/equipment/${row.equipmentId}`)
      setRecord(row)
      setForm((prev) => ({
        ...prev,
        ...formEquipment(eq),
        warranty: row.warranty,
        maintenance: row.maintenance,
      }))
      setNeedsReload(false)
      setDatesDirty(false)
      setError('')
      setStep(row.status === 'DRAFT' ? step : 4)
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }
  async function resume() {
    if (!record || busy) return
    setBusy(true)
    setError('')
    try {
      const next = await api.assetM2<Registration>(
        `/equipment-registrations/${record.id}/resume`,
        { method: 'POST' },
      )
      setRecord(next)
      setRevision((v) => v + 1)
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }
  const dirty =
    !frozen &&
    (record
      ? JSON.stringify([form.warranty, form.maintenance]) !==
        JSON.stringify([record.warranty, record.maintenance])
      : Boolean(
          form.assetCode ||
          form.serialNumber ||
          form.warranty.mode !== 'UNCONFIRMED' ||
          form.maintenance.mode !== 'UNCONFIRMED',
        ))
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty || busy || datesDirty) e.preventDefault()
    }
    const leave = (e: MouseEvent) => {
      const anchor = (e.target as Element)?.closest?.('a')
      if (
        !anchor ||
        anchor.target === '_blank' ||
        anchor.hasAttribute('download')
      )
        return
      const url = new URL(anchor.href)
      if (
        url.pathname === window.location.pathname &&
        url.search === window.location.search
      )
        return
      if (
        busy ||
        ((dirty || datesDirty) &&
          !window.confirm('Thông tin chưa lưu sẽ mất. Rời biểu mẫu?'))
      ) {
        e.preventDefault()
        e.stopImmediatePropagation()
      }
    }
    window.addEventListener('beforeunload', warn)
    document.addEventListener('click', leave, true)
    return () => {
      window.removeEventListener('beforeunload', warn)
      document.removeEventListener('click', leave, true)
    }
  }, [dirty, busy, datesDirty])
  function choiceSelect(kind: 'warranty' | 'maintenance') {
    const choice = form[kind]
    return (
      <label>
        {kind === 'warranty' ? 'Cách áp dụng bảo hành' : 'Kế hoạch bảo trì'}
        <select
          aria-label={
            kind === 'warranty' ? 'Cách áp dụng bảo hành' : 'Kế hoạch bảo trì'
          }
          value={choice.mode}
          disabled={frozen || busy || (kind === 'maintenance' && !canMaintain)}
          onChange={(e) => {
            const mode = e.target.value as Choice['mode']
            field(
              kind,
              mode === 'CREATE'
                ? kind === 'warranty'
                  ? {
                      mode,
                      warrantyType: 'STANDARD',
                      startDate: form.handoverDate,
                      endDate: '',
                      terms: '',
                    }
                  : {
                      mode,
                      name: `Bảo trì ${form.displayName || form.assetCode}`,
                      frequencyUnit: 'MONTH',
                      frequencyValue: 3,
                      nextDueDate: '',
                      description: '',
                    }
                : { mode },
            )
          }}
        >
          <option value="UNCONFIRMED">Chưa xác định</option>
          <option value="CREATE">
            {kind === 'warranty'
              ? 'Có điều khoản bảo hành'
              : 'Tạo kế hoạch định kỳ'}
          </option>
          {currentEquipmentId && (
            <option value="KEEP">Giữ bản ghi hiện có</option>
          )}
          <option value="NONE">
            {kind === 'warranty'
              ? 'Không áp dụng bảo hành'
              : 'Không thiết lập bảo trì định kỳ'}
          </option>
        </select>
      </label>
    )
  }
  const quickPath =
    quick === 'customer'
      ? '/customers'
      : quick === 'model'
        ? '/equipment-models'
        : quick === 'site'
          ? `/customers/${form.customerId}/sites`
          : quick === 'contact'
            ? `/customers/${form.customerId}/contacts`
            : `/sites/${form.siteId}/locations`
  function quickSaved(row: DirectoryRow) {
    if (quick === 'customer')
      setForm((prev) => ({
        ...prev,
        customerId: row.id,
        siteId: '',
        locationId: '',
        equipmentId: '',
        source: 'NEW',
      }))
    if (quick === 'site')
      setForm((prev) => ({ ...prev, siteId: row.id, locationId: '' }))
    if (quick === 'model') field('modelId', row.id)
    if (quick === 'location') field('locationId', row.id)
    setQuick(null)
    setRevision((v) => v + 1)
  }
  return (
    <SetupPage
      title="Ghi nhận thiết bị đã bàn giao"
      description="Khách hàng → máy cụ thể → bảo hành → bảo trì. Mỗi máy có một hồ sơ dịch vụ riêng."
      actions={
        <Link
          to="/app/equipment-registrations"
          onClick={(e) => {
            if (busy) e.preventDefault()
          }}
        >
          Danh sách hồ sơ
        </Link>
      }
    >
      <LoadState loading={loading} error={error} />
      {needsReload && (
        <section className="registration-notice">
          <p>
            Cần đọc lại kết quả đã lưu trước khi gửi tiếp. Các lựa chọn đang
            hiển thị chưa được dùng để ghi đè phiên bản mới.
          </p>
          <button disabled={busy} onClick={() => void reloadStored()}>
            Tải bản đã lưu, bỏ chỉnh sửa chưa lưu
          </button>
        </section>
      )}
      {!loading && (
        <>
          {uncertain && (
            <section className="registration-notice">
              <h2>Chưa xác định kết quả lưu</h2>
              <p>
                Biểu mẫu đang khóa để tránh tạo máy trùng. Kiểm tra kết quả bằng
                mã yêu cầu đã gửi.
              </p>
              <button disabled={busy} onClick={() => void recover()}>
                Kiểm tra / thử lại cùng yêu cầu
              </button>
            </section>
          )}
          {record && (
            <section
              className={`registration-notice ${record.status === 'COMPLETED' ? 'registration-success' : ''}`}
            >
              <strong>{statusNames[record.status]}</strong>
              {record.status === 'DRAFT' && (
                <p>
                  Thiết bị đã được lưu. Chính sách sẽ được áp dụng khi hoàn tất;
                  có thể đóng và tiếp tục hồ sơ này sau.
                </p>
              )}
              {record.status === 'PENDING_MAINTENANCE' && (
                <>
                  <p>
                    Thiết bị và bảo hành đã lưu; bảo trì chưa được xác nhận.
                    Không tạo máy hoặc kế hoạch khác để thử lại.
                  </p>
                  {record.lastErrorCode && (
                    <p>Mã kiểm tra: {record.lastErrorCode}</p>
                  )}
                  {record.allowedActions.includes('resume') && (
                    <button disabled={busy} onClick={() => void resume()}>
                      {busy ? 'Đang kiểm tra…' : 'Kiểm tra và tiếp tục'}
                    </button>
                  )}
                </>
              )}
              {record.status === 'COMPLETED' && (
                <>
                  <p>
                    Đã xác nhận các lựa chọn thiết lập. Tình trạng bảo hành và
                    kế hoạch hiện hành được theo dõi trong hồ sơ.
                  </p>
                  <div className="registration-actions">
                    <Link
                      className="m1-button"
                      to={`/app/equipment/${record.equipmentId}`}
                    >
                      Mở hồ sơ thiết bị
                    </Link>
                    <button
                      disabled={busy || Boolean(qr)}
                      onClick={async () => {
                        setBusy(true)
                        setError('')
                        try {
                          if (
                            !window.confirm(
                              'Cấp mã QR cho thiết bị? Nếu đã có mã, mã cũ sẽ bị thu hồi.',
                            )
                          )
                            return
                          const result = await api.assetM2<{ url: string }>(
                            `/equipment/${record.equipmentId}/qr-codes`,
                            { method: 'POST' },
                          )
                          setQr(result)
                          setQrImage(
                            await QRCode.toDataURL(result.url, {
                              width: 300,
                              margin: 2,
                            }),
                          )
                        } catch (e) {
                          setError(errorText(e))
                        } finally {
                          setBusy(false)
                        }
                      }}
                    >
                      Tạo / cấp lại QR
                    </button>
                    <button
                      onClick={() => {
                        sessionStorage.removeItem(markerKey)
                        window.location.assign(
                          `/app/equipment-registrations/new?customerId=${form.customerId}&siteId=${form.siteId}`,
                        )
                      }}
                    >
                      Ghi nhận máy tiếp theo
                    </button>
                  </div>
                  {qr && (
                    <div className="registration-qr">
                      {qrImage && (
                        <>
                          <img
                            src={qrImage}
                            width={250}
                            height={250}
                            alt={`Mã QR thiết bị ${form.assetCode}`}
                          />
                          <p>
                            <a
                              href={qrImage}
                              download={`${form.assetCode}-QR.png`}
                            >
                              Tải mã QR
                            </a>{' '}
                            ·{' '}
                            <button onClick={() => window.print()}>
                              In mã QR
                            </button>
                          </p>
                        </>
                      )}
                      <p>
                        {form.assetCode} · {form.serialNumber}
                      </p>
                      <a href={qr.url}>Mở thiết bị bằng liên kết QR</a>
                    </div>
                  )}
                </>
              )}
            </section>
          )}
          <nav className="registration-steps" aria-label="Các bước bàn giao">
            {['Khách hàng', 'Thiết bị', 'Bảo hành', 'Bảo trì', 'Kiểm tra'].map(
              (name, index) => (
                <button
                  type="button"
                  key={name}
                  aria-current={step === index ? 'step' : undefined}
                  disabled={busy || (frozen && index !== 4)}
                  onClick={() => {
                    const issue = index > step ? validation(step) : ''
                    if (issue) setError(issue)
                    else {
                      setStep(index)
                      setError('')
                    }
                  }}
                >
                  {index + 1}. {name}
                </button>
              ),
            )}
          </nav>
          {quick && (
            <QuickForm
              key={`${quick}:${quickPath}`}
              kind={quick}
              path={quickPath}
              onSaved={quickSaved}
              onCancel={() => setQuick(null)}
            />
          )}
          <section className="m1-card registration-step" aria-busy={busy}>
            <fieldset
              className="registration-content"
              disabled={frozen || busy}
            >
              {step === 0 && (
                <>
                  <h2>Khách hàng và nơi đặt thiết bị</h2>
                  {!record ? (
                    <DirectoryPicker
                      label="Khách hàng"
                      area="organization"
                      path="/customers?status=ACTIVE"
                      selected={form.customerId}
                      onChange={(value) => {
                        selectedSequence.current++
                        setForm((prev) => ({
                          ...prev,
                          customerId: value,
                          siteId: '',
                          locationId: '',
                          equipmentId: '',
                          source: 'NEW',
                        }))
                      }}
                      onAdd={() => setQuick('customer')}
                      revision={revision}
                    />
                  ) : (
                    <p>
                      Khách hàng: {customer.value?.name || form.customerId}. Đổi
                      chủ sở hữu không thuộc luồng này.
                    </p>
                  )}
                  <LoadState {...customer} />
                  <div className="registration-fields">
                    <label>
                      Địa điểm đặt thiết bị *
                      <select
                        value={form.siteId}
                        disabled={
                          Boolean(record) ||
                          (form.source === 'EXISTING' &&
                            Boolean(form.equipmentId)) ||
                          busy ||
                          !form.customerId
                        }
                        onChange={(e) =>
                          setForm((prev) => ({
                            ...prev,
                            siteId: e.target.value,
                            locationId: '',
                          }))
                        }
                      >
                        <option value="">Chọn địa điểm</option>
                        {sites.value
                          ?.filter(
                            (row) =>
                              row.status === 'ACTIVE' || row.id === form.siteId,
                          )
                          .map((row) => (
                            <option value={row.id} key={row.id}>
                              {row.code} · {row.name} · {row.address}
                            </option>
                          ))}
                      </select>
                    </label>
                    {!record && (
                      <button
                        disabled={!form.customerId || busy}
                        onClick={() => setQuick('site')}
                      >
                        + Thêm địa điểm
                      </button>
                    )}
                    <LoadState {...sites} />
                    <label>
                      Vị trí chi tiết
                      <select
                        value={form.locationId}
                        disabled={
                          Boolean(record) ||
                          (form.source === 'EXISTING' &&
                            Boolean(form.equipmentId)) ||
                          busy ||
                          !form.siteId
                        }
                        onChange={(e) => field('locationId', e.target.value)}
                      >
                        <option value="">Không chỉ định</option>
                        {locations.value?.map((row) => (
                          <option value={row.id} key={row.id}>
                            {row.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    {!record && (
                      <button
                        disabled={!form.siteId || busy}
                        onClick={() => setQuick('location')}
                      >
                        + Thêm vị trí
                      </button>
                    )}
                    <LoadState {...locations} />
                  </div>
                  <h3>Người liên hệ</h3>
                  <LoadState {...contacts} />
                  {contacts.value?.map((row) => (
                    <p key={row.id}>
                      {row.name} ·{' '}
                      {row.email || row.phone || 'Chưa có thông tin liên lạc'}
                    </p>
                  ))}
                  <button
                    disabled={!form.customerId || busy}
                    onClick={() => setQuick('contact')}
                  >
                    + Thêm liên hệ khách hàng
                  </button>
                  <p>
                    Người liên hệ chưa phải tài khoản Customer Portal. Mời tài
                    khoản được thực hiện riêng theo quyền.
                  </p>
                </>
              )}
              {step === 1 && (
                <>
                  <h2>Máy cụ thể và model</h2>
                  {!record && (
                    <label>
                      Cách ghi nhận
                      <select
                        value={form.source}
                        onChange={(e) => {
                          selectedSequence.current++
                          setForm((prev) => ({
                            ...prev,
                            source: e.target.value as FormState['source'],
                            equipmentId: '',
                            modelId: '',
                            assetCode: '',
                            serialNumber: '',
                            warranty: unknownChoice(),
                            maintenance: unknownChoice(),
                          }))
                        }}
                      >
                        <option value="NEW">Ghi nhận máy mới</option>
                        <option value="EXISTING">
                          Hoàn thiện máy đã có của khách hàng
                        </option>
                      </select>
                    </label>
                  )}
                  {form.source === 'EXISTING' && !record && (
                    <DirectoryPicker
                      label="Máy đã có"
                      area="assetM2"
                      path={
                        form.customerId
                          ? `/equipment?customerId=${form.customerId}`
                          : null
                      }
                      selected={form.equipmentId}
                      onChange={(value) => void selectExisting(value)}
                    />
                  )}
                  {form.source === 'NEW' && !record && (
                    <DirectoryPicker
                      label="Model thiết bị"
                      area="assetM2"
                      path="/equipment-models?status=ACTIVE"
                      selected={form.modelId}
                      onChange={(value) => field('modelId', value)}
                      onAdd={() => setQuick('model')}
                      revision={revision}
                    />
                  )}
                  <div className="registration-fields">
                    {(
                      [
                        ['assetCode', 'Mã thiết bị *'],
                        ['serialNumber', 'Serial *'],
                        ['displayName', 'Tên hiển thị'],
                      ] as const
                    ).map(([key, label]) => (
                      <label key={key}>
                        {label}
                        <input
                          value={form[key]}
                          maxLength={
                            key === 'assetCode'
                              ? 100
                              : key === 'serialNumber'
                                ? 150
                                : 200
                          }
                          disabled={
                            Boolean(record) ||
                            form.source === 'EXISTING' ||
                            busy
                          }
                          onChange={(e) => field(key, e.target.value)}
                        />
                      </label>
                    ))}
                    {(
                      [
                        ['handoverDate', 'Ngày bàn giao thực tế'],
                        ['installationDate', 'Ngày lắp đặt'],
                        ['commissionedDate', 'Ngày đưa vào sử dụng'],
                      ] as const
                    ).map(([key, label]) => (
                      <label key={key}>
                        {label}
                        <input
                          type="date"
                          value={form[key]}
                          max={today()}
                          disabled={frozen || busy}
                          onChange={(e) => {
                            field(key, e.target.value)
                            if (record || form.source === 'EXISTING')
                              setDatesDirty(true)
                          }}
                        />
                      </label>
                    ))}
                  </div>
                  {currentEquipmentId && (
                    <button
                      type="button"
                      disabled={busy || frozen || !datesDirty}
                      onClick={async () => {
                        setBusy(true)
                        setError('')
                        try {
                          if (
                            !form.handoverDate ||
                            [
                              form.handoverDate,
                              form.installationDate,
                              form.commissionedDate,
                            ].some((d) => d && d > today())
                          )
                            throw new Error(
                              'Nhập ngày bàn giao và ngày thực tế hợp lệ.',
                            )
                          await api.assetM2(
                            `/equipment/${currentEquipmentId}`,
                            {
                              method: 'PATCH',
                              body: {
                                handoverDate: form.handoverDate,
                                installationDate: form.installationDate || null,
                                commissionedDate: form.commissionedDate || null,
                              },
                            },
                          )
                          setDatesDirty(false)
                          setRevision((v) => v + 1)
                        } catch (e) {
                          setError(errorText(e))
                        } finally {
                          setBusy(false)
                        }
                      }}
                    >
                      Lưu các ngày thực tế
                    </button>
                  )}
                  <p>
                    Một máy tương ứng một serial. Máy đã có giữ nguyên chủ sở
                    hữu. Chỉ sửa ngày thực tế khi cần đính chính hồ sơ.
                  </p>
                  {record && (
                    <p>
                      <Link to={`/app/equipment/${record.equipmentId}`}>
                        Mở hồ sơ
                      </Link>{' '}
                      để bổ sung ngày bàn giao hoặc chỉnh thông tin thiết bị,
                      sau đó tải lại lần ghi nhận này.
                    </p>
                  )}
                </>
              )}
              {step === 2 && (
                <>
                  <h2>Điều khoản bảo hành của máy</h2>
                  {choiceSelect('warranty')}
                  {form.warranty.mode === 'NONE' && (
                    <label>
                      Lý do không áp dụng *
                      <textarea
                        maxLength={2000}
                        value={form.warranty.reason || ''}
                        onChange={(e) =>
                          policy('warranty', { reason: e.target.value })
                        }
                      />
                    </label>
                  )}
                  {form.warranty.mode === 'KEEP' && (
                    <>
                      <LoadState {...warranties} />
                      <label>
                        Bảo hành đã ghi nhận
                        <select
                          value={form.warranty.warrantyId || ''}
                          onChange={(e) =>
                            policy('warranty', { warrantyId: e.target.value })
                          }
                        >
                          <option value="">Chọn bản ghi</option>
                          {warranties.value
                            ?.filter((row) => row.status === 'ACTIVE')
                            .map((row) => (
                              <option value={row.id} key={row.id}>
                                {row.startDate} → {row.endDate}
                              </option>
                            ))}
                        </select>
                      </label>
                    </>
                  )}
                  {form.warranty.mode === 'CREATE' && (
                    <div className="registration-fields">
                      <label>
                        Loại bảo hành
                        <input
                          maxLength={50}
                          value={form.warranty.warrantyType || ''}
                          onChange={(e) =>
                            policy('warranty', { warrantyType: e.target.value })
                          }
                        />
                      </label>
                      <label>
                        Bắt đầu
                        <input
                          type="date"
                          value={form.warranty.startDate || ''}
                          onChange={(e) =>
                            policy('warranty', { startDate: e.target.value })
                          }
                        />
                      </label>
                      <label>
                        Kết thúc, bao gồm ngày này
                        <input
                          type="date"
                          value={form.warranty.endDate || ''}
                          min={form.warranty.startDate}
                          onChange={(e) =>
                            policy('warranty', { endDate: e.target.value })
                          }
                        />
                      </label>
                      <label className="registration-wide">
                        Điều khoản hiển thị cho khách
                        <textarea
                          value={form.warranty.terms || ''}
                          onChange={(e) =>
                            policy('warranty', { terms: e.target.value })
                          }
                        />
                      </label>
                    </div>
                  )}
                  <p>
                    Ngày bảo hành theo điều khoản thực tế, không tính lại từ
                    ngày nhập hồ sơ. Xét duyệt từng yêu cầu dịch vụ vẫn được
                    thực hiện riêng.
                  </p>
                </>
              )}
              {step === 3 && (
                <>
                  <h2>Bảo trì định kỳ</h2>
                  {!canMaintain && (
                    <p className="registration-notice">
                      Cần Service Manager xác nhận bước này. Bạn có thể lưu hồ
                      sơ để hoàn thiện sau.
                    </p>
                  )}
                  <fieldset
                    className="registration-content"
                    disabled={!canMaintain}
                  >
                    {choiceSelect('maintenance')}
                    {form.maintenance.mode === 'NONE' && (
                      <label>
                        Lý do không lập định kỳ *
                        <textarea
                          disabled={!canMaintain || frozen || busy}
                          maxLength={2000}
                          value={form.maintenance.reason || ''}
                          onChange={(e) =>
                            policy('maintenance', { reason: e.target.value })
                          }
                        />
                      </label>
                    )}
                    {form.maintenance.mode === 'KEEP' && (
                      <>
                        <LoadState {...plans} />
                        <label>
                          Kế hoạch hiện có
                          <select
                            disabled={!canMaintain || frozen || busy}
                            value={form.maintenance.planId || ''}
                            onChange={(e) =>
                              policy('maintenance', { planId: e.target.value })
                            }
                          >
                            <option value="">Chọn kế hoạch</option>
                            {form.maintenance.planId &&
                              !plans.value?.items.some(
                                (row) => row.id === form.maintenance.planId,
                              ) && (
                                <option value={form.maintenance.planId}>
                                  Kế hoạch đã chọn · {form.maintenance.planId}
                                </option>
                              )}
                            {plans.value?.items.map((row) => (
                              <option value={row.id} key={row.id}>
                                {row.name} · {row.status} · kỳ tiếp theo{' '}
                                {row.nextDueDate}
                              </option>
                            ))}
                          </select>
                        </label>
                        {plans.value && (
                          <div className="registration-pagination">
                            <span>
                              Trang {planPage} · {plans.value.total} kế hoạch
                            </span>
                            <button
                              disabled={planPage === 1 || busy}
                              onClick={() => setPlanPage(planPage - 1)}
                            >
                              Trước
                            </button>
                            <button
                              disabled={
                                planPage * 20 >= plans.value.total || busy
                              }
                              onClick={() => setPlanPage(planPage + 1)}
                            >
                              Sau
                            </button>
                          </div>
                        )}
                      </>
                    )}
                    {form.maintenance.mode === 'CREATE' && (
                      <div className="registration-fields">
                        <label className="registration-wide">
                          Tên kế hoạch
                          <input
                            maxLength={200}
                            value={form.maintenance.name || ''}
                            onChange={(e) =>
                              policy('maintenance', { name: e.target.value })
                            }
                          />
                        </label>
                        <label>
                          Mỗi
                          <input
                            type="number"
                            min={1}
                            max={10000}
                            value={form.maintenance.frequencyValue || 1}
                            onChange={(e) =>
                              policy('maintenance', {
                                frequencyValue: Number(e.target.value),
                              })
                            }
                          />
                        </label>
                        <label>
                          Đơn vị
                          <select
                            value={form.maintenance.frequencyUnit || 'MONTH'}
                            onChange={(e) =>
                              policy('maintenance', {
                                frequencyUnit: e.target.value,
                              })
                            }
                          >
                            {[
                              ['DAY', 'Ngày'],
                              ['WEEK', 'Tuần'],
                              ['MONTH', 'Tháng'],
                              ['YEAR', 'Năm'],
                            ].map(([value, label]) => (
                              <option key={value} value={value}>
                                {label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Kỳ bảo trì đầu tiên
                          <input
                            type="date"
                            value={form.maintenance.nextDueDate || ''}
                            onChange={(e) =>
                              policy('maintenance', {
                                nextDueDate: e.target.value,
                              })
                            }
                          />
                        </label>
                        <label className="registration-wide">
                          Nội dung công việc
                          <textarea
                            maxLength={10000}
                            value={form.maintenance.description || ''}
                            onChange={(e) =>
                              policy('maintenance', {
                                description: e.target.value,
                              })
                            }
                          />
                        </label>
                      </div>
                    )}
                    {form.maintenance.mode === 'CREATE' &&
                      form.maintenance.nextDueDate &&
                      form.maintenance.nextDueDate <= today() && (
                        <p className="registration-notice">
                          Kỳ đầu đã đến hạn: scheduler có thể tạo công việc
                          ngay. Sau thời gian bỏ lỡ, hệ thống chỉ sinh kỳ gần
                          nhất đến hạn, không phục dựng mọi kỳ cũ.
                        </p>
                      )}
                  </fieldset>
                  <p>
                    Bảo trì không tự dừng khi hết bảo hành. Giữ Plan
                    PAUSED/INACTIVE không tự kích hoạt lại lịch.
                  </p>
                </>
              )}
              {step === 4 && (
                <>
                  <h2>Kiểm tra thông tin ghi nhận</h2>
                  <dl className="registration-summary">
                    <dt>Khách hàng</dt>
                    <dd>{customer.value?.name || form.customerId}</dd>
                    <dt>Địa điểm</dt>
                    <dd>
                      {sites.value?.find((row) => row.id === form.siteId)
                        ?.name || form.siteId}
                    </dd>
                    <dt>Máy</dt>
                    <dd>
                      {form.displayName || form.assetCode} · serial{' '}
                      {form.serialNumber}
                    </dd>
                    <dt>Bàn giao</dt>
                    <dd>{form.handoverDate || 'Chưa xác nhận'}</dd>
                    <dt>Bảo hành</dt>
                    <dd>
                      {form.warranty.mode === 'CREATE'
                        ? `${form.warranty.warrantyType} · ${form.warranty.startDate} → ${form.warranty.endDate}`
                        : form.warranty.mode === 'KEEP'
                          ? 'Giữ bản ghi bảo hành đã chọn'
                          : form.warranty.mode === 'NONE'
                            ? `Không áp dụng: ${form.warranty.reason}`
                            : 'Chưa xác định'}
                    </dd>
                    <dt>Bảo trì</dt>
                    <dd>
                      {form.maintenance.mode === 'CREATE'
                        ? `${form.maintenance.name} · mỗi ${form.maintenance.frequencyValue} ${{ DAY: 'ngày', WEEK: 'tuần', MONTH: 'tháng', YEAR: 'năm' }[form.maintenance.frequencyUnit || 'MONTH']} · kỳ đầu ${form.maintenance.nextDueDate}`
                        : form.maintenance.mode === 'KEEP'
                          ? 'Giữ kế hoạch và trạng thái đã chọn'
                          : form.maintenance.mode === 'NONE'
                            ? `Không lập định kỳ: ${form.maintenance.reason}`
                            : 'Chờ Service Manager xác nhận'}
                    </dd>
                  </dl>
                </>
              )}
            </fieldset>
          </section>
          {!frozen && (
            <footer className="registration-actions">
              <button
                disabled={busy || step === 0}
                onClick={() => setStep(step - 1)}
              >
                Quay lại
              </button>
              {step < 4 && (
                <button
                  disabled={busy}
                  onClick={() => {
                    const issue = validation(step)
                    if (issue) setError(issue)
                    else {
                      setStep(step + 1)
                      setError('')
                    }
                  }}
                >
                  Tiếp tục
                </button>
              )}
              <button
                disabled={busy || quick !== null}
                onClick={() => void persist(false)}
              >
                {busy ? 'Đang lưu…' : 'Lưu để hoàn thiện sau'}
              </button>
              {step === 4 && canMaintain && (
                <button
                  className="registration-primary"
                  disabled={busy || quick !== null}
                  onClick={() => void persist(true)}
                >
                  Hoàn tất ghi nhận
                </button>
              )}
            </footer>
          )}
        </>
      )}
    </SetupPage>
  )
}

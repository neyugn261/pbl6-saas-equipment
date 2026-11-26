import { HandoverPolicyPanel, ModelPolicySummary, type ModelPolicySnapshot } from './ModelPolicyPanels'
import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { api, ApiError } from '../api/client'
import { getSessionGeneration, useSession } from '../auth/session'
import type { Page } from '../types/domain'
import { equipmentStatusLabels, handoverStatusLabels, locationOptions } from '../display-names'
import { StatusBadge } from '../components/Badges'
import { EquipmentIdentity } from '../features/workspace/WorkspaceUI'
import { ServiceCard, ServiceFacts, ServiceNotice } from '../features/workspace/ServiceDetailUI'
import { formatDate } from '../features/workspace/workspace-data'
import {
  CustomerYouTubePicker,
  ModelYouTubePicker,
  DirectoryPagination,
  LoadState,
  QuickForm,
  type QuickKind,
  SetupPage,
} from './registration-shared'
import {
  type DirectoryRow,
  errorText,
  modelSetupError,
  useDirectory,
} from './registration-data'
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
type DeliveryMethod = 'STORE' | 'CUSTOMER_SITE'
type ConfirmationDetails = {
  condition: string
  notes?: string
  expiresAt: string | null
}
type Registration = {
  deliveryMethod: DeliveryMethod | null
  handoverDetails: ConfirmationDetails | null
  handoverId: string | null
  maintenanceProvisioning: 'PENDING' | 'READY' | null
  policyPreview?: ModelPolicySnapshot | null
  maintenancePlanIds?: string[]
  id: string
  equipmentId: string
  status:
    | 'DRAFT'
    | 'PENDING_MAINTENANCE'
    | 'PENDING_CUSTOMER_CONFIRMATION'
    | 'COMPLETED'
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
  purchaseDate: string | null
  handoverDate: string | null
  installationDate: string | null
  commissionedDate: string | null
  registrationId?: string | null
  registrationStatus?: string
  status: string
}
type FormState = {
  deliveryMethod: DeliveryMethod | ''
  condition: string
  notes: string
  expiresAt: string
  customerId: string
  siteId: string
  locationId: string
  source: 'NEW' | 'EXISTING'
  equipmentId: string
  modelId: string
  assetCode: string
  serialNumber: string
  displayName: string
  purchaseDate: string
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
  PENDING_CUSTOMER_CONFIRMATION: 'Chờ khách hàng xác nhận',
  COMPLETED: 'Đã hoàn tất bàn giao',
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
    purchaseDate: eq.purchaseDate || '',
    handoverDate: eq.handoverDate || '',
    installationDate: eq.installationDate || '',
    commissionedDate: eq.commissionedDate || '',
  }
}
function draftEquipmentFields(form: Pick<FormState,
  'modelId' | 'customerId' | 'siteId' | 'locationId' | 'assetCode' | 'serialNumber' |
  'displayName' | 'purchaseDate' | 'handoverDate' | 'installationDate' | 'commissionedDate'
>) {
  return {
    modelId: form.modelId,
    customerId: form.customerId,
    customerSiteId: form.siteId,
    locationId: form.locationId || null,
    assetCode: form.assetCode.trim(),
    serialNumber: form.serialNumber.trim(),
    displayName: form.displayName.trim() || null,
    purchaseDate: form.purchaseDate || null,
    handoverDate: form.handoverDate || null,
    installationDate: form.installationDate || null,
    commissionedDate: form.commissionedDate || null,
  }
}

function draftConfirmation(form: FormState): ConfirmationDetails | null {
  if (form.deliveryMethod !== 'CUSTOMER_SITE') return null
  const expiresAt = Date.parse(form.expiresAt)
  return {
    condition: form.condition.trim(),
    notes: form.notes.trim(),
    expiresAt: Number.isFinite(expiresAt) ? new Date(expiresAt).toISOString() : null,
  }
}

function currentPolicyPreview(
  row: Registration,
  equipment: Equipment,
): Registration {
  return row.status === 'DRAFT' &&
    row.policyPreview &&
    (row.policyPreview.handoverDate !== equipment.handoverDate ||
      (row.policyPreview.modelId && row.policyPreview.modelId !== equipment.modelId))
    ? { ...row, policyPreview: null }
    : row
}
const today = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(
    new Date(),
  )

function isFutureDeadline(value: string) {
  return new Date(value).getTime() > Date.now()
}
function localDeadline(iso: string) {
  const d = new Date(iso)
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16)
}
function formConfirmation(row: Registration) {
  return {
    deliveryMethod: row.deliveryMethod || ('' as const),
    condition: row.handoverDetails?.condition || '',
    notes: row.handoverDetails?.notes || '',
    expiresAt: row.handoverDetails
      ? row.handoverDetails.expiresAt ? localDeadline(row.handoverDetails.expiresAt) : ''
      : localDeadline(new Date(Date.now() + 30 * 86400000).toISOString()),
  }
}
function resultStep(row: Registration) {
  return row.deliveryMethod === 'CUSTOMER_SITE' ? 5 : 4
}

type RegistrationListItem = Registration & {
  equipment?: {
    status: string
    displayName: string | null
    assetCode: string
    serialNumber: string
    model: { name: string }
  }
  handover?: { id: string; status: string } | null
}

type RegistrationList = Page<RegistrationListItem> & {
  summary: { total: number; byEquipmentStatus: Record<string, number> }
}

const registrationFilters = [
  {
    key: 'status',
    label: 'Trạng thái hồ sơ',
    options: Object.fromEntries(Object.entries(statusNames).filter(([key]) => key !== 'NOT_RECORDED')),
  },
  { key: 'equipmentStatus', label: 'Trạng thái thiết bị', options: equipmentStatusLabels },
  { key: 'handoverStatus', label: 'Trạng thái bàn giao', options: handoverStatusLabels },
] as const

export function RegistrationListPage() {
  const [params, setParams] = useSearchParams()
  const rawPage = Number(params.get('page'))
  const page = Number.isSafeInteger(rawPage) && rawPage > 0 ? rawPage : 1
  const wasHandoverTab = params.get('tab') === 'handovers'
  const query = new URLSearchParams({ page: String(page), pageSize: '20' })
  for (const { key, options } of registrationFilters) {
    const value = wasHandoverTab && key === 'status' ? null
      : params.get(key) ?? (wasHandoverTab && key === 'handoverStatus' ? params.get('status') : null)
    if (value && Object.hasOwn(options, value)) query.set(key, value)
  }
  const state = useDirectory<RegistrationList>('assetM2', `/equipment-registrations?${query}`)
  const summary = state.value?.summary
  const counts = [
    { label: 'Tổng thiết bị trong hồ sơ', count: summary?.total },
    ...Object.entries(equipmentStatusLabels).map(([status, label]) => ({
      label, count: summary?.byEquipmentStatus[status],
    })),
  ]

  function updateView(key: string, value: string) {
    const next = new URLSearchParams(query)
    next.delete('pageSize')
    if (key !== 'page') next.delete('page')
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next)
  }

  return (
    <div className="registration-page registration-page--directory">
      <header className="registration-header page-title-header">
        <h1>Hồ sơ đăng ký thiết bị</h1>
        <div className="registration-actions page-title-actions">
          <Link className="ws-button ws-button--secondary" to="/app/bulk-handovers">
            Nhập lô CSV / XLSX
          </Link>
          <Link className="m1-button" to="/app/equipment-registrations/new">
            + Đăng ký thiết bị
          </Link>
        </div>
      </header>

      <div className="equipment-summary registration-summary-cards" aria-label="Số thiết bị theo trạng thái" aria-busy={state.loading}>
        {counts.map(({ label, count }) => (
          <div className="equipment-summary__card" key={label}>
            <span>{label}</span>
            <strong>{typeof count === 'number' ? count.toLocaleString('vi-VN') : '—'}</strong>
          </div>
        ))}
      </div>

      <section className="m1-card registration-directory" aria-label="Danh sách hồ sơ đăng ký">
        <div className="registration-directory__toolbar">
          {registrationFilters.map(({ key, label, options }) => (
            <label className="registration-directory__filter" key={key}>
              {label}
              <select value={query.get(key) ?? ''} onChange={(e) => updateView(key, e.target.value)}>
                <option value="">Tất cả</option>
                {Object.entries(options).map(([status, name]) => (
                  <option key={status} value={status}>{name}</option>
                ))}
              </select>
            </label>
          ))}
        </div>
        <LoadState {...state} />
        {state.value && (
          <>
            <div className="registration-directory__table registration-directory__table--tracked" tabIndex={0} role="region" aria-label="Bảng hồ sơ đăng ký thiết bị">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Hồ sơ</th>
                    <th scope="col">Trạng thái thiết bị</th>
                    <th scope="col">Trạng thái hồ sơ</th>
                    <th scope="col">Bàn giao</th>
                    <th scope="col">Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {state.value.items.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <Link className="registration-directory__name" to={`/app/equipment-registrations/${row.id}`}>
                          <EquipmentIdentity equipmentId={row.equipmentId} equipment={row.equipment} />
                        </Link>
                      </td>
                      <td>
                        {row.equipment ? <StatusBadge status={row.equipment.status} label={equipmentStatusLabels[row.equipment.status]} /> : '—'}
                      </td>
                      <td>
                        <span className={`registration-directory__status registration-directory__status--${row.status.toLowerCase()}`}>
                          {statusNames[row.status]}
                        </span>
                        {row.lastErrorCode && <small>Cần kiểm tra bước bảo trì</small>}
                      </td>
                      <td>
                        {row.handover ? (
                          <Link className="ws-text-link" to={`/app/equipment-handovers/${row.handover.id}`}>
                            {handoverStatusLabels[row.handover.status] ?? row.handover.status}
                          </Link>
                        ) : row.deliveryMethod === 'STORE' ? 'Tại cửa hàng' : '—'}
                      </td>
                      <td><Link className="ws-text-link" to={`/app/equipment/${row.equipmentId}`}>Xem thiết bị</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!state.value.items.length && <p className="registration-directory__empty">Chưa có hồ sơ phù hợp.</p>}
            <DirectoryPagination
              page={page}
              total={state.value.total}
              label="hồ sơ"
              onChange={(next) => updateView('page', next === 1 ? '' : String(next))}
            />
          </>
        )}
      </section>
    </div>
  )
}

export function EquipmentRegistrationPage() {
  const { id } = useParams(),
    navigate = useNavigate(),
    location = useLocation(),
    { profile } = useSession()
  const query = new URLSearchParams(location.search)
  const [form, setForm] = useState<FormState>(() => ({
    deliveryMethod:
      query.get('handoverRequired') === 'true' ? 'CUSTOMER_SITE' : '',
    condition: '',
    notes: '',
    expiresAt: localDeadline(
      new Date(Date.now() + 30 * 86400000).toISOString(),
    ),
    customerId: query.get('customerId') || '',
    siteId: query.get('siteId') || '',
    locationId: '',
    source: query.has('equipmentId') ? 'EXISTING' : 'NEW',
    equipmentId: query.get('equipmentId') || '',
    modelId: '',
    assetCode: '',
    serialNumber: '',
    displayName: '',
    purchaseDate: '',
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
    [storedEquipment, setStoredEquipment] = useState<Equipment | null>(null),
    [qrImage, setQrImage] = useState(''),
    [needsReload, setNeedsReload] = useState(false)
  const pending = useRef<{ key: string; body: unknown } | null>(null),
    saving = useRef(false)
  const markerKey = `pbl6.registration.${window.location.origin}.${profile?.tenantId}.${profile?.id}`
  const canMaintain = profile?.roles.includes('SERVICE_MANAGER') === true
  const frozen =
    record?.status === 'PENDING_MAINTENANCE' ||
    record?.status === 'PENDING_CUSTOMER_CONFIRMATION' ||
    record?.status === 'COMPLETED' ||
    uncertain ||
    needsReload
  const isExistingInService = storedEquipment?.status === 'IN_SERVICE' || storedEquipment?.status === 'RETIRED'
  const canEditIdentity = !frozen && !isExistingInService && (
    record ? record.allowedActions?.includes('editEquipmentIdentity') : form.source === 'NEW'
  )
  const canChangeModel = !frozen && !isExistingInService && (record?.status === 'DRAFT' || form.source === 'NEW')
  const fields = draftEquipmentFields(form)
  const previousFields = storedEquipment && draftEquipmentFields(formEquipment(storedEquipment))
  const equipmentChanges = Object.fromEntries(
    Object.entries(fields).filter(([key, value]) =>
      previousFields && previousFields[key as keyof typeof fields] !== value),
  )
  const deliveryChanged = Boolean(record && form.deliveryMethod && form.deliveryMethod !== record.deliveryMethod)
  const confirmation = draftConfirmation(form)
  const previousConfirmation = record?.handoverDetails
  const confirmationChanged = confirmation?.condition !== previousConfirmation?.condition ||
    (confirmation?.notes || '') !== (previousConfirmation?.notes || '') ||
    (confirmation?.expiresAt ? Date.parse(confirmation.expiresAt) : null) !==
      (previousConfirmation?.expiresAt ? Date.parse(previousConfirmation.expiresAt) : null)
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
  const locations = useDirectory<(DirectoryRow & { parentId: string | null; customerSiteId: string })[]>(
    'organization',
    form.siteId ? `/sites/${form.siteId}/locations` : null,
    revision,
  )
  const locationChoices = locationOptions(locations.value ?? [], form.siteId)
  const locationLocked = !canEditIdentity || busy || !form.siteId
  const contacts = useDirectory<DirectoryRow[]>(
    'organization',
    form.customerId ? `/customers/${form.customerId}/contacts` : null,
    revision,
  )
  const model = useDirectory<DirectoryRow>(
    'assetM2',
    form.modelId ? `/equipment-models/${form.modelId}` : null,
    revision,
  )
  const field = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }))
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
              const current = currentPolicyPreview(row, eq)
              const marker = sessionStorage.getItem(markerKey)
              if (marker) {
                try {
                  if (JSON.parse(marker).id === row.id)
                    sessionStorage.removeItem(markerKey)
                } catch {
                  /* Keep unresolved creation markers available for recovery. */
                }
              }
              setRecord(current)
              setStoredEquipment(eq)
              setForm((prev) => ({
                ...prev,
                ...formEquipment(eq),
                ...formConfirmation(row),
                warranty: row.warranty,
                maintenance: row.maintenance,
              }))
              setLoading(false)
              setUncertain(false)
              setNeedsReload(false)
              setStep(
                row.status === 'DRAFT'
                  ? [0, 1, 2, 4].includes(location.state?.registrationStep)
                    ? location.state.registrationStep
                    : current.policyPreview
                      ? 2
                      : 0
                  : resultStep(row),
              )
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
            else {
              setStoredEquipment(eq)
              setForm((prev) => ({ ...prev, ...formEquipment(eq) }))
            }
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
  }, [id, location.search, location.state, markerKey, navigate])

  const pollingId =
    record &&
    (record.status === 'PENDING_CUSTOMER_CONFIRMATION' ||
      record.maintenanceProvisioning === 'PENDING')
      ? record.id
      : null
  useEffect(() => {
    if (!pollingId) return
    let active = true
    const timer = window.setInterval(() => {
      api
        .assetM2<Registration>(`/equipment-registrations/${pollingId}`)
        .then((row) => {
          if (!active) return
          setRecord(row)
          if (row.status === 'DRAFT') {
            setStep(1)
            setError(
              'Hồ sơ chưa được xác nhận. Xem lần gửi trước, sửa và gửi lại.',
            )
          }
        })
        .catch(() => {
          /* Keep the last confirmed state; manual reload remains available. */
        })
    }, 10000)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [pollingId])

  function validation(part: number, final = false) {
    if (part === 0 && (!form.customerId || !form.siteId))
      return 'Chọn khách hàng và địa điểm đặt thiết bị.'
    if (part === 1) {
      if (!record && !form.deliveryMethod)
        return 'Chọn hình thức bàn giao tại cửa hàng hoặc tại cơ sở khách hàng.'
      if (
        final &&
        form.deliveryMethod === 'CUSTOMER_SITE' &&
        (!form.condition.trim() ||
          !form.expiresAt ||
          !isFutureDeadline(form.expiresAt))
      )
        return 'Nhập tình trạng bàn giao và hạn xác nhận trong tương lai.'
      if (!form.modelId) return 'Chọn model cho thiết bị.'
      if (
        !form.assetCode.trim() || !form.serialNumber.trim()
      )
        return 'Chọn model, nhập mã thiết bị và serial.'
      if (form.source === 'EXISTING' && !form.equipmentId)
        return 'Chọn máy cần hoàn thiện hồ sơ.'
      if (final && !form.handoverDate)
        return 'Ghi ngày bàn giao thực tế trước khi hoàn tất.'
      if (
        [form.purchaseDate, form.handoverDate, form.installationDate, form.commissionedDate].some(
          (date) => date && date > today(),
        )
      )
        return 'Ngày thực tế của thiết bị không được ở tương lai.'
    }
    if (final && part === 2 && !record?.policyPreview)
      return 'Áp dụng chính sách của Model trước khi hoàn tất bàn giao.'
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
  async function persist(
    complete: boolean,
    retry = false,
    targetStep = step,
  ) {
    if (saving.current || (busy && !retry)) return
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
    saving.current = true
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
                    ...(form.purchaseDate ? { purchaseDate: form.purchaseDate } : {}),
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
              ...(form.deliveryMethod
                ? { deliveryMethod: form.deliveryMethod }
                : {}),
              ...(confirmation ? { handoverDetails: confirmation } : {}),
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
      }
      if (getSessionGeneration() !== operationGeneration) return
      if (!complete && saved.status === 'DRAFT' &&
        (Object.keys(equipmentChanges).length || deliveryChanged || (record && confirmationChanged))
      ) {
        saved = await api.assetM2<Registration>(`/equipment-registrations/${saved.id}`, {
          method: 'PATCH',
          body: {
            expectedVersion: saved.version,
            ...equipmentChanges,
            ...(deliveryChanged ? { deliveryMethod: form.deliveryMethod } : {}),
            ...(record && confirmationChanged ? { handoverDetails: confirmation } : {}),
          },
        })
        if (getSessionGeneration() !== operationGeneration) return
        setStoredEquipment((previous) => previous && { ...previous, ...fields })
      }
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
      const destination = complete
        ? resultStep(saved)
        : targetStep === 4 && !saved.policyPreview
          ? 2
          : targetStep
      setStep(destination)
      setRevision((v) => v + 1)
      sessionStorage.removeItem(markerKey)
      if (!id)
        navigate(`/app/equipment-registrations/${saved.id}`, {
          replace: true,
          state: { registrationStep: destination },
        })
    } catch (e) {
      if (getSessionGeneration() !== operationGeneration) return
      setError(modelSetupError(e))
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
        if (!id)
          navigate(`/app/equipment-registrations/${saved.id}`, {
            replace: true,
            state: { registrationStep: step },
          })
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
      saving.current = false
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
      setRecord(currentPolicyPreview(row, eq))
      setStoredEquipment(eq)
      setForm((prev) => ({
        ...prev,
        ...formEquipment(eq),
        ...formConfirmation(row),
        warranty: row.warranty,
        maintenance: row.maintenance,
      }))
      setNeedsReload(false)
      setError('')
      setStep(row.status === 'DRAFT' ? Math.min(step, 4) : resultStep(row))
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
  const dirty = !frozen && (record
    ? Boolean(Object.keys(equipmentChanges).length || deliveryChanged || confirmationChanged)
    : Boolean(form.modelId || form.assetCode || form.serialNumber))
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty || busy) e.preventDefault()
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
        (dirty &&
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
  }, [dirty, busy])
  async function goToStep(target: number) {
    if (
      busy ||
      (frozen && target !== 4 && target !== 5) ||
      (target === 5 && record?.status === 'DRAFT')
    )
      return
    if (target > step) {
      for (const part of [0, 1]) {
        if (part >= target) continue
        const issue = validation(part, target >= 2)
        if (issue) {
          setStep(part)
          setError(issue)
          return
        }
      }
    }
    setError('')
    if (target > step && target >= 2 && (!record || dirty)) {
      await persist(false, false, target)
    } else if (target === 4 && record?.status === 'DRAFT' && !record.policyPreview) {
      setStep(2)
      setError('Áp dụng chính sách Model trước khi kiểm tra hồ sơ.')
    } else setStep(target)
  }
  async function refreshPolicies() {
    if (!record) return
    const generation = getSessionGeneration()
    const [row, eq] = await Promise.all([
      api.assetM2<Registration>(`/equipment-registrations/${record.id}`),
      api.assetM2<Equipment>(`/equipment/${record.equipmentId}`),
    ])
    if (generation !== getSessionGeneration()) return
    setRecord(currentPolicyPreview(row, eq))
    setStoredEquipment(eq)
    setForm((prev) => ({
      ...prev,
      ...formEquipment(eq),
      ...formConfirmation(row),
      warranty: row.warranty,
      maintenance: row.maintenance,
    }))
    if (row.status !== 'DRAFT') setStep(resultStep(row))
    setRevision((v) => v + 1)
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
        ...(!record ? { equipmentId: '', source: 'NEW' } : {}),
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
      title="Đăng ký thiết bị và chuẩn bị bàn giao"
      description="Lưu hồ sơ nháp → kiểm tra thông tin và chính sách → hoàn tất tại cửa hàng hoặc gửi khách xác nhận tại cơ sở. Ngày bàn giao thực tế chỉ ghi khi đã diễn ra."
      back={{ to: '/app/equipment-registrations', label: 'Về danh sách hồ sơ đăng ký', disabled: busy }}
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
              {record.status === 'DRAFT' && record.handoverId && (
                <p>
                  Khách chưa xác nhận hồ sơ này.{' '}
                  <Link to={`/app/equipment-handovers/${record.handoverId}`}>
                    Xem lý do / lần gửi trước
                  </Link>
                  . Sửa thông tin, xem lại chính sách rồi gửi phiên bản mới.
                </p>
              )}
              {record.status === 'COMPLETED' && (
                <>
                  <p>
                    {record.deliveryMethod === 'STORE'
                      ? 'Nhân viên đã hoàn tất bàn giao tại cửa hàng. Bảo hành tính từ ngày bàn giao thực tế.'
                      : record.deliveryMethod === 'CUSTOMER_SITE'
                        ? 'Khách hàng đã xác nhận hồ sơ bàn giao tại cơ sở.'
                        : 'Đã xác nhận các lựa chọn thiết lập.'}
                  </p>
                  {record.maintenanceProvisioning === 'PENDING' && (
                    <p>
                      Hồ sơ đã hoàn tất. Hệ thống đang tạo lịch bảo trì từ nội
                      dung khách đã xác nhận.{' '}
                      {record.allowedActions.includes('resume') && (
                        <button disabled={busy} onClick={() => void resume()}>
                          Kiểm tra và tiếp tục thiết lập bảo trì
                        </button>
                      )}
                    </p>
                  )}
                  <div className="registration-actions">
                    {!record.deliveryMethod && (
                      <Link
                        to={`/app/equipment-handovers/new?equipmentId=${record.equipmentId}`}
                      >
                        Tạo yêu cầu khách xác nhận bàn giao
                      </Link>
                    )}
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
            {[
              { index: 0, name: 'Khách hàng' },
              { index: 1, name: 'Thiết bị' },
              { index: 2, name: 'Chính sách Model' },
              { index: 4, name: 'Kiểm tra và gửi' },
              ...(form.deliveryMethod === 'CUSTOMER_SITE'
                ? [
                    {
                      index: 5,
                      name:
                        record?.status === 'COMPLETED'
                          ? 'Khách đã xác nhận'
                          : 'Chờ khách xác nhận',
                    },
                  ]
                : []),
            ].map(({ index, name }, position) => (
              <button
                type="button"
                key={name}
                aria-current={step === index ? 'step' : undefined}
                disabled={
                  busy ||
                  (frozen && index !== 4 && index !== 5) ||
                  (index === 5 && (!record || record.status === 'DRAFT'))
                }
                onClick={() => void goToStep(index)}
              >
                {position + 1}. {name}
              </button>
            ))}
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
          <section className={step === 2 || step === 4 ? undefined : 'm1-card registration-step'} aria-busy={busy}>
            <fieldset
              className="registration-content"
              disabled={(frozen && step !== 5) || busy}
            >
              {step === 0 && (
                <>
                  <h2>Khách hàng</h2>
                  {!record || canEditIdentity ? (
                    <CustomerYouTubePicker
                      selectedId={form.customerId}
                      selectedCustomer={customer.value}
                      onChange={(value) => {
                        setForm((prev) => ({
                          ...prev,
                          customerId: value,
                          siteId: '',
                          locationId: '',
                          ...(!record ? { equipmentId: '', source: 'NEW' } : {}),
                        }))
                      }}
                      onAdd={() => setQuick('customer')}
                      revision={revision}
                    />
                  ) : (
                    <p>
                      Khách hàng:{' '}
                      {customer.value?.name || 'Khách hàng không xác định'}
                    </p>
                  )}
                  <LoadState {...customer} />
                  {Boolean(form.customerId) && (
                    <>
                      <div className="registration-site-section">
                        <h3>Địa điểm đặt thiết bị</h3>
                        <div className="registration-fields">
                          <label>
                            <span>
                              Địa điểm đặt thiết bị <span className="required-star">*</span>
                            </span>
                            <select
                              value={form.siteId}
                              disabled={!canEditIdentity || busy || !form.customerId}
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
                          {canEditIdentity && (
                            <button
                              type="button"
                              className="ws-button ws-button--secondary"
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
                              disabled={locationLocked || locations.loading}
                              onChange={(e) => field('locationId', e.target.value)}
                            >
                              <option value="">Không chỉ định</option>
                              {form.locationId && !locationChoices.some(row => row.id === form.locationId) && (
                                <option value={form.locationId}>Vị trí đã lưu</option>
                              )}
                              {locationChoices.map((row) => (
                                <option value={row.id} key={row.id}>
                                  {row.label}
                                </option>
                              ))}
                            </select>
                          </label>
                          {canEditIdentity && (
                            <button
                              type="button"
                              className="ws-button ws-button--secondary"
                              disabled={!form.siteId || busy}
                              onClick={() => setQuick('location')}
                            >
                              + Thêm vị trí
                            </button>
                          )}
                          <LoadState {...locations} />
                        </div>
                      </div>
                      <div className="registration-contact-section">
                        <div className="registration-contact-header">
                          <div>
                            <h3>Người liên hệ</h3>
                          </div>
                          {canEditIdentity && (
                            <button
                              type="button"
                              className="ws-button ws-button--secondary"
                              disabled={!form.customerId || busy}
                              onClick={() => setQuick('contact')}
                            >
                              + Thêm liên hệ khách hàng
                            </button>
                          )}
                        </div>
                        <LoadState {...contacts} />
                        {contacts.value && contacts.value.length > 0 ? (
                          <div className="registration-contact-cards">
                            {contacts.value.map((row) => (
                              <div key={row.id} className="registration-contact-item">
                                <div className="registration-contact-badge" aria-hidden="true">👤</div>
                                <div className="registration-contact-info">
                                  <div className="registration-contact-title">
                                    <strong>{row.name}</strong>
                                    {row.position && (
                                      <span className="registration-contact-tag">{row.position}</span>
                                    )}
                                  </div>
                                  <div className="registration-contact-meta">
                                    {row.phone && (
                                      <a href={`tel:${row.phone}`} className="registration-contact-link">
                                        📞 {row.phone}
                                      </a>
                                    )}
                                    {row.email && (
                                      <a href={`mailto:${row.email}`} className="registration-contact-link">
                                        ✉ {row.email}
                                      </a>
                                    )}
                                    {!row.phone && !row.email && (
                                      <span className="registration-contact-none">Chưa có thông tin liên lạc</span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="registration-contact-empty">
                            <p>Khách hàng này chưa có người liên hệ nào.</p>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </>
              )}
              {step === 1 && (
                <>
                  <h2>Thông tin thiết bị và model</h2>
                  {canChangeModel && (
                    <ModelYouTubePicker
                      selectedId={form.modelId}
                      selectedModel={model.value}
                      onChange={(value) => field('modelId', value)}
                      onAdd={() => setQuick('model')}
                      revision={revision}
                    />
                  )}
                  {!canChangeModel && (
                    <div className="customer-selected-area">
                      <div className="customer-yt-selected-card">
                        <div className="customer-yt-selected-top">
                          <div className="customer-yt-selected-badge">
                            <span className="customer-yt-check-icon">✓</span> Model thiết bị đã ghi nhận
                          </div>
                          <strong className="customer-yt-selected-name">
                            {model.value?.name ||
                              (loading
                                ? 'Đang tải thông tin model…'
                                : 'Model không xác định')}
                          </strong>
                          {(model.value?.modelCode || model.value?.code) && (
                            <span className="customer-yt-code-tag">
                              {model.value?.modelCode || model.value?.code}
                            </span>
                          )}
                        </div>
                        <div className="customer-yt-selected-details">
                          {model.value?.manufacturer && (
                            <span className="customer-yt-detail-item">
                              <span className="customer-yt-detail-label">Hãng:</span>
                              <strong>{model.value.manufacturer}</strong>
                            </span>
                          )}
                          {model.value?.description && (
                            <span className="customer-yt-detail-item">
                              <span className="customer-yt-detail-label">Mô tả:</span>
                              <span>{model.value.description}</span>
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                  <LoadState {...model} />
                  <div className="registration-fields" style={{ marginTop: '20px' }}>
                    {(
                      [
                        ['assetCode', 'Mã thiết bị', true],
                        ['serialNumber', 'Serial', true],
                        ['displayName', 'Tên hiển thị', false],
                      ] as const
                    ).map(([key, label, required]) => (
                      <label key={key}>
                        <span>
                          {label}
                          {required && <span className="required-star"> *</span>}
                        </span>
                        <input
                          value={form[key]}
                          maxLength={
                            key === 'assetCode'
                              ? 100
                              : key === 'serialNumber'
                                ? 150
                                : 200
                          }
                          placeholder={
                            key === 'assetCode'
                              ? 'Ví dụ: TB-001 hoặc PUMP-01'
                              : key === 'serialNumber'
                                ? 'Ví dụ: SN-2024-99881'
                                : 'Ví dụ: Máy bơm tầng hầm Tòa A'
                          }
                          disabled={frozen || busy || (key !== 'displayName' && !canEditIdentity)}
                          onChange={(e) => field(key, e.target.value)}
                        />
                      </label>
                    ))}
                    <label>
                      <span>
                        Hình thức bàn giao <span className="required-star">*</span>
                      </span>
                      <select
                        aria-label="Hình thức bàn giao"
                        value={form.deliveryMethod}
                        disabled={busy || (record ? !canEditIdentity : frozen)}
                        onChange={(e) => {
                          const deliveryMethod = e.target.value as FormState['deliveryMethod']
                          setForm((prev) => ({
                            ...prev,
                            deliveryMethod,
                            ...(deliveryMethod === 'STORE' ? {
                              installationDate: '',
                              commissionedDate: '',
                              condition: '',
                              notes: '',
                            } : {}),
                          }))
                        }}
                      >
                        <option value="" disabled={Boolean(record?.deliveryMethod)}>
                          {record && !record.deliveryMethod
                            ? 'Hồ sơ cũ (giữ luồng hiện tại)'
                            : 'Chọn hình thức bàn giao'}
                        </option>
                        <option value="STORE">Bàn giao tại cửa hàng</option>
                        <option value="CUSTOMER_SITE">
                          Bàn giao tại cơ sở khách hàng
                        </option>
                      </select>
                    </label>
                    {(
                      [
                        ['handoverDate', 'Ngày bàn giao thực tế', true],
                        ['purchaseDate', 'Ngày mua', false],
                        ['installationDate', 'Ngày lắp đặt', false],
                        ['commissionedDate', 'Ngày đưa vào sử dụng', false],
                      ] as const
                    )
                      .filter(
                        ([key]) =>
                          key === 'handoverDate' ||
                          key === 'purchaseDate' ||
                          form.deliveryMethod === 'CUSTOMER_SITE' ||
                          (record && !record.deliveryMethod),
                      )
                      .map(([key, label, required]) => (
                        <label key={key}>
                          <span>
                            {label}
                            {required && <span className="required-star"> *</span>}
                          </span>
                          <input
                            type="date"
                            value={form[key]}
                            max={today()}
                            disabled={frozen || busy}
                            onChange={(e) => field(key, e.target.value)}
                          />
                        </label>
                      ))}
                  </div>
                  {form.deliveryMethod === 'CUSTOMER_SITE' && (
                    <div className="registration-fields">
                      <label>
                        <span>
                          Tình trạng khi bàn giao <span className="required-star">*</span>
                        </span>
                        <textarea
                          maxLength={2000}
                          value={form.condition}
                          disabled={frozen || busy}
                          onChange={(e) => field('condition', e.target.value)}
                        />
                      </label>
                      <label>
                        Ghi chú cho khách hàng
                        <textarea
                          maxLength={4000}
                          value={form.notes}
                          disabled={frozen || busy}
                          onChange={(e) => field('notes', e.target.value)}
                        />
                      </label>
                      <label>
                        <span>
                          Hạn khách xác nhận <span className="required-star">*</span>
                        </span>
                        <input
                          type="datetime-local"
                          value={form.expiresAt}
                          disabled={frozen || busy}
                          onChange={(e) => field('expiresAt', e.target.value)}
                        />
                      </label>
                      <p>
                        Hạn xác nhận tối đa 90 ngày. Quá hạn hồ sơ không tự hoàn
                        tất; nhân viên cần kiểm tra và gửi lại.
                      </p>
                    </div>
                  )}
                </>
              )}
              {step === 2 && record && (
                <HandoverPolicyPanel
                  key={`${record.id}:${form.modelId}`}
                  id={record.id}
                  modelId={form.modelId}
                  modelName={model.value?.name ?? (model.loading ? 'Đang tải model…' : undefined)}
                  modelCode={model.value?.modelCode ?? model.value?.code}
                  version={record.version}
                  status={record.status}
                  snapshot={record.policyPreview}
                  changed={refreshPolicies}
                  onBusyChange={setBusy}
                />
              )}
              {step === 5 && record && (
                <>
                  <h2>
                    {record.status === 'COMPLETED'
                      ? 'Khách hàng đã xác nhận'
                      : 'Chờ khách hàng xác nhận bàn giao'}
                  </h2>
                  <p>
                    {record.status === 'COMPLETED'
                      ? 'Hồ sơ bàn giao đã hoàn tất. Ngày bắt đầu chính sách là ngày bàn giao thực tế đã xác nhận.'
                      : 'Nội dung đã gửi được khóa. Khách hàng cần kiểm tra ngày bàn giao, lắp đặt, vận hành và chính sách trong cổng khách hàng để xác nhận hoặc từ chối.'}
                  </p>
                  {record.handoverId && (
                    <Link
                      className="m1-button"
                      to={`/app/equipment-handovers/${record.handoverId}`}
                    >
                      Xem yêu cầu xác nhận và lịch sử
                    </Link>
                  )}
                  <button disabled={busy} onClick={() => void reloadStored()}>
                    Cập nhật trạng thái
                  </button>
                  {record.status !== 'COMPLETED' && (
                    <p>
                      Chưa kích hoạt thiết bị hoặc tạo lịch bảo trì trước khi
                      khách xác nhận. Thời điểm bấm xác nhận không thay đổi ngày
                      bắt đầu bảo hành.
                    </p>
                  )}
                </>
              )}
              {step === 4 && (
                <div className="registration-review-container">
                  <h2>Kiểm tra và gửi</h2>
                  <div className="registration-review-grid">
                    <ServiceCard title="Khách hàng và địa điểm" headingLevel="h3">
                      <ServiceFacts items={[
                        { label: 'Khách hàng', value: customer.value?.name || 'Khách hàng không xác định' },
                        { label: 'Cơ sở khách hàng', value: sites.value?.find((row) => row.id === form.siteId)?.name || 'Địa điểm không xác định' },
                        ...(form.locationId ? [{
                          label: 'Vị trí lắp đặt',
                          value: locationChoices.find((row) => row.id === form.locationId)?.label || form.locationId,
                        }] : []),
                      ]} />
                    </ServiceCard>
                    <ServiceCard title="Thiết bị" headingLevel="h3">
                      <ServiceFacts items={[
                        {
                          label: 'Model',
                          value: model.value?.name || form.displayName || form.assetCode,
                          hint: model.value?.modelCode || model.value?.code,
                        },
                        { label: 'Mã thiết bị', value: form.assetCode },
                        { label: 'Serial', value: form.serialNumber },
                        ...(form.displayName ? [{ label: 'Tên hiển thị', value: form.displayName }] : []),
                      ]} />
                    </ServiceCard>
                    <ServiceCard title="Bàn giao" headingLevel="h3">
                      <ServiceFacts items={[
                        {
                          label: 'Hình thức bàn giao',
                          value: form.deliveryMethod === 'STORE'
                            ? 'Tại cửa hàng'
                            : form.deliveryMethod === 'CUSTOMER_SITE'
                              ? 'Tại cơ sở khách hàng'
                              : 'Hồ sơ cũ',
                        },
                        { label: 'Ngày bàn giao thực tế', value: form.handoverDate ? formatDate(form.handoverDate) : 'Chưa ghi nhận' },
                        ...(form.purchaseDate ? [{ label: 'Ngày mua', value: formatDate(form.purchaseDate) }] : []),
                        ...(form.installationDate ? [{ label: 'Ngày lắp đặt', value: formatDate(form.installationDate) }] : []),
                        ...(form.commissionedDate ? [{ label: 'Ngày đưa vào sử dụng', value: formatDate(form.commissionedDate) }] : []),
                        ...(record?.handoverDetails ? [{
                          label: 'Hạn khách xác nhận',
                          value: formatDate(record.handoverDetails.expiresAt, true),
                        }] : []),
                      ]} />
                      {record?.handoverDetails && (
                        <div className="registration-review-notes">
                          <ServiceFacts items={[
                            { label: 'Tình trạng khi bàn giao', value: record.handoverDetails.condition },
                            ...(record.handoverDetails.notes ? [{
                              label: 'Ghi chú cho khách hàng', value: record.handoverDetails.notes,
                            }] : []),
                          ]} />
                        </div>
                      )}
                    </ServiceCard>
                  </div>
                  <section className="registration-review-policies">
                    <h3>Chính sách bảo hành và bảo trì</h3>
                    {record?.policyPreview ? (
                      <ModelPolicySummary snapshot={record.policyPreview} includeOverrideReason />
                    ) : record && record.status !== 'DRAFT' ? (
                      <ServiceCard title="Điều khoản đã ghi nhận" headingLevel="h3">
                        <ServiceFacts items={[
                          {
                            label: 'Bảo hành',
                            value: form.warranty.mode === 'CREATE'
                              ? `${form.warranty.warrantyType} · ${form.warranty.startDate} → ${form.warranty.endDate}`
                              : form.warranty.mode === 'KEEP'
                                ? 'Giữ bản ghi bảo hành đã chọn'
                                : form.warranty.mode === 'NONE'
                                  ? `Không áp dụng: ${form.warranty.reason}`
                                  : 'Chưa xác định',
                          },
                          ...(form.warranty.terms ? [{ label: 'Điều khoản bảo hành', value: form.warranty.terms }] : []),
                          {
                            label: 'Bảo trì',
                            value: form.maintenance.mode === 'CREATE'
                              ? `${form.maintenance.name} · mỗi ${form.maintenance.frequencyValue} ${{ DAY: 'ngày', WEEK: 'tuần', MONTH: 'tháng', YEAR: 'năm' }[form.maintenance.frequencyUnit || 'MONTH']} · kỳ đầu ${form.maintenance.nextDueDate}`
                              : form.maintenance.mode === 'KEEP'
                                ? 'Giữ kế hoạch và trạng thái đã chọn'
                                : form.maintenance.mode === 'NONE'
                                  ? `Không lập định kỳ: ${form.maintenance.reason}`
                                  : 'Chờ Service Manager xác nhận',
                          },
                          ...(form.maintenance.description ? [{ label: 'Nội dung bảo trì', value: form.maintenance.description }] : []),
                        ]} />
                      </ServiceCard>
                    ) : <ServiceNotice title="Chưa áp dụng chính sách Model">Chọn và áp dụng phiên bản ở bước Chính sách Model.</ServiceNotice>}
                  </section>
                </div>
              )}
            </fieldset>
          </section>
          {!frozen && (
            <footer className="ws-actions registration-step-actions">
              <button
                type="button"
                className="ws-button ws-button--secondary"
                disabled={busy || step === 0}
                onClick={() => void goToStep(step === 4 ? 2 : step - 1)}
              >
                Quay lại
              </button>
              {(record || step >= 1) && step < 4 && (
                <button
                  type="button"
                  className="ws-button ws-button--secondary"
                  disabled={busy || quick !== null}
                  onClick={() => void persist(false)}
                >
                  {busy ? 'Đang lưu…' : 'Lưu bản nháp'}
                </button>
              )}
              {step < 4 && (
                <button
                  type="button"
                  className="ws-button"
                  disabled={busy}
                  onClick={() => void goToStep(step === 2 ? 4 : step + 1)}
                >
                  Tiếp tục
                </button>
              )}
              {step === 4 && canMaintain && (
                <button
                  type="button"
                  className="ws-button"
                  disabled={busy || quick !== null || !record?.policyPreview}
                  onClick={() => void persist(true)}
                >
                  {form.deliveryMethod === 'CUSTOMER_SITE'
                    ? 'Gửi khách xác nhận'
                    : 'Hoàn tất ghi nhận'}
                </button>
              )}
            </footer>
          )}
        </>
      )}
    </SetupPage>
  )
}

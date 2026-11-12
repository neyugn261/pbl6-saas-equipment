import { HandoverPolicyPanel } from './ModelPolicyPanels'
import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { api, ApiError } from '../api/client'
import { getSessionGeneration, useSession } from '../auth/session'
import type { Page } from '../types/domain'
import { locationOptions } from '../display-names'
import { EquipmentIdentity } from '../features/workspace/WorkspaceUI'
import {
  DirectoryPicker,
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
  expiresAt: string
}
type Registration = {
  deliveryMethod: DeliveryMethod | null
  handoverDetails: ConfirmationDetails | null
  handoverId: string | null
  maintenanceProvisioning: 'PENDING' | 'READY' | null
  policyPreview?: Parameters<typeof HandoverPolicyPanel>[0]['snapshot']
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
    handoverDate: eq.handoverDate || '',
    installationDate: eq.installationDate || '',
    commissionedDate: eq.commissionedDate || '',
  }
}
function currentPolicyPreview(
  row: Registration,
  equipment: Equipment,
): Registration {
  return row.status === 'DRAFT' &&
    row.policyPreview &&
    row.policyPreview.handoverDate !== equipment.handoverDate
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
      ? localDeadline(row.handoverDetails.expiresAt)
      : localDeadline(new Date(Date.now() + 30 * 86400000).toISOString()),
  }
}
function resultStep(row: Registration) {
  return row.deliveryMethod === 'CUSTOMER_SITE' ? 5 : 4
}

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
            {(
              [
                'DRAFT',
                'PENDING_MAINTENANCE',
                'PENDING_CUSTOMER_CONFIRMATION',
                'COMPLETED',
              ] as const
            ).map((s) => (
              <option key={s} value={s}>
                {statusNames[s]}
              </option>
            ))}
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
                        <EquipmentIdentity equipmentId={row.equipmentId} />
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
    [needsReload, setNeedsReload] = useState(false)
  const pending = useRef<{ key: string; body: unknown } | null>(null),
    selectedSequence = useRef(0)
  const markerKey = `pbl6.registration.${window.location.origin}.${profile?.tenantId}.${profile?.id}`
  const canMaintain = profile?.roles.includes('SERVICE_MANAGER') === true
  const frozen =
    record?.status === 'PENDING_MAINTENANCE' ||
    record?.status === 'PENDING_CUSTOMER_CONFIRMATION' ||
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
  const locations = useDirectory<(DirectoryRow & { parentId: string | null; customerSiteId: string })[]>(
    'organization',
    form.siteId ? `/sites/${form.siteId}/locations` : null,
    revision,
  )
  const [locationSearch, setLocationSearch] = useState({ siteId: '', text: '' })
  const locationQuery = locationSearch.siteId === form.siteId ? locationSearch.text : ''
  const locationChoices = locationOptions(locations.value ?? [], form.siteId)
    .filter(row => row.id === form.locationId || row.label.toLocaleLowerCase('vi').includes(locationQuery.trim().toLocaleLowerCase('vi')))
  const locationLocked = Boolean(record) ||
    (form.source === 'EXISTING' && Boolean(form.equipmentId)) || busy || !form.siteId
  const contacts = useDirectory<DirectoryRow[]>(
    'organization',
    form.customerId ? `/customers/${form.customerId}/contacts` : null,
    revision,
  )
  const currentEquipmentId =
    record?.equipmentId || (form.source === 'EXISTING' ? form.equipmentId : '')
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
    targetStep = 4,
    applyPolicies = false,
  ) {
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
              ...(form.deliveryMethod
                ? { deliveryMethod: form.deliveryMethod }
                : {}),
              ...(form.deliveryMethod === 'CUSTOMER_SITE' &&
              form.condition.trim()
                ? {
                    handoverDetails: {
                      condition: form.condition.trim(),
                      notes: form.notes.trim(),
                      expiresAt: new Date(form.expiresAt).toISOString(),
                    },
                  }
                : {}),
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
      if (
        saved.status === 'DRAFT' &&
        saved.deliveryMethod === 'CUSTOMER_SITE' &&
        form.condition.trim()
      ) {
        const details = {
          condition: form.condition.trim(),
          notes: form.notes.trim(),
          expiresAt: new Date(form.expiresAt).toISOString(),
        }
        const old = saved.handoverDetails
        if (
          !old ||
          old.condition !== details.condition ||
          (old.notes || '') !== details.notes ||
          new Date(old.expiresAt).getTime() !==
            new Date(details.expiresAt).getTime()
        )
          saved = await api.assetM2<Registration>(
            `/equipment-registrations/${saved.id}`,
            {
              method: 'PATCH',
              body: {
                expectedVersion: saved.version,
                handoverDetails: details,
              },
            },
          )
      }
      // Pin server-resolved Model policies once, without replacing an existing preview.
      if (applyPolicies && saved.status === 'DRAFT' && !saved.policyPreview) {
        const preview = await api.assetM2<
          Pick<Registration, 'id' | 'version' | 'policyPreview'>
        >(`/equipment-registrations/${saved.id}/model-policies`, {
          method: 'POST',
          body: { expectedVersion: saved.version },
        })
        saved = { ...saved, ...preview }
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
      setStep(complete ? resultStep(saved) : targetStep)
      setRevision((v) => v + 1)
      sessionStorage.removeItem(markerKey)
      navigate(`/app/equipment-registrations/${saved.id}`, {
        replace: true,
        state: { registrationStep: complete ? resultStep(saved) : targetStep },
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
        navigate(`/app/equipment-registrations/${saved.id}`, {
          replace: true,
          state: { registrationStep: targetStep },
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
      setForm((prev) => ({
        ...prev,
        ...formEquipment(eq),
        ...formConfirmation(row),
        warranty: row.warranty,
        maintenance: row.maintenance,
      }))
      setNeedsReload(false)
      setDatesDirty(false)
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
  const dirty =
    !frozen &&
    (record
      ? JSON.stringify([
          form.warranty,
          form.maintenance,
          form.condition,
          form.notes,
          form.deliveryMethod === 'CUSTOMER_SITE' && record.handoverDetails
            ? form.expiresAt
            : '',
        ]) !==
        JSON.stringify([
          record.warranty,
          record.maintenance,
          record.handoverDetails?.condition || '',
          record.handoverDetails?.notes || '',
          record.handoverDetails
            ? localDeadline(record.handoverDetails.expiresAt)
            : '',
        ])
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
      if (target === 4 && !record?.policyPreview) {
        setStep(2)
        setError('Xem và áp dụng chính sách của Model trước khi xác nhận.')
        return
      }
    }
    setError('')
    if (target === 2 && (!record || !record.policyPreview)) {
      await persist(false, false, 2, canMaintain)
    } else setStep(target)
  }
  async function refreshPolicies() {
    if (!record) return
    const [row, eq] = await Promise.all([
      api.assetM2<Registration>(`/equipment-registrations/${record.id}`),
      api.assetM2<Equipment>(`/equipment/${record.equipmentId}`),
    ])
    setRecord(currentPolicyPreview(row, eq))
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
      description="Khách hàng → thiết bị → chính sách của Model → xác nhận bàn giao."
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
          <section className="m1-card registration-step" aria-busy={busy}>
            <fieldset
              className="registration-content"
              disabled={(frozen && step !== 5) || busy}
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
                      Khách hàng:{' '}
                      {customer.value?.name || 'Khách hàng không xác định'}. Đổi
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
                    {!locationLocked && (
                      <label>
                        Tìm vị trí theo đường dẫn
                        <input
                          type="search"
                          value={locationQuery}
                          onChange={(e) => setLocationSearch({ siteId: form.siteId, text: e.target.value })}
                        />
                      </label>
                    )}
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
                    <label>
                      Hình thức bàn giao *
                      <select
                        aria-label="Hình thức bàn giao"
                        value={form.deliveryMethod}
                        disabled={frozen || busy || Boolean(record)}
                        onChange={(e) => {
                          field(
                            'deliveryMethod',
                            e.target.value as DeliveryMethod,
                          )
                          if (e.target.value === 'STORE') {
                            if (
                              (record || form.source === 'EXISTING') &&
                              (form.installationDate || form.commissionedDate)
                            )
                              setDatesDirty(true)
                            field('installationDate', '')
                            field('commissionedDate', '')
                          }
                        }}
                      >
                        <option value="">
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
                    <p className="registration-wide">
                      {form.deliveryMethod === 'STORE'
                        ? 'Bảo hành tính từ ngày bàn giao thực tế. Không cần lắp đặt hoặc khách xác nhận. Địa điểm đặt thiết bị vẫn là địa điểm của khách hàng.'
                        : 'Bảo hành và lịch bảo trì tính từ ngày bàn giao thực tế. Hồ sơ chỉ hoàn tất khi khách xác nhận; ngày lắp đặt và vận hành chưa có thì để trống.'}
                    </p>
                    {(
                      [
                        ['handoverDate', 'Ngày bàn giao thực tế'],
                        ['installationDate', 'Ngày lắp đặt'],
                        ['commissionedDate', 'Ngày đưa vào sử dụng'],
                      ] as const
                    )
                      .filter(
                        ([key]) =>
                          key === 'handoverDate' ||
                          form.deliveryMethod === 'CUSTOMER_SITE' ||
                          (record && !record.deliveryMethod),
                      )
                      .map(([key, label]) => (
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
                  {form.deliveryMethod === 'CUSTOMER_SITE' && (
                    <div className="registration-fields">
                      <label>
                        Tình trạng khi bàn giao *
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
                        Hạn khách xác nhận *
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
                          if (record)
                            setRecord({ ...record, policyPreview: null })
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
              {(step === 2 || step === 4) &&
                (record?.status === 'DRAFT' ||
                  record?.policyPreview ||
                  !record) && (
                  <>
                    {form.modelId && (
                      <p>
                        Model:{' '}
                        <strong>
                          {model.value?.name ||
                            model.value?.modelCode ||
                            'Đang tải…'}
                        </strong>{' '}
                        ·{' '}
                        <Link
                          to={`/app/equipment-models/${form.modelId}`}
                          state={{ registrationId: record?.id }}
                        >
                          Xem / cấu hình chính sách Model
                        </Link>
                      </p>
                    )}
                    {record ? (
                      <HandoverPolicyPanel
                        key={record.id}
                        id={record.id}
                        version={record.version}
                        status={record.status}
                        snapshot={record.policyPreview}
                        changed={refreshPolicies}
                        onBusyChange={setBusy}
                        showCompleteButton={false}
                        readOnly={record.status !== 'DRAFT'}
                      />
                    ) : (
                      <>
                        <h2>Áp dụng chính sách theo Model</h2>
                        <p>
                          Hệ thống tự lấy thời hạn bảo hành, điều khoản và các
                          lịch bảo trì từ Model đã chọn.
                        </p>
                        <button
                          type="button"
                          disabled={busy || !canMaintain}
                          onClick={() => void persist(false, false, 2, true)}
                        >
                          Lấy chính sách Model
                        </button>
                        {!canMaintain && (
                          <p>
                            Lưu nháp để Service Manager áp dụng chính sách và
                            xác nhận bàn giao.
                          </p>
                        )}
                      </>
                    )}
                  </>
                )}
              {step === 4 &&
                record &&
                record.status !== 'DRAFT' &&
                !record.policyPreview && (
                  <section>
                    <h2>Chính sách đã ghi nhận trước đây</h2>
                    <p>
                      Giữ nguyên điều khoản của hồ sơ bàn giao cũ. Thông tin
                      dưới đây chỉ để xem.
                    </p>
                    {form.warranty.terms && (
                      <p>Điều khoản bảo hành: {form.warranty.terms}</p>
                    )}
                    {form.maintenance.description && (
                      <p>Nội dung bảo trì: {form.maintenance.description}</p>
                    )}
                  </section>
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
                <>
                  <h2>Kiểm tra thông tin ghi nhận</h2>
                  <dl className="registration-summary">
                    <dt>Khách hàng</dt>
                    <dd>
                      {customer.value?.name || 'Khách hàng không xác định'}
                    </dd>
                    <dt>Địa điểm</dt>
                    <dd>
                      {sites.value?.find((row) => row.id === form.siteId)
                        ?.name || 'Địa điểm không xác định'}
                    </dd>
                    <dt>Máy</dt>
                    <dd>
                      {form.displayName || form.assetCode} · serial{' '}
                      {form.serialNumber}
                    </dd>
                    <dt>Hình thức</dt>
                    <dd>
                      {form.deliveryMethod === 'STORE'
                        ? 'Tại cửa hàng · nhân viên hoàn tất'
                        : form.deliveryMethod === 'CUSTOMER_SITE'
                          ? 'Tại cơ sở khách hàng · cần khách xác nhận'
                          : 'Hồ sơ cũ'}
                    </dd>
                    <dt>Bàn giao</dt>
                    <dd>{form.handoverDate || 'Chưa xác nhận'}</dd>
                    <dt>Bảo hành</dt>
                    <dd>
                      {record?.policyPreview
                        ? record.policyPreview.warranty.body.mode === 'NONE'
                          ? `Không áp dụng: ${record.policyPreview.warranty.body.reason}`
                          : `Model v${record.policyPreview.warranty.revision} · ${record.policyPreview.warranty.startDate} → ${record.policyPreview.warranty.endDate}`
                        : record?.status === 'DRAFT' || !record
                          ? 'Chưa áp dụng chính sách Model'
                          : form.warranty.mode === 'CREATE'
                            ? `${form.warranty.warrantyType} · ${form.warranty.startDate} → ${form.warranty.endDate}`
                            : form.warranty.mode === 'KEEP'
                              ? 'Giữ bản ghi bảo hành đã chọn'
                              : form.warranty.mode === 'NONE'
                                ? `Không áp dụng: ${form.warranty.reason}`
                                : 'Chưa xác định'}
                    </dd>
                    <dt>Bảo trì</dt>
                    <dd>
                      {record?.policyPreview
                        ? record.policyPreview.maintenance.body.mode === 'NONE'
                          ? `Không lập định kỳ: ${record.policyPreview.maintenance.body.reason}`
                          : `Model v${record.policyPreview.maintenance.revision} · ${record.policyPreview.maintenance.body.rules.length} lịch bảo trì`
                        : record?.status === 'DRAFT' || !record
                          ? 'Chưa áp dụng chính sách Model'
                          : form.maintenance.mode === 'CREATE'
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
                onClick={() => void goToStep(step === 4 ? 2 : step - 1)}
              >
                Quay lại
              </button>
              {step < 4 && (
                <button
                  disabled={busy}
                  onClick={() => void goToStep(step === 2 ? 4 : step + 1)}
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

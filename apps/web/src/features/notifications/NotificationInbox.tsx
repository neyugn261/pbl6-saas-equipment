import { useEffect, useState } from 'react'
import { Bell } from 'lucide-react'
import { Link } from 'react-router-dom'
import { ApiError, api } from '../../api/client'
import { getSessionGeneration, useSession } from '../../auth/session'
import type { Page } from '../../types/domain'
import { hideTechnicalIds, recordLabel } from '../../display-names'
import { useWorkspaceData } from '../workspace/workspace-data'

type Notification = {
  id: string
  eventType: string
  title: string
  body: string
  resourceType: 'SERVICE_REQUEST' | 'WORK_ORDER' | 'EQUIPMENT' | 'STOCK' | 'EQUIPMENT_HANDOVER' | null
  resourceId: string | null
  createdAt: string
  readAt: string | null
}
type ReadFilter = 'ALL' | 'UNREAD' | 'READ'

function errorText(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 401) return 'Phiên đăng nhập đã hết hạn. Đăng nhập lại để xem thông báo.'
    if (error.status === 403) return 'Tài khoản hiện không có quyền xem thông báo.'
    if (error.status === 404) return 'Thông báo không còn tồn tại trong phạm vi tài khoản.'
    return `${error.status} · ${error.message}`
  }
  return error instanceof Error ? error.message : 'Không thể tải thông báo.'
}

function resourcePath(item: Notification, customer: boolean): string | null {
  if (!item.resourceId) return null
  if (item.resourceType === 'EQUIPMENT_HANDOVER') return `${customer ? '/portal' : '/app'}/equipment-handovers/${item.resourceId}`
  if (item.resourceType === 'SERVICE_REQUEST') return `${customer ? '/portal/requests' : '/app/service-requests'}/${item.resourceId}`
  if (item.resourceType === 'WORK_ORDER') return customer ? null : `/app/work-orders/${item.resourceId}`
  if (item.resourceType === 'EQUIPMENT') return `${customer ? '/portal/equipment' : '/app/equipment'}/${item.resourceId}`
  if (item.resourceType === 'STOCK') return customer ? null : '/app/inventory/warehouses'
  return null
}

const resourceLabel: Record<NonNullable<Notification['resourceType']>, string> = {
  SERVICE_REQUEST: 'Yêu cầu dịch vụ',
  WORK_ORDER: 'Lệnh công việc',
  EQUIPMENT: 'Thiết bị',
  STOCK: 'Tồn kho',
  EQUIPMENT_HANDOVER: 'Hồ sơ bàn giao',
}

type Reference = {
  requestNo?: string
  workOrderNo?: string
  equipmentId?: string
  assetCode?: string
  displayName?: string | null
  title?: string
}

function NotificationResourceLink({ item, path, fallback }: { item: Notification; path: string; fallback: string }) {
  const id = encodeURIComponent(item.resourceId ?? '')
  const request = item.resourceType === 'SERVICE_REQUEST'
  const order = item.resourceType === 'WORK_ORDER'
  const source = useWorkspaceData<Reference>(
    order ? 'workorders' : 'requestsLive',
    order ? `/work-orders/${id}` : request ? `/service-requests/${id}` : null,
  ).data
  const equipmentId = item.resourceType === 'EQUIPMENT' ? item.resourceId : source?.equipmentId
  const equipment = useWorkspaceData<Reference>(
    'assetM2', equipmentId ? `/equipment/${encodeURIComponent(equipmentId)}` : null,
  ).data
  const label = recordLabel(
    source?.requestNo ?? source?.workOrderNo ?? equipment?.assetCode,
    equipment?.displayName ?? source?.title,
    `Mở ${fallback.toLocaleLowerCase('vi')}`,
  )
  return <Link to={path}>{label}</Link>
}

export function NotificationInbox() {
  const { profile } = useSession()
  const customer = profile?.userType === 'CUSTOMER'
  const sessionGeneration = getSessionGeneration()
  const [filter, setFilter] = useState<ReadFilter>('ALL')
  const [page, setPage] = useState(1)
  const [revision, setRevision] = useState(0)
  const [resultState, setResultState] = useState<{ key: string; result: Page<Notification> | null; error: string }>({
    key: '', result: null, error: '',
  })
  const [actionError, setActionError] = useState<{ generation: number; message: string } | null>(null)
  const [busyId, setBusyId] = useState('')
  const queryKey = `${page}:${filter}:${revision}:session-${sessionGeneration}`
  const loading = resultState.key !== queryKey
  const result = loading ? null : resultState.result
  const error = loading ? '' : resultState.error

  useEffect(() => {
    let active = true
    api.notifications<Page<Notification>>(
      `?page=${page}&pageSize=20&readStatus=${filter}`,
    ).then((value) => {
      if (active) {
        setResultState({ key: queryKey, result: value, error: '' })
      }
    }, (cause: unknown) => {
      if (active) {
        setResultState({ key: queryKey, result: null, error: errorText(cause) })
      }
    })
    return () => { active = false }
  }, [filter, page, revision, sessionGeneration, queryKey])

  async function markRead(id: string) {
    const operationGeneration = getSessionGeneration()
    setBusyId(id)
    setActionError(null)
    try {
      await api.notifications<Notification>(`/${encodeURIComponent(id)}/read`, { method: 'PATCH' })
      if (getSessionGeneration() !== operationGeneration) return
      setRevision((value) => value + 1)
      window.dispatchEvent(new Event('pbl6:notifications-changed'))
    } catch (cause) {
      if (getSessionGeneration() !== operationGeneration) return
      setActionError({ generation: operationGeneration, message: errorText(cause) })
      if (cause instanceof ApiError && cause.status === 409) setRevision((value) => value + 1)
    } finally {
      setBusyId('')
    }
  }

  return (
    <div className="m2-page">
      <h1>Thông báo</h1><p>Theo dõi cập nhật liên quan đến công việc, yêu cầu dịch vụ và bàn giao thiết bị.</p>
      <label>Lọc
        <select value={filter} onChange={(event) => { setFilter(event.target.value as ReadFilter); setPage(1) }}>
          <option value="ALL">Tất cả</option>
          <option value="UNREAD">Chưa đọc</option>
          <option value="READ">Đã đọc</option>
        </select>
      </label>
      {error && <section className="m1-card sd-notification-state" role="alert"><h2>Chưa thể hiển thị thông báo</h2><p>{error}</p><button onClick={() => setRevision(v => v + 1)}>Thử tải lại</button></section>}
      {actionError?.generation === sessionGeneration && <p className="m1-error" role="alert">{actionError.message}</p>}
      {loading ? <p role="status">Đang tải thông báo…</p>
        : error ? null
        : result && result.items.length === 0 ? <section className="m1-card sd-notification-state"><h2>Chưa có thông báo phù hợp</h2><p>Các cập nhật sẽ xuất hiện tại đây khi có sự kiện trong phạm vi tài khoản. Thử chọn “Tất cả” để xem các thông báo đã đọc.</p></section>
          : <ul className="m2-linked-list">
              {result?.items.map((item) => {
                const path = resourcePath(item, customer)
                const label = item.resourceType ? resourceLabel[item.resourceType] : 'Hồ sơ liên quan'
                const title = hideTechnicalIds(item.title) || label
                const body = hideTechnicalIds(item.body, 'hồ sơ liên quan')
                return <li key={item.id}>
                  <span>
                    <strong>{title}</strong>
                    {body && <p>{body}</p>}
                    <small>{new Date(item.createdAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}</small>
                  </span>
                  <span>
                    {path && <NotificationResourceLink item={item} path={path} fallback={label} />}
                    {!item.readAt && <button disabled={busyId === item.id} onClick={() => void markRead(item.id)}>Đánh dấu đã đọc</button>}
                    {item.readAt && <small>Đã đọc</small>}
                  </span>
                </li>
              })}
            </ul>}
      {result && result.total > result.pageSize && (
        <div className="registration-pagination">
          <button disabled={loading || page <= 1} onClick={() => setPage((value) => value - 1)}>Trước</button>
          <span>Trang {page} · {result.total} thông báo</span>
          <button disabled={loading || page * result.pageSize >= result.total} onClick={() => setPage((value) => value + 1)}>Sau</button>
        </div>
      )}
    </div>
  )
}

export function NotificationBell({ href }: { href: string }) {
  const sessionGeneration = getSessionGeneration()
  const [count, setCount] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [countGeneration, setCountGeneration] = useState(-1)

  useEffect(() => {
    let active = true
    const update = () => {
      api.notifications<{ unreadCount: number }>('/unread-count').then(
        (value) => {
          if (active) { setCount(value.unreadCount); setCountGeneration(sessionGeneration); setError('') }
        },
        (cause: unknown) => {
          if (active) { setCount(null); setCountGeneration(sessionGeneration); setError(errorText(cause)) }
        },
      )
    }
    update()
    window.addEventListener('pbl6:notifications-changed', update)
    return () => {
      active = false
      window.removeEventListener('pbl6:notifications-changed', update)
    }
  }, [sessionGeneration])

  const visibleCount = countGeneration === sessionGeneration ? count : null
  return <Link className="m1-topbar-icon notification-bell" to={href} aria-label={
    countGeneration === sessionGeneration && error ? `Thông báo; không tải được số chưa đọc: ${error}` :
      visibleCount === null ? 'Thông báo; số chưa đọc chưa tải được' : `Thông báo chưa đọc: ${visibleCount}`
  }>
    <Bell size={18} />
    {visibleCount !== null && visibleCount > 0 && <span className="notification-bell__count">{visibleCount > 99 ? '99+' : visibleCount}</span>}
  </Link>
}

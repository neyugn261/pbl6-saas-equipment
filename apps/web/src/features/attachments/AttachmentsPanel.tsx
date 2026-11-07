import { useEffect, useState } from 'react'
import { ApiError, api } from '../../api/client'
import { getSessionGeneration, useSession } from '../../auth/session'
import type { Page } from '../../types/domain'

type Visibility = 'INTERNAL' | 'CUSTOMER'
type Attachment = {
  id: string
  uploadedBy?: string
  fileName: string
  mimeType: string
  sizeBytes: number
  visibility?: Visibility
  createdAt: string
}
type UploadTicket = {
  uploadId: string
  method: 'PUT'
  uploadUrl: string
  headers: Record<string, string>
  expiresAt: string
}
type Props =
  | { kind: 'WORK_ORDER'; workOrderId: string }
  | { kind: 'SERVICE_REPORT'; workOrderId: string }
  | { kind: 'SERVICE_REQUEST_RESULT'; requestId: string }

const maxBytes = 10 * 1024 * 1024
const mimeTypes = new Set(['image/jpeg', 'image/png', 'application/pdf'])

function apiMessage(error: unknown): string {
  if (!(error instanceof ApiError)) {
    return error instanceof Error ? error.message : 'Không thể hoàn tất thao tác.'
  }
  switch (error.status) {
    case 401:
      return 'Phiên đăng nhập cần được làm mới. Hãy tải lại danh sách trước khi thử lại thao tác.'
    case 403:
      return 'Tài khoản không có quyền thực hiện thao tác này.'
    case 404:
      return 'Không tìm thấy Work Order, báo cáo hoặc tệp đính kèm.'
    case 409:
      return `Xung đột trạng thái (${error.code}). Tải lại dữ liệu trước khi thử lại.`
    case 413:
      return 'File vượt quá giới hạn 10 MiB.'
    case 415:
      return 'Chỉ hỗ trợ JPEG, PNG và PDF.'
    case 422:
      return 'Backend không xác minh được kích thước, loại file hoặc checksum.'
    default:
      return `${error.status} · ${error.message}`
  }
}

function listPath(props: Props, page: number) {
  const query = `?page=${page}&pageSize=20`
  if (props.kind === 'WORK_ORDER')
    return `/work-orders/${encodeURIComponent(props.workOrderId)}/attachments${query}`
  if (props.kind === 'SERVICE_REPORT')
    return `/work-orders/${encodeURIComponent(props.workOrderId)}/service-report/attachments${query}`
  return `/service-requests/${encodeURIComponent(props.requestId)}/result/attachments${query}`
}

async function checksum(file: File): Promise<string> {
  if (!globalThis.crypto?.subtle)
    throw new Error('Trình duyệt không hỗ trợ tính SHA-256 an toàn.')
  const bytes = await file.arrayBuffer()
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('')
}
function expired(expiresAt: string) {
  const timestamp = Date.parse(expiresAt)
  return !Number.isFinite(timestamp) || timestamp <= Date.now()
}

function preparePath(props: Props) {
  if (props.kind === 'WORK_ORDER')
    return `/work-orders/${encodeURIComponent(props.workOrderId)}/attachment-uploads`
  if (props.kind === 'SERVICE_REPORT')
    return `/work-orders/${encodeURIComponent(props.workOrderId)}/service-report/attachment-uploads`
  return null
}

export function AttachmentsPanel(props: Props) {
  const { profile } = useSession()
  const sessionGeneration = getSessionGeneration()
  const canManage = Boolean(profile?.roles.includes('SERVICE_MANAGER'))
  const [page, setPage] = useState(1)
  const [revision, setRevision] = useState(0)
  const [listState, setListState] = useState<{ key: string; rows: Attachment[]; total: number; error: string }>(
    { key: '', rows: [], total: 0, error: '' },
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [errorGeneration, setErrorGeneration] = useState(-1)
  const [visibility, setVisibility] = useState<Visibility>('INTERNAL')
  const [pendingFinalize, setPendingFinalize] = useState<{
    uploadId: string
    idempotencyKey: string
    generation: number
  } | null>(null)
  const uploadPath = preparePath(props)
  const isRequestResult = props.kind === 'SERVICE_REQUEST_RESULT'
  const path = listPath(props, page)
  const queryKey = `${path}:revision-${revision}:session-${sessionGeneration}`
  const listLoading = listState.key !== queryKey
  const rows = listLoading ? [] : listState.rows
  const total = listLoading ? 0 : listState.total

  useEffect(() => {
    let active = true
    const request = isRequestResult
      ? api.requestsLive<Page<Attachment>>(path)
      : api.workorders<Page<Attachment>>(path)
    request.then((result) => {
      if (active) {
        setListState({ key: queryKey, rows: result.items, total: result.total, error: '' })
      }
    }, (cause: unknown) => {
      if (active) {
        setListState({ key: queryKey, rows: [], total: 0, error: apiMessage(cause) })
      }
    })
    return () => { active = false }
  }, [path, isRequestResult, queryKey])

  async function upload(file?: File) {
    if (!file || pendingFinalize?.generation === getSessionGeneration()) return
    const path = preparePath(props)
    if (!path) return
    if (!mimeTypes.has(file.type)) {
      reportError('Chỉ hỗ trợ JPEG, PNG và PDF.')
      return
    }
    if (file.size < 1 || file.size > maxBytes) {
      reportError('Kích thước file phải từ 1 byte đến 10 MiB.')
      return
    }

    const uploadGeneration = getSessionGeneration()
    setBusy(true)
    setError('')
    setErrorGeneration(uploadGeneration)
    let ticket: UploadTicket | undefined
    let putSucceeded = false
    let finalizeKey: string | undefined
    try {
      ticket = await api.workorders<UploadTicket>(path, {
        method: 'POST',
        headers: { 'Idempotency-Key': crypto.randomUUID() },
        body: {
          fileName: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
          checksumSha256: await checksum(file),
          visibility: canManage ? visibility : 'INTERNAL',
        },
      })
      if (getSessionGeneration() !== uploadGeneration)
        throw new ApiError(409, 'SESSION_CHANGED', 'Phiên đăng nhập đã thay đổi.')
      const signedUrl = new URL(ticket.uploadUrl)
      if (
        ticket.method !== 'PUT' ||
        !['http:', 'https:'].includes(signedUrl.protocol) ||
        signedUrl.username ||
        signedUrl.password ||
        expired(ticket.expiresAt) ||
        Object.keys(ticket.headers).some((name) => name.toLowerCase() === 'authorization')
      ) {
        throw new Error('Backend trả về upload ticket không hợp lệ hoặc đã hết hạn.')
      }

      const response = await fetch(ticket.uploadUrl, {
        method: ticket.method,
        headers: ticket.headers,
        body: file,
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
      })
      if (!response.ok) throw new Error(`MinIO PUT thất bại: HTTP ${response.status}.`)
      putSucceeded = true
      if (getSessionGeneration() !== uploadGeneration)
        throw new ApiError(409, 'SESSION_CHANGED', 'Phiên đăng nhập đã thay đổi.')

      finalizeKey = crypto.randomUUID()
      await api.workorders<Attachment>(
        `/attachment-uploads/${encodeURIComponent(ticket.uploadId)}/complete`,
        {
          method: 'POST',
          headers: { 'Idempotency-Key': finalizeKey },
          body: {},
        },
      )
      if (getSessionGeneration() !== uploadGeneration) return
      setPendingFinalize(null)
      setRevision((value) => value + 1)
    } catch (cause) {
      if (getSessionGeneration() !== uploadGeneration) return
      let cleanupFailure: unknown
      if (ticket && !putSucceeded) {
        try {
          await api.workorders<void>(
            `/attachment-uploads/${encodeURIComponent(ticket.uploadId)}`,
            { method: 'DELETE' },
          )
        } catch (abortError) {
          cleanupFailure = abortError
        }
      }
      if (getSessionGeneration() !== uploadGeneration) return
      if (ticket && putSucceeded && finalizeKey)
        setPendingFinalize({ uploadId: ticket.uploadId, idempotencyKey: finalizeKey, generation: uploadGeneration })
      const failure = putSucceeded
        ? `PUT đã hoàn tất nhưng finalize chưa được xác nhận. Dùng “Kiểm tra và lưu tệp lại” cùng operation hoặc dọn upload. ${apiMessage(cause)}`
        : apiMessage(cause)
      setError(cleanupFailure
        ? `${failure} Hủy tệp đang chờ tạm cũng thất bại: ${apiMessage(cleanupFailure)}`
        : failure)
      setErrorGeneration(uploadGeneration)
    } finally {
      setBusy(false)
    }
  }

  async function retryFinalize() {
    if (!pendingFinalize || pendingFinalize.generation !== getSessionGeneration()) return
    const operation = pendingFinalize
    setBusy(true)
    setError('')
    try {
      await api.workorders<Attachment>(
        `/attachment-uploads/${encodeURIComponent(operation.uploadId)}/complete`,
        {
          method: 'POST',
          headers: { 'Idempotency-Key': operation.idempotencyKey },
          body: {},
        },
      )
      if (getSessionGeneration() !== operation.generation) return
      setPendingFinalize(null)
      setRevision((value) => value + 1)
    } catch (cause) {
      if (getSessionGeneration() !== operation.generation) return
      setError(`${apiMessage(cause)} Có thể thử lại cùng operation hoặc dọn upload.`)
      setErrorGeneration(operation.generation)
      if (cause instanceof ApiError && cause.status === 409) setRevision((value) => value + 1)
    } finally {
      setBusy(false)
    }
  }

  async function deletePendingUpload() {
    if (!pendingFinalize || pendingFinalize.generation !== getSessionGeneration()) return
    const operation = pendingFinalize
    setBusy(true)
    setError('')
    try {
      await api.workorders<void>(
        `/attachment-uploads/${encodeURIComponent(operation.uploadId)}`,
        { method: 'DELETE' },
      )
      if (getSessionGeneration() !== operation.generation) return
      setPendingFinalize(null)
      setRevision((value) => value + 1)
    } catch (cause) {
      if (getSessionGeneration() !== operation.generation) return
      setError(`${apiMessage(cause)} Nếu finalize đã commit, tải lại danh sách tệp.`)
      setErrorGeneration(operation.generation)
      if (cause instanceof ApiError && cause.status === 409) setRevision((value) => value + 1)
    } finally {
      setBusy(false)
    }
  }

  async function download(attachmentId: string) {
    const operationGeneration = getSessionGeneration()
    setBusy(true)
    setError('')
    setErrorGeneration(operationGeneration)
    try {
      const path = props.kind === 'SERVICE_REQUEST_RESULT'
        ? `/service-requests/${encodeURIComponent(props.requestId)}/result/attachments/${encodeURIComponent(attachmentId)}/download`
        : `/attachments/${encodeURIComponent(attachmentId)}/download`
      const ticket = props.kind === 'SERVICE_REQUEST_RESULT'
        ? await api.requestsLive<{ downloadUrl: string; expiresAt: string }>(path)
        : await api.workorders<{ downloadUrl: string; expiresAt: string }>(path)
      if (getSessionGeneration() !== operationGeneration)
        throw new ApiError(409, 'SESSION_CHANGED', 'Phiên đăng nhập đã thay đổi.')
      const url = new URL(ticket.downloadUrl)
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
        expired(ticket.expiresAt)) {
        throw new Error('Download ticket không hợp lệ hoặc đã hết hạn.')
      }
      window.location.assign(ticket.downloadUrl)
    } catch (cause) {
      setError(apiMessage(cause))
      setErrorGeneration(operationGeneration)
    } finally {
      setBusy(false)
    }
  }

  async function changeAttachment(attachmentId: string, method: 'PATCH' | 'DELETE', body?: unknown) {
    const operationGeneration = getSessionGeneration()
    setBusy(true)
    setError('')
    setErrorGeneration(operationGeneration)
    try {
      await api.workorders<void>(`/attachments/${encodeURIComponent(attachmentId)}`, { method, body })
      if (getSessionGeneration() !== operationGeneration) return
      setRevision((value) => value + 1)
    } catch (cause) {
      if (getSessionGeneration() !== operationGeneration) return
      setError(apiMessage(cause))
      setErrorGeneration(operationGeneration)
      if (cause instanceof ApiError && cause.status === 409) setRevision((value) => value + 1)
    } finally {
      setBusy(false)
    }
  }

  function reportError(message: string) {
    setError(message)
    setErrorGeneration(getSessionGeneration())
  }

  return (
    <section className="m1-card m1-section-card">
      <div className="m1-section-header"><h2>Tệp đính kèm</h2></div>
      <div className="m1-section-body">
        {error && errorGeneration === sessionGeneration && <p className="m1-error" role="alert">{error}</p>}
        {uploadPath && (
          <div className="m2-editor">
            {canManage && <label>Hiển thị
              <select value={visibility} onChange={(event) => setVisibility(event.target.value as Visibility)}>
                <option value="INTERNAL">Nội bộ</option>
                <option value="CUSTOMER">Khách hàng</option>
              </select>
            </label>}
            <label>Chọn file
              <input
                type="file"
                accept="image/jpeg,image/png,application/pdf"
                disabled={busy || pendingFinalize?.generation === sessionGeneration}
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0]
                  event.currentTarget.value = ''
                  void upload(file)
                }}
              />
            </label>
            <p>JPEG, PNG hoặc PDF; tối đa 10 MB. Tệp được hiển thị sau khi hệ thống kiểm tra và lưu thành công.</p>
            {pendingFinalize?.generation === sessionGeneration && (
              <div role="status">
                Tệp đã tải lên đang chờ xác nhận lưu vào hồ sơ.
                <button disabled={busy} onClick={() => void retryFinalize()}>Kiểm tra và lưu tệp lại</button>
                <button disabled={busy} onClick={() => void deletePendingUpload()}>Hủy tệp đang chờ</button>
              </div>
            )}
          </div>
        )}
        {listLoading ? <p role="status">Đang tải tệp…</p> : listState.error ? <p role="alert" className="m1-error">{listState.error}</p> : rows.length === 0
          ? <p>Chưa có tệp được công bố trong phạm vi này.</p>
          : <ul className="m2-linked-list">
              {rows.map((row) => (
                <li key={row.id}>
                  <span><strong>{row.fileName}</strong> · {row.mimeType} · {row.sizeBytes} byte
                    {row.visibility ? ` · ${row.visibility === 'CUSTOMER' ? 'Khách hàng' : 'Nội bộ'}` : ''}
                  </span>
                  <span>
                    <button disabled={busy} onClick={() => void download(row.id)}>Tải xuống</button>
                    {props.kind !== 'SERVICE_REQUEST_RESULT' && canManage && (
                      <>
                        <button disabled={busy} onClick={() => void changeAttachment(row.id, 'PATCH', {
                          visibility: row.visibility === 'CUSTOMER' ? 'INTERNAL' : 'CUSTOMER',
                        })}>
                          {row.visibility === 'CUSTOMER' ? 'Ẩn với khách' : 'Công bố cho khách'}
                        </button>
                      </>
                    )}
                    {props.kind !== 'SERVICE_REQUEST_RESULT' &&
                      (canManage || row.uploadedBy === profile?.id) && (
                        <button disabled={busy} onClick={() => {
                          if (window.confirm(`Xóa tệp "${row.fileName}"?`))
                            void changeAttachment(row.id, 'DELETE')
                        }}>Xóa</button>
                      )}
                  </span>
                </li>
              ))}
            </ul>}
        {!listLoading && !listState.error && total > 20 && (
          <div className="registration-pagination">
            <button disabled={page <= 1 || busy} onClick={() => setPage((value) => value - 1)}>Trước</button>
            <span>Trang {page} · {total} tệp</span>
            <button disabled={page * 20 >= total || busy} onClick={() => setPage((value) => value + 1)}>Sau</button>
          </div>
        )}
      </div>
    </section>
  )
}

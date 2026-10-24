import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import {
  Link,
  Navigate,
  Route,
  Routes,
  useNavigate,
  useParams,
} from 'react-router-dom'
import { api, ApiError, isMockMode } from './api/client'
import { creators, has, home, menu } from './auth/access'
import {
  login,
  logout,
  restoreSession,
  SessionProvider,
  useSession,
} from './auth/session'
import type {
  CustomerRecord,
  EquipmentRecord,
  Page,
  RequestComment,
  RequestDetail,
  RequestRecord,
  RequestStatusChange,
  TenantRecord,
} from './types/domain'
import './App.css'

const actionLabels: Record<string, string> = {
  review: 'Xét duyệt & kiểm tra bảo hành',
  'request-info': 'Yêu cầu bổ sung',
  'warranty-check': 'Kiểm tra bảo hành',
  accept: 'Tiếp nhận',
  reject: 'Từ chối',
  cancel: 'Hủy yêu cầu',
  confirm: 'Xác nhận hoàn tất',
  reopen: 'Mở lại',
}
function Problem({ error }: { error: unknown }) {
  return (
    <p className="m1-error" role="alert">
      {error instanceof ApiError
        ? `${error.status} · ${error.message}`
        : error instanceof Error
          ? error.message
          : 'Không thể tải dữ liệu.'}
    </p>
  )
}
function Loading() {
  return <p role="status">Đang tải…</p>
}
function Empty() {
  return <p>Chưa có dữ liệu.</p>
}
function Gate({ roles, children }: { roles: string[]; children: ReactNode }) {
  const { profile } = useSession()
  return profile && has(profile.roles, roles) ? (
    children
  ) : (
    <Navigate to="/403" replace />
  )
}

function LoginPage() {
  const { profile, setProfile } = useSession()
  const navigate = useNavigate()
  const [tenantCode, setTenantCode] = useState('DEMO')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [platform, setPlatform] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [busy, setBusy] = useState(false)
  if (profile) return <Navigate to={home(profile.roles)} replace />
  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const user = await login({
        email,
        password,
        ...(platform ? {} : { tenantCode }),
      })
      setProfile(user)
      navigate(home(user.roles), { replace: true })
    } catch (cause) {
      setError(cause)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="m1-login">
      <form className="m1-card m1-form" onSubmit={submit}>
        <h1>Đăng nhập</h1>
        <p>Quản lý thiết bị và yêu cầu dịch vụ.</p>
        {error ? <Problem error={error} /> : null}
        <label>
          <input
            type="checkbox"
            checked={platform}
            onChange={(event) => setPlatform(event.target.checked)}
          />{' '}
          Tài khoản nền tảng
        </label>
        {!platform && (
          <label>
            Mã doanh nghiệp
            <input
              required
              value={tenantCode}
              onChange={(event) => setTenantCode(event.target.value)}
            />
          </label>
        )}
        <label>
          Email
          <input
            required
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <label>
          Mật khẩu
          <input
            required
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        <button disabled={busy}>
          {busy ? 'Đang đăng nhập…' : 'Đăng nhập'}
        </button>
      </form>
    </div>
  )
}
function Layout({ children }: { children: ReactNode }) {
  const { profile, clear } = useSession()
  const navigate = useNavigate()
  if (!profile) return null
  return (
    <div className="m1-layout">
      <aside className="m1-sidebar">
        <Link to={home(profile.roles)} className="m1-brand">
          PBL6 · Field Service
        </Link>
        <nav>
          {menu
            .filter((item) => has(profile.roles, item.roles))
            .map((item) => (
              <Link key={item.path} to={item.path}>
                {item.label}
              </Link>
            ))}
        </nav>
        <div className="m1-account">
          <strong>{profile.fullName}</strong>
          <small>{profile.roles.join(', ')}</small>
          <button
            onClick={async () => {
              await logout()
              clear()
              navigate('/login')
            }}
          >
            Đăng xuất
          </button>
        </div>
      </aside>
      <main className="m1-main">
        {isMockMode && (
          <p className="m1-mock-notice">
            Đang xem dữ liệu mẫu từ OpenAPI. Các thay đổi trên mock server không
            được lưu.
          </p>
        )}
        {children}
      </main>
    </div>
  )
}
function useLoad<T>(load: () => Promise<T>, key: string) {
  const [state, setState] = useState<{
    key: string
    value: T | null
    error: unknown
  }>({ key: '', value: null, error: null })
  useEffect(() => {
    let active = true
    load()
      .then((value) => {
        if (active) setState({ key, value, error: null })
      })
      .catch((error) => {
        if (active) setState({ key, value: null, error })
      })
    return () => {
      active = false
    }
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps
  return {
    value: state.key === key ? state.value : null,
    error: state.key === key ? state.error : null,
    loading: state.key !== key,
  }
}
function Frame({
  title,
  action,
  children,
}: {
  title: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <>
      <header className="m1-header">
        <h1>{title}</h1>
        {action}
      </header>
      {children}
    </>
  )
}
function DateText({ value }: { value: string }) {
  return (
    <>
      {new Intl.DateTimeFormat('vi-VN', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'Asia/Ho_Chi_Minh',
      }).format(new Date(value))}
    </>
  )
}

function CustomersPage() {
  const data = useLoad<Page<CustomerRecord>>(
    () => api.organization('/customers?page=1&pageSize=100'),
    'customers',
  )
  return (
    <Frame title="Khách hàng">
      {data.loading ? (
        <Loading />
      ) : data.error ? (
        <Problem error={data.error} />
      ) : !data.value?.items.length ? (
        <Empty />
      ) : (
        <div className="m1-card">
          <table>
            <thead>
              <tr>
                <th>Mã</th>
                <th>Tên</th>
                <th>Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {data.value.items.map((item) => (
                <tr key={item.id}>
                  <td>
                    <Link to={`/customers/${item.id}`}>{item.code}</Link>
                  </td>
                  <td>{item.name}</td>
                  <td>{item.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <small>
            {Math.max(data.value.total, data.value.items.length)} khách hàng
          </small>
        </div>
      )}
    </Frame>
  )
}
function TenantsPage() {
  const data = useLoad<Page<TenantRecord>>(
    () => api.organization('/tenants?page=1&pageSize=100'),
    'tenants',
  )
  return (
    <Frame title="Doanh nghiệp">
      {data.loading ? (
        <Loading />
      ) : data.error ? (
        <Problem error={data.error} />
      ) : !data.value?.items.length ? (
        <Empty />
      ) : (
        <div className="m1-card">
          <table>
            <thead>
              <tr>
                <th>Mã</th>
                <th>Tên</th>
                <th>Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {data.value.items.map((item) => (
                <tr key={item.id}>
                  <td>{item.code}</td>
                  <td>{item.name}</td>
                  <td>{item.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <small>
            {Math.max(data.value.total, data.value.items.length)} doanh nghiệp
          </small>
        </div>
      )}
    </Frame>
  )
}
function CustomerDetailPage() {
  const { id } = useParams()
  const data = useLoad<CustomerRecord>(
    () => api.organization(`/customers/${id}`),
    id ?? '',
  )
  return (
    <Frame title={data.value?.name ?? 'Khách hàng'}>
      {data.loading ? (
        <Loading />
      ) : data.error ? (
        <Problem error={data.error} />
      ) : (
        data.value && (
          <div className="m1-card">
            <dl>
              <dt>Mã</dt>
              <dd>{data.value.code}</dd>
              <dt>Trạng thái</dt>
              <dd>{data.value.status}</dd>
              <dt>Email</dt>
              <dd>{data.value.email ?? '—'}</dd>
              <dt>Điện thoại</dt>
              <dd>{data.value.phone ?? '—'}</dd>
              <dt>Địa chỉ</dt>
              <dd>{data.value.address ?? '—'}</dd>
            </dl>
          </div>
        )
      )}
    </Frame>
  )
}
function EquipmentPage() {
  const data = useLoad<Page<EquipmentRecord>>(
    () => api.asset('/equipment?page=1&pageSize=100'),
    'equipment',
  )
  return (
    <Frame title="Thiết bị">
      {data.loading ? (
        <Loading />
      ) : data.error ? (
        <Problem error={data.error} />
      ) : !data.value?.items.length ? (
        <Empty />
      ) : (
        <div className="m1-card">
          <table>
            <thead>
              <tr>
                <th>Mã tài sản</th>
                <th>Số sê-ri</th>
                <th>Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {data.value.items.map((item) => (
                <tr key={item.id}>
                  <td>
                    <Link to={`/equipment/${item.id}`}>{item.assetCode}</Link>
                  </td>
                  <td>{item.serialNumber}</td>
                  <td>{item.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <small>
            {Math.max(data.value.total, data.value.items.length)} thiết bị
          </small>
        </div>
      )}
    </Frame>
  )
}
function EquipmentDetailPage() {
  const { id } = useParams()
  const data = useLoad<EquipmentRecord>(
    () => api.asset(`/equipment/${id}`),
    id ?? '',
  )
  return (
    <Frame title={data.value?.assetCode ?? 'Thiết bị'}>
      {data.loading ? (
        <Loading />
      ) : data.error ? (
        <Problem error={data.error} />
      ) : (
        data.value && (
          <div className="m1-card">
            <dl>
              <dt>Model</dt>
              <dd>{data.value.model?.name ?? data.value.modelId}</dd>
              <dt>Số sê-ri</dt>
              <dd>{data.value.serialNumber}</dd>
              <dt>Trạng thái</dt>
              <dd>{data.value.status}</dd>
              <dt>Bảo hành</dt>
              <dd>{data.value.warranty?.result ?? 'Chưa có thông tin'}</dd>
              <dt>Ngày bàn giao</dt>
              <dd>{data.value.handoverDate ?? '—'}</dd>
            </dl>
          </div>
        )
      )}
    </Frame>
  )
}
function RequestsPage() {
  const { profile } = useSession()
  const data = useLoad<Page<RequestRecord>>(
    () => api.requests('/service-requests?page=1&pageSize=100'),
    'requests',
  )
  return (
    <Frame
      title="Yêu cầu dịch vụ"
      action={
        profile && has(profile.roles, creators) ? (
          <Link className="m1-button" to="/requests/new">
            Tạo yêu cầu
          </Link>
        ) : null
      }
    >
      {data.loading ? (
        <Loading />
      ) : data.error ? (
        <Problem error={data.error} />
      ) : !data.value?.items.length ? (
        <Empty />
      ) : (
        <div className="m1-card">
          <table>
            <thead>
              <tr>
                <th>Mã</th>
                <th>Tiêu đề</th>
                <th>Ưu tiên</th>
                <th>Trạng thái</th>
                <th>Ngày tạo</th>
              </tr>
            </thead>
            <tbody>
              {data.value.items.map((item) => (
                <tr key={item.id}>
                  <td>
                    <Link to={`/requests/${item.id}`}>{item.requestNo}</Link>
                  </td>
                  <td>{item.title}</td>
                  <td>{item.priority}</td>
                  <td>{item.status}</td>
                  <td>
                    <DateText value={item.createdAt} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <small>
            {Math.max(data.value.total, data.value.items.length)} yêu cầu
          </small>
        </div>
      )}
    </Frame>
  )
}
function RequestActivity({ id, version }: { id: string; version: number }) {
  const history = useLoad<RequestStatusChange[]>(
    () => api.requests(`/service-requests/${id}/history`),
    `history-${id}-${version}`,
  )
  const comments = useLoad<RequestComment[]>(
    () => api.requests(`/service-requests/${id}/comments`),
    `comments-${id}-${version}`,
  )
  return (
    <div className="m1-activity">
      <section>
        <h3>Lịch sử trạng thái</h3>
        {history.loading ? (
          <Loading />
        ) : history.error ? (
          <Problem error={history.error} />
        ) : !history.value?.length ? (
          <Empty />
        ) : (
          <ul>
            {history.value.map((item) => (
              <li key={item.id}>
                <strong>{item.newStatus}</strong> ·{' '}
                <DateText value={item.changedAt} />
                {item.reason && <p>{item.reason}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>
      <section>
        <h3>Bình luận</h3>
        {comments.loading ? (
          <Loading />
        ) : comments.error ? (
          <Problem error={comments.error} />
        ) : !comments.value?.length ? (
          <Empty />
        ) : (
          <ul>
            {comments.value.map((item) => (
              <li key={item.id}>
                <strong>{item.visibility}</strong> ·{' '}
                <DateText value={item.createdAt} />
                <p>{item.content}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
function RequestDetailPage() {
  const { id } = useParams()
  const { profile } = useSession()
  const data = useLoad<RequestDetail>(
    () => api.requests(`/service-requests/${id}`),
    id ?? '',
  )
  const [override, setOverride] = useState<RequestDetail | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [busy, setBusy] = useState(false)
  const [version, setVersion] = useState(0)
  const [comment, setComment] = useState('')
  const [visibility, setVisibility] = useState<'CUSTOMER' | 'INTERNAL'>(
    'CUSTOMER',
  )
  const current = override?.id === data.value?.id ? override : data.value
  async function run(action: string) {
    if (!current) return
    const required = ['reject', 'request-info', 'reopen'].includes(action)
    const optional = action === 'cancel'
    const reason = required || optional ? window.prompt('Lý do') : null
    if (required && !reason?.trim()) return
    if (optional && reason === null) return
    setBusy(true)
    setError(null)
    try {
      await api.requests(`/service-requests/${current.id}/${action}`, {
        method: 'POST',
        ...(reason ? { body: { reason } } : {}),
      })
      setOverride(await api.requests(`/service-requests/${current.id}`))
      setVersion((value) => value + 1)
    } catch (cause) {
      setError(cause)
    } finally {
      setBusy(false)
    }
  }
  async function addComment(event: FormEvent) {
    event.preventDefault()
    if (!current || !comment.trim()) return
    setBusy(true)
    setError(null)
    try {
      await api.requests(`/service-requests/${current.id}/comments`, {
        method: 'POST',
        body: {
          content: comment.trim(),
          visibility:
            profile?.userType === 'CUSTOMER' ? 'CUSTOMER' : visibility,
        },
      })
      setComment('')
      setOverride(await api.requests(`/service-requests/${current.id}`))
      setVersion((value) => value + 1)
    } catch (cause) {
      setError(cause)
    } finally {
      setBusy(false)
    }
  }
  const actions = [
    'review',
    'request-info',
    'warranty-check',
    'accept',
    'reject',
    'cancel',
    'confirm',
    'reopen',
  ]
  return (
    <Frame title={current?.requestNo ?? 'Yêu cầu dịch vụ'}>
      {data.loading ? (
        <Loading />
      ) : data.error ? (
        <Problem error={data.error} />
      ) : (
        current && (
          <div className="m1-card">
            <h2>{current.title}</h2>
            <p>{current.description}</p>
            <dl>
              <dt>Trạng thái</dt>
              <dd>{current.status}</dd>
              <dt>Loại</dt>
              <dd>{current.type}</dd>
              <dt>Ưu tiên</dt>
              <dd>{current.priority}</dd>
              <dt>Bảo hành</dt>
              <dd>{current.warrantyCheck?.result ?? 'Chưa kiểm tra'}</dd>
              <dt>Thiết bị</dt>
              <dd>
                <Link to={`/equipment/${current.equipmentId}`}>
                  {current.equipmentId}
                </Link>
              </dd>
            </dl>
            {error ? <Problem error={error} /> : null}
            <div className="m1-actions">
              {current.allowedActions
                ?.filter((action) => actions.includes(action))
                .map((action) => (
                  <button
                    disabled={busy}
                    key={action}
                    onClick={() => run(action)}
                  >
                    {actionLabels[action] ?? action}
                  </button>
                ))}
            </div>
            <RequestActivity id={current.id} version={version} />
            <form className="m1-comment" onSubmit={addComment}>
              <h3>Thêm bình luận</h3>
              <textarea
                required
                maxLength={5000}
                rows={3}
                value={comment}
                onChange={(event) => setComment(event.target.value)}
              />
              {profile?.userType !== 'CUSTOMER' &&
                profile &&
                has(profile.roles, [
                  'SERVICE_MANAGER',
                  'DISPATCHER',
                  'TECHNICIAN',
                ]) && (
                  <select
                    value={visibility}
                    onChange={(event) =>
                      setVisibility(
                        event.target.value as 'CUSTOMER' | 'INTERNAL',
                      )
                    }
                  >
                    <option value="CUSTOMER">Khách hàng thấy</option>
                    <option value="INTERNAL">Nội bộ</option>
                  </select>
                )}
              <button disabled={busy || !comment.trim()}>Gửi bình luận</button>
            </form>
          </div>
        )
      )}
    </Frame>
  )
}
function NewRequestPage() {
  const { profile } = useSession()
  const navigate = useNavigate()
  const data = useLoad<Page<EquipmentRecord>>(
    () => api.asset('/equipment?page=1&pageSize=100'),
    'request-equipment',
  )
  const [equipmentId, setEquipmentId] = useState('')
  const [type, setType] = useState('REPAIR')
  const [priority, setPriority] = useState('NORMAL')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState<unknown>(null)
  const [busy, setBusy] = useState(false)
  const [mockSubmitted, setMockSubmitted] = useState(false)
  async function submit(event: FormEvent) {
    event.preventDefault()
    const selected = data.value?.items.find((item) => item.id === equipmentId)
    if (!selected) {
      setError(new Error('Vui lòng chọn thiết bị.'))
      return
    }
    setBusy(true)
    setError(null)
    setMockSubmitted(false)
    try {
      const created = await api.requests<RequestRecord>('/service-requests', {
        method: 'POST',
        body: {
          equipmentId,
          type,
          priority,
          title,
          description,
          ...(profile?.userType === 'CUSTOMER'
            ? {}
            : { customerId: selected.customerId }),
        },
      })
      if (isMockMode) setMockSubmitted(true)
      else navigate(`/requests/${created.id}`)
    } catch (cause) {
      setError(cause)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Frame title="Tạo yêu cầu dịch vụ">
      {data.loading ? (
        <Loading />
      ) : data.error ? (
        <Problem error={data.error} />
      ) : (
        <form className="m1-card m1-form" onSubmit={submit}>
          {error ? <Problem error={error} /> : null}
          {mockSubmitted && (
            <p role="status" className="m1-mock-notice">
              Mock server đã nhận yêu cầu. Dữ liệu này không được lưu; kiểm tra
              luồng thật khi API M1 được tích hợp.
            </p>
          )}
          <label>
            Thiết bị
            <select
              required
              value={equipmentId}
              onChange={(event) => setEquipmentId(event.target.value)}
            >
              <option value="">Chọn thiết bị</option>
              {data.value?.items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.assetCode} · {item.serialNumber}
                </option>
              ))}
            </select>
          </label>
          <label>
            Loại
            <select
              value={type}
              onChange={(event) => setType(event.target.value)}
            >
              {['WARRANTY', 'REPAIR', 'MAINTENANCE', 'INSPECTION'].map(
                (value) => (
                  <option key={value}>{value}</option>
                ),
              )}
            </select>
          </label>
          <label>
            Ưu tiên
            <select
              value={priority}
              onChange={(event) => setPriority(event.target.value)}
            >
              {['LOW', 'NORMAL', 'HIGH', 'URGENT'].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <label>
            Tiêu đề
            <input
              required
              maxLength={200}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
          <label>
            Mô tả
            <textarea
              required
              maxLength={10000}
              rows={5}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>
          <button disabled={busy || !data.value?.items.length}>
            {busy ? 'Đang gửi…' : 'Gửi yêu cầu'}
          </button>
        </form>
      )}
    </Frame>
  )
}
function Message({ code, title }: { code: string; title: string }) {
  return (
    <div className="m1-card">
      <h1>
        {code} · {title}
      </h1>
      <Link to="/">Về trang chính</Link>
    </div>
  )
}
function Authenticated() {
  const { profile } = useSession()
  if (!profile) return <Navigate to="/login" replace />
  return (
    <Layout>
      <Routes>
        <Route
          path="/"
          element={<Navigate to={home(profile.roles)} replace />}
        />
        <Route
          path="/tenants"
          element={
            <Gate roles={menu[3].roles}>
              <TenantsPage />
            </Gate>
          }
        />
        <Route
          path="/customers"
          element={
            <Gate roles={menu[0].roles}>
              <CustomersPage />
            </Gate>
          }
        />
        <Route
          path="/customers/:id"
          element={
            <Gate roles={menu[0].roles}>
              <CustomerDetailPage />
            </Gate>
          }
        />
        <Route
          path="/equipment"
          element={
            <Gate roles={menu[1].roles}>
              <EquipmentPage />
            </Gate>
          }
        />
        <Route
          path="/equipment/:id"
          element={
            <Gate roles={menu[1].roles}>
              <EquipmentDetailPage />
            </Gate>
          }
        />
        <Route
          path="/requests"
          element={
            <Gate roles={menu[2].roles}>
              <RequestsPage />
            </Gate>
          }
        />
        <Route
          path="/requests/new"
          element={
            <Gate roles={creators}>
              <NewRequestPage />
            </Gate>
          }
        />
        <Route
          path="/requests/:id"
          element={
            <Gate roles={menu[2].roles}>
              <RequestDetailPage />
            </Gate>
          }
        />
        <Route
          path="/403"
          element={<Message code="403" title="Không có quyền truy cập" />}
        />
        <Route
          path="*"
          element={<Message code="404" title="Không tìm thấy trang" />}
        />
      </Routes>
    </Layout>
  )
}
function Content() {
  const { setProfile } = useSession()
  const [ready, setReady] = useState(false)
  useEffect(() => {
    let active = true
    restoreSession()
      .then((profile) => {
        if (active) setProfile(profile)
      })
      .finally(() => {
        if (active) setReady(true)
      })
    return () => {
      active = false
    }
  }, [setProfile])
  return !ready ? (
    <div className="m1-login">
      <Loading />
    </div>
  ) : (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/*" element={<Authenticated />} />
    </Routes>
  )
}
export default function App() {
  return (
    <SessionProvider>
      <Content />
    </SessionProvider>
  )
}

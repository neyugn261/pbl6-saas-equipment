import { useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../api/client'
import { useSession, getSessionGeneration, type Profile } from '../auth/session'
import { StatusBadge } from '../components/Badges'
import { useDirectory, errorText } from './registration-data'
import type { Page } from '../types/domain'
import './live-administration.css'

type Tenant = {
  id: string
  code: string
  name: string
  plan: string
  status: string
  createdAt: string
}
type Branch = {
  id: string
  code: string
  name: string
  address: string
  email: string | null
  phone: string | null
  status: string
}
type User = {
  id: string
  fullName: string
  email: string
  userType: string
  roles: string[]
  status: string
}
type Role = {
  code: string
  name: string
  description: string | null
  userType: string
}
type Site = {
  id: string
  code: string
  name: string
  address: string
  status: string
}
type Location = {
  id: string
  name: string
  code: string | null
  type: string
  parentId: string | null
  status: string
}

function Screen({
  title,
  description,
  children,
  actions,
}: {
  title: string
  description?: string
  children: ReactNode
  actions?: ReactNode
}) {
  return (
    <div className="live-admin">
      <header className="m1-header">
        <div>
          <span className="m1-eyebrow">KHÔNG GIAN LÀM VIỆC</span>
          <h1>{title}</h1>
          {description && <p>{description}</p>}
        </div>
        {actions}
      </header>
      {children}
    </div>
  )
}
function State({
  loading,
  error,
  retry,
}: {
  loading: boolean
  error: string
  retry?: () => void
}) {
  return loading ? (
    <p role="status">Đang tải dữ liệu…</p>
  ) : error ? (
    <div className="m1-error" role="alert">
      {error}
      {retry && <button onClick={retry}>Thử lại</button>}
    </div>
  ) : null
}
function Pager({
  page,
  total,
  change,
}: {
  page: number
  total: number
  change: (page: number) => void
}) {
  return (
    <div className="live-pagination">
      <span>
        Trang {page} · {total} kết quả
      </span>
      <button disabled={page <= 1} onClick={() => change(page - 1)}>
        Trước
      </button>
      <button disabled={page * 20 >= total} onClick={() => change(page + 1)}>
        Sau
      </button>
    </div>
  )
}
function Field({
  name,
  label,
  value,
  required = false,
  max = 200,
  type = 'text',
  pattern,
}: {
  name: string
  label: string
  value?: string | null
  required?: boolean
  max?: number
  type?: string
  pattern?: string
}) {
  return (
    <label>
      {label}
      {required && ' *'}
      <input
        name={name}
        defaultValue={value ?? ''}
        required={required}
        maxLength={max}
        type={type}
        pattern={pattern}
      />
    </label>
  )
}
function values(event: FormEvent<HTMLFormElement>) {
  return Object.fromEntries(
    [...new FormData(event.currentTarget).entries()].map(([key, value]) => [
      key,
      String(value).trim(),
    ]),
  )
}
function useMutation() {
  const pending = useRef(false)
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState('')
  async function run(task: () => Promise<void>) {
    if (pending.current) return
    pending.current = true
    const generation = getSessionGeneration()
    setBusy(true)
    setError('')
    setMessage('')
    try {
      await task()
    } catch (cause) {
      if (generation === getSessionGeneration()) setError(errorText(cause))
    } finally {
      pending.current = false
      if (generation === getSessionGeneration()) setBusy(false)
    }
  }
  return { busy, error, message, setMessage, run }
}
function Feedback({ action }: { action: ReturnType<typeof useMutation> }) {
  return (
    <>
      {action.error && (
        <p className="m1-error" role="alert">
          {action.error}
        </p>
      )}
      {action.message && (
        <p className="live-success" role="status">
          {action.message}
        </p>
      )}
    </>
  )
}

export function TenantListPage() {
  const [page, setPage] = useState(1),
    [q, setQ] = useState(''),
    [status, setStatus] = useState(''),
    [revision, refresh] = useState(0)
  const data = useDirectory<Page<Tenant>>(
    'organization',
    `/tenants?page=${page}&pageSize=20&q=${encodeURIComponent(q)}${status ? `&status=${status}` : ''}`,
    revision,
  )
  return (
    <Screen
      title="Quản lý doanh nghiệp"
      description="Danh sách doanh nghiệp đang sử dụng nền tảng."
      actions={
        <Link className="m1-button" to="/admin/tenants/new">
          Tạo doanh nghiệp
        </Link>
      }
    >
      <div className="m1-card">
        <form
          className="live-toolbar"
          onSubmit={(e) => {
            e.preventDefault()
            setQ(values(e).q)
            setPage(1)
          }}
        >
          <input
            name="q"
            aria-label="Tìm doanh nghiệp"
            placeholder="Tên hoặc mã doanh nghiệp"
            maxLength={100}
          />
          <button>Tìm kiếm</button>
          <select
            aria-label="Trạng thái doanh nghiệp"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value)
              setPage(1)
            }}
          >
            <option value="">Tất cả trạng thái</option>
            <option value="ACTIVE">Hoạt động</option>
            <option value="SUSPENDED">Tạm khóa</option>
            <option value="DISABLED">Vô hiệu hóa</option>
          </select>
        </form>
        <State {...data} retry={() => refresh(revision + 1)} />
        {data.value && (
          <>
            <div className="live-table">
              <table>
                <thead>
                  <tr>
                    <th>Doanh nghiệp</th>
                    <th>Mã đăng nhập</th>
                    <th>Gói dịch vụ</th>
                    <th>Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  {data.value.items.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <Link to={`/admin/tenants/${row.id}`}>{row.name}</Link>
                      </td>
                      <td>{row.code}</td>
                      <td>{row.plan}</td>
                      <td>
                        <StatusBadge status={row.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!data.value.items.length && <p>Không tìm thấy doanh nghiệp.</p>}
            <Pager page={page} total={data.value.total} change={setPage} />
          </>
        )}
      </div>
    </Screen>
  )
}
export function TenantCreatePage() {
  const action = useMutation(),
    navigate = useNavigate()
  return (
    <Screen
      title="Tạo doanh nghiệp"
      description="Sau khi tạo doanh nghiệp, bạn có thể mời quản trị viên tại trang chi tiết."
    >
      <section className="m1-card">
        <Feedback action={action} />
        <form
          className="live-form"
          onSubmit={(e) => {
            e.preventDefault()
            const body = values(e)
            void action.run(async () => {
              const row = await api.organization<Tenant>('/tenants', {
                method: 'POST',
                body: {
                  code: body.code,
                  name: body.name,
                  ...(body.plan ? { plan: body.plan } : {}),
                },
              })
              navigate(`/admin/tenants/${row.id}`)
            })
          }}
        >
          <fieldset disabled={action.busy}>
            <Field
              name="code"
              label="Mã đăng nhập (chữ hoa, số, dấu gạch ngang)"
              required
              max={50}
              pattern="[A-Z0-9][A-Z0-9\-]{1,49}"
            />
            <Field name="name" label="Tên doanh nghiệp" required />
            <Field
              name="plan"
              label="Gói dịch vụ (để trống dùng mặc định)"
              max={50}
            />
            <div className="live-toolbar">
              <button>{action.busy ? 'Đang tạo…' : 'Tạo doanh nghiệp'}</button>
              <Link to="/admin/tenants">Quay lại</Link>
            </div>
          </fieldset>
        </form>
      </section>
    </Screen>
  )
}
export function TenantDetailPage() {
  const { id } = useParams(),
    [revision, refresh] = useState(0),
    action = useMutation()
  const data = useDirectory<Tenant>(
    'organization',
    id ? `/tenants/${id}` : null,
    revision,
  )
  const tenant = data.value
  return (
    <Screen
      title={tenant?.name ?? 'Chi tiết doanh nghiệp'}
      actions={<Link to="/admin/tenants">Danh sách doanh nghiệp</Link>}
    >
      <State {...data} retry={() => refresh(revision + 1)} />
      <Feedback action={action} />
      {tenant && (
        <div className="live-columns">
          <section className="m1-card">
            <h2>Thông tin doanh nghiệp</h2>
            <p>
              Mã đăng nhập: <strong>{tenant.code}</strong>
            </p>
            <p>
              Ngày tạo: {new Date(tenant.createdAt).toLocaleDateString('vi-VN')}
            </p>
            <StatusBadge status={tenant.status} />
            <form
              key={tenant.id + revision}
              className="live-form"
              onSubmit={(e) => {
                e.preventDefault()
                const body = values(e)
                void action.run(async () => {
                  await api.organization(`/tenants/${id}`, {
                    method: 'PATCH',
                    body,
                  })
                  action.setMessage('Đã lưu thông tin doanh nghiệp.')
                  refresh(revision + 1)
                })
              }}
            >
              <fieldset disabled={action.busy}>
                <Field
                  name="name"
                  label="Tên doanh nghiệp"
                  value={tenant.name}
                  required
                />
                <Field
                  name="plan"
                  label="Gói dịch vụ"
                  value={tenant.plan}
                  required
                  max={50}
                />
                <button>Lưu thông tin</button>
              </fieldset>
            </form>
            <form
              className="live-form"
              onSubmit={(e) => {
                e.preventDefault()
                const body = values(e)
                void action.run(async () => {
                  await api.organization(`/tenants/${id}/status`, {
                    method: 'POST',
                    body,
                  })
                  action.setMessage('Đã cập nhật trạng thái.')
                  refresh(revision + 1)
                })
              }}
            >
              <fieldset disabled={action.busy}>
                <label>
                  Chuyển trạng thái
                  <select
                    name="status"
                    key={tenant.status}
                    defaultValue={['ACTIVE', 'SUSPENDED', 'DISABLED'].find(
                      (s) => s !== tenant.status,
                    )}
                  >
                    {['ACTIVE', 'SUSPENDED', 'DISABLED']
                      .filter((s) => s !== tenant.status)
                      .map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                  </select>
                </label>
                <Field name="reason" label="Lý do thay đổi" max={1000} />
                <button>Cập nhật trạng thái</button>
              </fieldset>
            </form>
          </section>
          <section className="m1-card">
            <h2>Mời Tenant Admin</h2>
            <p>
              Quản trị viên nhận hướng dẫn kích hoạt qua email của hệ
              thống. Nếu doanh nghiệp vừa tạo chưa đồng bộ, hãy thử lại lời mời
              sau ít giây.
            </p>
            <TenantAdminInvite
              key={id}
              tenantId={id!}
              enabled={tenant.status === 'ACTIVE'}
            />
          </section>
        </div>
      )}
    </Screen>
  )
}
function TenantAdminInvite({
  tenantId,
  enabled,
}: {
  tenantId: string
  enabled: boolean
}) {
  const action = useMutation(),
    [result, setResult] = useState<{
      user: User
      activationToken?: string
    } | null>(null)
  return (
    <>
      <Feedback action={action} />
      {!enabled && <p>Doanh nghiệp phải hoạt động để mời quản trị viên.</p>}
      {result ? (
        <div>
          <p role="status">Đã tạo lời mời cho {result.user.email}.</p>
          {result.activationToken && (
            <a
              href={`/activate#token=${encodeURIComponent(result.activationToken)}`}
              target="_blank"
              rel="noreferrer"
            >
              Mở link kích hoạt (dev/test)
            </a>
          )}
          <button onClick={() => setResult(null)}>
            Mời quản trị viên khác
          </button>
        </div>
      ) : (
        <form
          className="live-form"
          onSubmit={(e) => {
            e.preventDefault()
            const body = values(e)
            void action.run(async () => {
              setResult(
                await api.identity(`/platform/tenants/${tenantId}/admins`, {
                  method: 'POST',
                  body,
                }),
              )
            })
          }}
        >
          <fieldset disabled={action.busy || !enabled}>
            <Field name="fullName" label="Họ tên" required max={150} />
            <Field name="email" label="Email" type="email" required max={255} />
            <Field name="phone" label="Điện thoại" max={30} />
            <button>{action.busy ? 'Đang gửi…' : 'Gửi lời mời'}</button>
          </fieldset>
        </form>
      )}
    </>
  )
}

export function BranchesPage() {
  const [page, setPage] = useState(1),
    [q, setQ] = useState(''),
    [revision, refresh] = useState(0),
    [editing, setEditing] = useState<Branch | 'new' | null>(null)
  const data = useDirectory<Page<Branch>>(
    'organization',
    `/branches?page=${page}&pageSize=20&q=${encodeURIComponent(q)}`,
    revision,
  )
  return (
    <Screen
      title="Chi nhánh"
      description="Các đơn vị nội bộ của doanh nghiệp cung cấp thiết bị."
      actions={
        <button onClick={() => setEditing('new')}>Thêm chi nhánh</button>
      }
    >
      {editing && (
        <BranchForm
          key={editing === 'new' ? 'new' : editing.id}
          row={editing === 'new' ? undefined : editing}
          saved={() => {
            setEditing(null)
            refresh(revision + 1)
          }}
          close={() => setEditing(null)}
        />
      )}
      <section className="m1-card">
        <form
          className="live-toolbar"
          onSubmit={(e) => {
            e.preventDefault()
            setQ(values(e).q)
            setPage(1)
          }}
        >
          <input
            name="q"
            aria-label="Tìm chi nhánh"
            placeholder="Tên hoặc mã chi nhánh"
            maxLength={100}
          />
          <button>Tìm kiếm</button>
        </form>
        <State {...data} retry={() => refresh(revision + 1)} />
        {data.value && (
          <>
            <div className="live-table">
              <table>
                <thead>
                  <tr>
                    <th>Chi nhánh</th>
                    <th>Địa chỉ</th>
                    <th>Liên hệ</th>
                    <th>Trạng thái</th>
                    <th>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {data.value.items.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <strong>{row.name}</strong>
                        <small>{row.code}</small>
                      </td>
                      <td>{row.address}</td>
                      <td>{row.email ?? row.phone ?? '—'}</td>
                      <td>
                        <StatusBadge status={row.status} />
                      </td>
                      <td>
                        <button onClick={() => setEditing(row)}>
                          Chỉnh sửa
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!data.value.items.length && <p>Chưa có chi nhánh phù hợp.</p>}
            <Pager page={page} total={data.value.total} change={setPage} />
          </>
        )}
      </section>
    </Screen>
  )
}
function BranchForm({
  row,
  saved,
  close,
}: {
  row?: Branch
  saved: () => void
  close: () => void
}) {
  const action = useMutation()
  return (
    <section className="m1-card">
      <h2>{row ? 'Chỉnh sửa chi nhánh' : 'Thêm chi nhánh'}</h2>
      <Feedback action={action} />
      <form
        className="live-form"
        onSubmit={(e) => {
          e.preventDefault()
          const input = values(e)
          const body = {
            ...input,
            phone: input.phone || (row ? null : undefined),
            email: input.email || (row ? null : undefined),
          }
          void action.run(async () => {
            await api.organization(`/branches${row ? `/${row.id}` : ''}`, {
              method: row ? 'PATCH' : 'POST',
              body,
            })
            saved()
          })
        }}
      >
        <fieldset disabled={action.busy}>
          {!row && <Field name="code" label="Mã chi nhánh" required max={50} />}
          <Field
            name="name"
            label="Tên chi nhánh"
            value={row?.name}
            required
            max={150}
          />
          <Field
            name="address"
            label="Địa chỉ"
            value={row?.address}
            required
            max={2000}
          />
          <Field
            name="email"
            label="Email"
            value={row?.email}
            type="email"
            max={255}
          />
          <Field name="phone" label="Điện thoại" value={row?.phone} max={30} />
          {row && (
            <label>
              Trạng thái
              <select name="status" defaultValue={row.status}>
                <option value="ACTIVE">Hoạt động</option>
                <option value="INACTIVE">Ngừng hoạt động</option>
              </select>
            </label>
          )}
          <div className="live-toolbar">
            <button>Lưu chi nhánh</button>
            <button type="button" onClick={close}>
              Hủy
            </button>
          </div>
        </fieldset>
      </form>
    </section>
  )
}

export function UsersPage() {
  const { profile } = useSession(),
    [page, setPage] = useState(1),
    [q, setQ] = useState(''),
    [status, setStatus] = useState(''),
    [revision, refresh] = useState(0),
    [editing, setEditing] = useState<User | null>(null),
    action = useMutation()
  const data = useDirectory<Page<User>>(
    'identity',
    `/users?page=${page}&pageSize=20&q=${encodeURIComponent(q)}${status ? `&status=${status}` : ''}`,
    revision,
  )
  return (
    <Screen
      title="Người dùng"
      description="Quản lý tài khoản và vai trò trong doanh nghiệp."
      actions={
        <Link className="m1-button" to="/users/invite">
          Mời người dùng
        </Link>
      }
    >
      <Feedback action={action} />
      {editing && (
        <UserRoles
          key={editing.id}
          user={editing}
          saved={() => {
            setEditing(null)
            refresh(revision + 1)
          }}
          close={() => setEditing(null)}
        />
      )}
      <section className="m1-card">
        <form
          className="live-toolbar"
          onSubmit={(e) => {
            e.preventDefault()
            setQ(values(e).q)
            setPage(1)
          }}
        >
          <input
            name="q"
            aria-label="Tìm người dùng"
            placeholder="Họ tên hoặc email"
            maxLength={100}
          />
          <button>Tìm kiếm</button>
          <select
            aria-label="Trạng thái người dùng"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value)
              setPage(1)
            }}
          >
            <option value="">Tất cả trạng thái</option>
            {['INVITED', 'ACTIVE', 'SUSPENDED', 'DISABLED'].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </form>
        <State {...data} retry={() => refresh(revision + 1)} />
        {data.value && (
          <>
            <div className="live-table">
              <table>
                <thead>
                  <tr>
                    <th>Người dùng</th>
                    <th>Vai trò</th>
                    <th>Trạng thái</th>
                    <th>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {data.value.items.map((row) => {
                    const manageable =
                      row.id !== profile?.id &&
                      !row.roles.includes('TENANT_ADMIN') &&
                      row.userType !== 'PLATFORM_STAFF'
                    return (
                      <tr key={row.id}>
                        <td>
                          <strong>{row.fullName}</strong>
                          <small>{row.email}</small>
                        </td>
                        <td>{row.roles.join(', ') || 'Chưa gán vai trò'}</td>
                        <td>
                          <StatusBadge status={row.status} />
                        </td>
                        <td>
                          {manageable && (
                            <div className="live-toolbar">
                              <button
                                disabled={action.busy}
                                onClick={() => setEditing(row)}
                              >
                                Gán vai trò
                              </button>
                              {['ACTIVE', 'SUSPENDED'].includes(row.status) && (
                                <button
                                  disabled={action.busy}
                                  onClick={() => {
                                    void action.run(async () => {
                                      await api.identity(
                                        `/users/${row.id}/status`,
                                        {
                                          method: 'POST',
                                          body: {
                                            status:
                                              row.status === 'ACTIVE'
                                                ? 'SUSPENDED'
                                                : 'ACTIVE',
                                          },
                                        },
                                      )
                                      action.setMessage(
                                        `Đã cập nhật ${row.fullName}.`,
                                      )
                                      refresh(revision + 1)
                                    })
                                  }}
                                >
                                  {row.status === 'ACTIVE'
                                    ? 'Tạm khóa'
                                    : 'Kích hoạt'}
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {!data.value.items.length && <p>Không tìm thấy người dùng.</p>}
            <Pager page={page} total={data.value.total} change={setPage} />
          </>
        )}
      </section>
    </Screen>
  )
}
function UserRoles({
  user,
  saved,
  close,
}: {
  user: User
  saved: () => void
  close: () => void
}) {
  const data = useDirectory<{ items: Role[] }>('identity', '/roles'),
    action = useMutation(),
    [roles, setRoles] = useState(user.roles)
  return (
    <section className="m1-card">
      <h2>Vai trò của {user.fullName}</h2>
      <State {...data} />
      <Feedback action={action} />
      <form
        className="live-form"
        onSubmit={(e) => {
          e.preventDefault()
          void action.run(async () => {
            await api.identity(`/users/${user.id}/roles`, {
              method: 'PATCH',
              body: { roles },
            })
            saved()
          })
        }}
      >
        <fieldset disabled={action.busy || !data.value}>
          {data.value?.items
            .filter(
              (role) =>
                role.userType === user.userType &&
                !['TENANT_ADMIN', 'PLATFORM_ADMIN'].includes(role.code),
            )
            .map((role) => (
              <label className="live-check" key={role.code}>
                <input
                  type="checkbox"
                  checked={roles.includes(role.code)}
                  onChange={(e) =>
                    setRoles(
                      e.target.checked
                        ? [...roles, role.code]
                        : roles.filter((code) => code !== role.code),
                    )
                  }
                />
                {role.name} <small>{role.code}</small>
              </label>
            ))}
          <button>Lưu vai trò</button>
        </fieldset>
        <button type="button" disabled={action.busy} onClick={close}>
          Đóng
        </button>
      </form>
    </section>
  )
}
export function RolesPage() {
  const [revision, refresh] = useState(0),
    data = useDirectory<{ items: Role[] }>('identity', '/roles', revision)
  return (
    <Screen
      title="Vai trò & quyền"
      description="Vai trò cố định do nền tảng định nghĩa. Gán vai trò tại trang Người dùng."
      actions={<Link to="/app/organization/users">Quản lý người dùng</Link>}
    >
      <State {...data} retry={() => refresh(revision + 1)} />
      <div className="live-columns">
        {data.value?.items
          .filter((r) => r.userType !== 'PLATFORM_STAFF')
          .map((role) => (
            <section className="m1-card" key={role.code}>
              <h2>{role.name}</h2>
              <p>{role.code}</p>
              <p>{role.description || 'Chưa có mô tả vai trò.'}</p>
            </section>
          ))}
      </div>
    </Screen>
  )
}

export function ProfilePage() {
  const [revision, refresh] = useState(0),
    data = useDirectory<Profile & { phone: string | null; status: string }>(
      'identity',
      '/auth/me',
      revision,
    )
  return (
    <Screen
      title="Hồ sơ tài khoản"
      description="Thông tin tài khoản đang đăng nhập."
    >
      <State {...data} retry={() => refresh(revision + 1)} />
      {data.value && (
        <section className="m1-card">
          <dl className="live-details">
            <dt>Họ tên</dt>
            <dd>{data.value.fullName}</dd>
            <dt>Email</dt>
            <dd>{data.value.email}</dd>
            <dt>Điện thoại</dt>
            <dd>{data.value.phone || 'Chưa có'}</dd>
            <dt>Vai trò</dt>
            <dd>{data.value.roles.join(', ')}</dd>
            <dt>Trạng thái</dt>
            <dd>
              <StatusBadge status={data.value.status} />
            </dd>
          </dl>
          <p>Để thay đổi thông tin liên hệ, vui lòng liên hệ quản trị viên.</p>
        </section>
      )}
    </Screen>
  )
}
export function PortalLocationsPage() {
  const { profile } = useSession(),
    [revision, refresh] = useState(0)
  const data = useDirectory<Site[]>(
    'organization',
    profile?.customerId ? `/customers/${profile.customerId}/sites` : null,
    revision,
  )
  return (
    <Screen
      title="Địa điểm của doanh nghiệp"
      description="Địa điểm và vị trí lắp đặt trong phạm vi khách hàng của bạn."
    >
      {!profile?.customerId ? (
        <p role="alert">
          Tài khoản chưa được liên kết với khách hàng. Vui lòng liên hệ quản trị
          viên.
        </p>
      ) : (
        <>
          <State {...data} retry={() => refresh(revision + 1)} />
          {data.value && !data.value.length && (
            <section className="m1-card">Chưa có địa điểm.</section>
          )}
          {data.value?.map((site) => (
            <SiteLocations key={site.id} site={site} />
          ))}
        </>
      )}
    </Screen>
  )
}
function SiteLocations({ site }: { site: Site }) {
  const [open, setOpen] = useState(false),
    [revision, refresh] = useState(0)
  const data = useDirectory<Location[]>(
    'organization',
    open ? `/sites/${site.id}/locations` : null,
    revision,
  )
  return (
    <section className="m1-card">
      <h2>{site.name}</h2>
      <p>
        {site.code} · {site.address}
      </p>
      <StatusBadge status={site.status} />
      <button aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? 'Thu gọn vị trí' : 'Xem vị trí lắp đặt'}
      </button>
      {open && (
        <>
          <State {...data} retry={() => refresh(revision + 1)} />
          {data.value && !data.value.length && <p>Chưa có vị trí lắp đặt.</p>}
          {data.value?.map((row) => (
            <div className="live-location" key={row.id}>
              <strong>{row.name}</strong>
              <span>
                {row.type} · {row.code || 'Không có mã'}
              </span>
              {row.parentId && (
                <small>
                  Thuộc:{' '}
                  {data.value?.find((parent) => parent.id === row.parentId)
                    ?.name ?? 'Vị trí cấp trên'}
                </small>
              )}
              <StatusBadge status={row.status} />
            </div>
          ))}
        </>
      )}
    </section>
  )
}
export function UnavailablePage({ type }: { type: 'audit' | 'settings' }) {
  return (
    <Screen title={type === 'audit' ? 'Nhật ký kiểm toán' : 'Cài đặt'}>
      <section className="m1-card">
        <h2>Chức năng chưa được cung cấp trên web</h2>
        <p>
          {type === 'audit'
            ? 'Nhật ký quản trị chưa có trang tra cứu trong phiên bản hiện tại.'
            : 'Phiên bản hiện tại chưa hỗ trợ thay đổi cấu hình tại đây.'}
        </p>
        <Link to="/dashboard">Về tổng quan</Link>
      </section>
    </Screen>
  )
}

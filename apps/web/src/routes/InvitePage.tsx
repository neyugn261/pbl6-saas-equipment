import { useState, type FormEvent } from 'react'
import { api, ApiError } from '../api/client'
import { useSession } from '../auth/session'
import type { Role } from '../types/domain'

interface InviteResult {
  user: { id: string; email: string }
  activationToken?: string | null
}

const roleNames: Partial<Record<Role, string>> = {
  SERVICE_MANAGER: 'Quản lý dịch vụ',
  DISPATCHER: 'Điều phối viên',
  INVENTORY_STAFF: 'Nhân viên kho',
  TECHNICIAN: 'Kỹ thuật viên',
  CUSTOMER_ADMIN: 'Quản trị khách hàng',
  CUSTOMER_USER: 'Người dùng khách hàng',
}
const tenantRoles = Object.keys(roleNames) as Role[]

function errorText(error: unknown): string {
  if (error instanceof ApiError) return `${error.status} · ${error.message}`
  return error instanceof Error ? error.message : 'Thao tác không thành công.'
}

export default function InvitePage() {
  const { profile } = useSession()
  const isCustomerAdmin = profile?.userType === 'CUSTOMER'
  const roles = isCustomerAdmin ? (['CUSTOMER_USER'] as Role[]) : tenantRoles
  const [role, setRole] = useState<Role>(roles[0])
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [result, setResult] = useState<InviteResult | null>(null)
  const [linked, setLinked] = useState(false)
  const [error, setError] = useState('')
  const [linkError, setLinkError] = useState('')
  const [busy, setBusy] = useState(false)

  async function linkCustomer(userId: string) {
    if (!profile?.customerId) {
      setLinkError('Tài khoản của bạn chưa được gắn với khách hàng.')
      return
    }
    try {
      await api.organization(`/customers/${profile.customerId}/memberships`, {
        method: 'POST',
        body: { userId },
      })
      setLinked(true)
      setLinkError('')
    } catch (cause) {
      setLinkError(
        `Đã tạo lời mời nhưng chưa gắn khách hàng: ${errorText(cause)}`,
      )
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    setLinkError('')
    try {
      const invited = await api.identity<InviteResult>('/users', {
        method: 'POST',
        body: {
          email: email.trim(),
          fullName: fullName.trim(),
          userType: role.startsWith('CUSTOMER_') ? 'CUSTOMER' : 'TENANT_STAFF',
          roles: [role],
        },
      })
      setResult(invited)
      setLinked(false)
      if (isCustomerAdmin) await linkCustomer(invited.user.id)
    } catch (cause) {
      setError(errorText(cause))
    } finally {
      setBusy(false)
    }
  }

  const activationUrl = result?.activationToken
    ? `${window.location.origin}/activate#token=${encodeURIComponent(result.activationToken)}`
    : null

  return (
    <>
      <header className="m1-header">
        <h1>Mời người dùng</h1>
      </header>
      <div className="m1-card m1-form">
        {result ? (
          <div>
            <h2>Đã tạo lời mời</h2>
            <p>{result.user.email}</p>
            {isCustomerAdmin && (
              <p role="status">
                {linked
                  ? 'Đã gắn tài khoản với khách hàng của bạn.'
                  : 'Tài khoản chưa được gắn với khách hàng.'}
              </p>
            )}
            {linkError && (
              <p className="m1-error" role="alert">
                {linkError}
              </p>
            )}
            {isCustomerAdmin && !linked && (
              <button
                disabled={busy}
                onClick={async () => {
                  setBusy(true)
                  try {
                    await linkCustomer(result.user.id)
                  } finally {
                    setBusy(false)
                  }
                }}
              >
                Gắn lại với khách hàng
              </button>
            )}
            {activationUrl ? (
              <p>
                Link kích hoạt (chỉ dùng ở môi trường dev/test):{' '}
                <a href={activationUrl} target="_blank" rel="noopener noreferrer">
                  {activationUrl}
                </a>
              </p>
            ) : (
              <p>
                Phản hồi không có link kích hoạt. Tài khoản đã được mời; cần
                kênh gửi hướng dẫn kích hoạt của hệ thống.
              </p>
            )}
            <button
              onClick={() => {
                setResult(null)
                setEmail('')
                setFullName('')
              }}
            >
              Mời người khác
            </button>
          </div>
        ) : (
          <form className="m1-form" onSubmit={submit}>
            {error && (
              <p className="m1-error" role="alert">
                {error}
              </p>
            )}
            <label>
              Họ tên
              <input
                required
                maxLength={150}
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
              />
            </label>
            <label>
              Email
              <input
                required
                type="email"
                maxLength={255}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>
            <label>
              Vai trò
              <select
                value={role}
                onChange={(event) => setRole(event.target.value as Role)}
              >
                {roles.map((item) => (
                  <option key={item} value={item}>
                    {roleNames[item]}
                  </option>
                ))}
              </select>
            </label>
            <button disabled={busy}>
              {busy ? 'Đang mời…' : 'Gửi lời mời'}
            </button>
          </form>
        )}
      </div>
    </>
  )
}

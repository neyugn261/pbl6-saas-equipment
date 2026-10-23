import { useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { home } from '../auth/access'
import { activate, useSession } from '../auth/session'

export default function ActivatePage() {
  const { profile, setProfile } = useSession()
  const navigate = useNavigate()
  const location = useLocation()
  const token = new URLSearchParams(location.hash.slice(1)).get('token')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (profile) return <Navigate to={home(profile.roles)} replace />

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!token) return
    if (password !== confirm) {
      setError('Hai mật khẩu không khớp.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const user = await activate({ token, password })
      setProfile(user)
      navigate(home(user.roles), { replace: true })
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Không thể kích hoạt tài khoản.',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="m1-login">
      <form className="m1-card m1-form" onSubmit={submit}>
        <h1>Kích hoạt tài khoản</h1>
        {!token ? (
          <p className="m1-error" role="alert">
            Link kích hoạt không hợp lệ. <Link to="/login">Về đăng nhập</Link>
          </p>
        ) : (
          <>
            <p>Mật khẩu cần có chữ hoa, chữ thường, số và ký tự đặc biệt.</p>
            {error && (
              <p className="m1-error" role="alert">
                {error}
              </p>
            )}
            <label>
              Mật khẩu mới
              <input
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                maxLength={128}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            <label>
              Nhập lại mật khẩu
              <input
                type="password"
                autoComplete="new-password"
                required
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
              />
            </label>
            <button disabled={busy}>
              {busy ? 'Đang kích hoạt…' : 'Kích hoạt'}
            </button>
          </>
        )}
      </form>
    </div>
  )
}

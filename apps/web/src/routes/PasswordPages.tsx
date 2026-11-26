import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { PageTitle } from '../components/PageTitle'
import { ApiError } from '../api/client'
import { useSession } from '../auth/session'
import { changePassword, forgotPassword, passwordProblem, resetPassword } from '../auth/password'
import AuthStory from './AuthStory'
import './password-pages.css'

function errorMessage(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 429) return 'Thao tác quá nhiều lần. Vui lòng đợi rồi thử lại.'
    if (error.status === 503) return 'Dịch vụ khôi phục mật khẩu hiện không khả dụng.'
    if (error.code === 'INVALID_PASSWORD_RESET') return 'Mã xác nhận không đúng hoặc đã hết hạn. Hãy yêu cầu mã mới.'
    if (error.code === 'CURRENT_PASSWORD_INVALID') return 'Mật khẩu hiện tại không đúng.'
    return error.message
  }
  return error instanceof Error ? error.message : 'Không thể kết nối đến Identity.'
}

export function ForgotPasswordPage() {
  const { profile } = useSession()
  const [platform, setPlatform] = useState(false)
  const [tenantCode, setTenantCode] = useState('MP')
  const [email, setEmail] = useState('')
  const [challengeId, setChallengeId] = useState('')
  const [otp, setOtp] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  if (profile) return <Navigate to="/login" replace />

  async function requestCode(event: FormEvent) {
    event.preventDefault()
    setBusy(true); setError('')
    try {
      const result = await forgotPassword({ email, ...(platform ? {} : { tenantCode }) })
      setChallengeId(result.challengeId)
      setOtp('')
    } catch (cause) { setError(errorMessage(cause)) }
    finally { setBusy(false) }
  }

  async function submitReset(event: FormEvent) {
    event.preventDefault()
    const issue = passwordProblem(password)
    if (issue || password !== confirm) {
      setError(issue || 'Hai mật khẩu không khớp.')
      return
    }
    setBusy(true); setError('')
    try {
      await resetPassword({ challengeId, otp, newPassword: password })
      setPassword(''); setConfirm(''); setOtp(''); setDone(true)
    } catch (cause) { setError(errorMessage(cause)) }
    finally { setBusy(false) }
  }

  return <div className="m1-login password-recovery">
    <AuthStory />
    <main className="m1-card m1-form password-recovery__card">
      <span className="m1-eyebrow">KHÔI PHỤC TÀI KHOẢN</span>
      <PageTitle title="Quên mật khẩu?" back={{ to: '/login', label: 'Về đăng nhập' }} />
      <p className="password-recovery__intro">Nhập email đăng nhập để yêu cầu mã xác nhận và đặt mật khẩu mới.</p>
      {error && <p role="alert" className="m1-error">{error}</p>}
      {done ? <div className="password-recovery__success" role="status">
        <strong>Đã đặt lại mật khẩu</strong>
        <p>Đăng nhập lại bằng mật khẩu mới để tiếp tục công việc.</p>
      </div> : <>
        <section className="password-recovery__step" aria-label="Yêu cầu mã xác nhận">
          <h2><span>01</span> Nhận mã xác nhận</h2>
          <form onSubmit={requestCode} className="m2-editor password-form">
            <label className="password-recovery__checkbox"><input type="checkbox" checked={platform} onChange={e => { setPlatform(e.target.checked); setChallengeId('') }} /> Tài khoản nền tảng</label>
            {!platform && <label>Mã doanh nghiệp<input required maxLength={50} value={tenantCode} onChange={e => { setTenantCode(e.target.value); setChallengeId('') }} /></label>}
            <label>Email<input required type="email" autoComplete="email" value={email} onChange={e => { setEmail(e.target.value); setChallengeId('') }} /></label>
            <button type="submit" disabled={busy}>{challengeId ? 'Gửi mã mới' : 'Gửi mã xác nhận'}</button>
          </form>
        </section>
        {challengeId && <section className="password-recovery__step password-recovery__step--reset" aria-label="Đặt lại mật khẩu">
          <h2><span>02</span> Đặt lại mật khẩu</h2>
          <p role="status">Nếu tài khoản đủ điều kiện, mã xác nhận sẽ được gửi qua email. Mã mới sẽ thay thế mã cũ.</p>
          <form onSubmit={submitReset} className="m2-editor password-form">
            <label>Mã xác nhận 6 chữ số<input required inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="one-time-code" value={otp} onChange={e => setOtp(e.target.value)} /></label>
            <label>Mật khẩu mới<input required type="password" autoComplete="new-password" minLength={8} maxLength={128} value={password} onChange={e => setPassword(e.target.value)} /></label>
            <label>Nhập lại mật khẩu<input required type="password" autoComplete="new-password" value={confirm} onChange={e => setConfirm(e.target.value)} /></label>
            <button type="submit" disabled={busy}>Đặt lại mật khẩu</button>
          </form>
        </section>}
      </>}
    </main>
  </div>
}

export function ChangePasswordPanel() {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function submit(event: FormEvent) {
    event.preventDefault()
    const issue = passwordProblem(newPassword)
    if (issue || newPassword !== confirm) { setError(issue || 'Hai mật khẩu không khớp.'); return }
    setBusy(true); setError('')
    try {
      await changePassword({ currentPassword, newPassword })
      setCurrentPassword(''); setNewPassword(''); setConfirm('')
      // clearTokens removes the active profile, so the login route is shown.
    } catch (cause) { setError(errorMessage(cause)) }
    finally { setBusy(false) }
  }
  return <section className="m1-card password-change"><h2>Đổi mật khẩu</h2>
    <p>Sau khi đổi mật khẩu, bạn cần đăng nhập lại.</p>
    <form onSubmit={submit} className="m2-editor password-form">
      {error && <p role="alert" className="m1-error">{error}</p>}
      <label>Mật khẩu hiện tại<input required type="password" autoComplete="current-password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} /></label>
      <label>Mật khẩu mới<input required type="password" autoComplete="new-password" minLength={8} maxLength={128} value={newPassword} onChange={e => setNewPassword(e.target.value)} /></label>
      <label>Nhập lại mật khẩu mới<input required type="password" autoComplete="new-password" value={confirm} onChange={e => setConfirm(e.target.value)} /></label>
      <button disabled={busy}>Đổi mật khẩu</button>
    </form>
  </section>
}

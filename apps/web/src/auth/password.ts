import { ApiError, api } from '../api/client'
import { identityBase } from '../api/config'
import { clearTokens } from './session'

export function passwordProblem(password: string): string | null {
  if (password.length < 8 || password.length > 128 || new TextEncoder().encode(password).length > 72 ||
      !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password) || !/[^a-zA-Z0-9]/.test(password)) {
    return 'Mật khẩu cần 8–128 ký tự, tối đa 72 byte, có chữ hoa, chữ thường, số và ký tự đặc biệt.'
  }
  return null
}

async function publicPost<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${identityBase}/auth/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new ApiError(response.status, error.code || 'API_ERROR', error.message || `HTTP ${response.status}`, error.details)
  }
  return (response.status === 204 ? undefined : await response.json()) as T
}

export function forgotPassword(input: { email: string; tenantCode?: string }) {
  return publicPost<{ message: string; challengeId: string }>('forgot-password', input)
}

export async function resetPassword(input: { challengeId: string; otp: string; newPassword: string }) {
  await publicPost<void>('reset-password', input)
  clearTokens()
}

export async function changePassword(input: { currentPassword: string; newPassword: string }) {
  await api.identity<void>('/auth/change-password', { method: 'POST', body: input })
  clearTokens()
}

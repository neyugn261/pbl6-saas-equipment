import { getAccessToken, getSessionGeneration, refresh } from '../auth/session'
import { bases } from './config'
export { isMockMode } from './config'

export class ApiError extends Error {
  status: number
  code: string
  details?: Record<string, unknown>
  constructor(
    status: number,
    code: string,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message)
    this.status = status
    this.code = code
    this.details = details
  }
}
export interface ApiOptions {
  method?: string
  body?: unknown
  headers?: Record<string, string>
}
type Area = keyof typeof bases

async function request<T>(
  area: Area,
  path: string,
  options: ApiOptions = {},
): Promise<T> {
  const generation = getSessionGeneration()
  const method = options.method || 'GET'
  const assertSession = () => {
    if (getSessionGeneration() !== generation)
      throw new ApiError(409, 'SESSION_CHANGED', 'Phiên đăng nhập đã thay đổi.')
  }
  async function send(token: string) {
    assertSession()
    return fetch(`${bases[area]}${path}`, {
      method,
      headers: {
        ...options.headers,
        Authorization: `Bearer ${token}`,
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: AbortSignal.timeout(20000),
    })
  }
  try {
    let token = getAccessToken()
    if (!token) token = await refresh()
    let response = await send(token)
    assertSession()
    if (response.status === 401) {
      const renewed =
        getAccessToken() !== token ? getAccessToken() : await refresh()
      assertSession()
      if (!['GET', 'HEAD'].includes(method.toUpperCase()))
        throw new ApiError(
          401,
          'AUTHENTICATION_RENEWED',
          'Phiên đã được làm mới. Kiểm tra kết quả trước khi xác nhận gửi lại thao tác.',
        )
      response = await send(renewed)
      assertSession()
    }
    if (!response.ok) {
      const body = await response.json().catch(() => ({}))
      assertSession()
      throw new ApiError(
        response.status,
        body.code || 'API_ERROR',
        body.message || `HTTP ${response.status}`,
        body.details,
      )
    }
    const result = response.status === 204 ? undefined : await response.json()
    assertSession()
    return result as T
  } catch (error) {
    // Normalize even a failed fetch/refresh/body from an obsolete session.
    assertSession()
    throw error
  }
}
export const api = {
  identity: <T>(path: string, options?: ApiOptions) =>
    request<T>('identity', path, options),
  organization: <T>(path: string, options?: ApiOptions) =>
    request<T>('organization', path, options),
  asset: <T>(path: string, options?: ApiOptions) =>
    request<T>('asset', path, options),
  assetM2: <T>(path: string, options?: ApiOptions) =>
    request<T>('assetM2', path, options),
  requests: <T>(path: string, options?: ApiOptions) =>
    request<T>('requests', path, options),
  requestsLive: <T>(path: string, options?: ApiOptions) =>
    request<T>('requestsLive', path, options),
  workorders: <T>(path: string, options?: ApiOptions) =>
    request<T>('workorders', path, options),
  maintenance: <T>(path: string, options?: ApiOptions) =>
    request<T>('maintenance', path, options),
}

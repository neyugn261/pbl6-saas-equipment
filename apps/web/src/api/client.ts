import { getAccessToken, refresh } from '../auth/session'
import { bases } from './config'
export { isMockMode } from './config'

export class ApiError extends Error {
  status: number
  code: string
  constructor(status: number, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}
type Area = keyof typeof bases

async function request<T>(
  area: Area,
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  async function send(token: string) {
    return fetch(`${bases[area]}${path}`, {
      method: options.method || 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    })
  }
  let token = getAccessToken()
  if (!token) token = await refresh()
  let response = await send(token)
  if (response.status === 401)
    response = await send(
      getAccessToken() !== token ? getAccessToken() : await refresh(),
    )
  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new ApiError(
      response.status,
      body.code || 'API_ERROR',
      body.message || `HTTP ${response.status}`,
    )
  }
  return response.status === 204
    ? (undefined as T)
    : (response.json() as Promise<T>)
}
export const api = {
  identity: <T>(path: string, options?: { method?: string; body?: unknown }) =>
    request<T>('identity', path, options),
  organization: <T>(
    path: string,
    options?: { method?: string; body?: unknown },
  ) => request<T>('organization', path, options),
  asset: <T>(path: string, options?: { method?: string; body?: unknown }) =>
    request<T>('asset', path, options),
  assetM2: <T>(path: string, options?: { method?: string; body?: unknown }) =>
    request<T>('assetM2', path, options),
  requests: <T>(path: string, options?: { method?: string; body?: unknown }) =>
    request<T>('requests', path, options),
  requestsLive: <T>(path: string, options?: { method?: string; body?: unknown }) =>
    request<T>('requestsLive', path, options),
  workorders: <T>(path: string, options?: { method?: string; body?: unknown }) =>
    request<T>('workorders', path, options),
  maintenance: <T>(path: string, options?: { method?: string; body?: unknown }) =>
    request<T>('maintenance', path, options),
}

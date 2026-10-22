import { getAccessToken, refresh } from '../auth/session'

export class ApiError extends Error {
  status: number
  code: string
  constructor(status: number, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}
type Area = 'organization' | 'asset' | 'requests'
const mode = import.meta.env.VITE_M1_API_MODE || 'mock'
export const isMockMode = mode !== 'gateway'
const bases: Record<Area, string> =
  mode === 'gateway'
    ? {
        organization: `${import.meta.env.VITE_GATEWAY_API_URL || '/gateway'}/api/organization`,
        asset: `${import.meta.env.VITE_GATEWAY_API_URL || '/gateway'}/api/assets`,
        requests: `${import.meta.env.VITE_GATEWAY_API_URL || '/gateway'}/api/service-requests`,
      }
    : {
        organization:
          import.meta.env.VITE_ORGANIZATION_API_URL || '/mock/organization',
        asset: import.meta.env.VITE_ASSET_API_URL || '/mock/asset',
        requests:
          import.meta.env.VITE_SERVICE_REQUEST_API_URL || '/mock/requests',
      }

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
  organization: <T>(
    path: string,
    options?: { method?: string; body?: unknown },
  ) => request<T>('organization', path, options),
  asset: <T>(path: string, options?: { method?: string; body?: unknown }) =>
    request<T>('asset', path, options),
  requests: <T>(path: string, options?: { method?: string; body?: unknown }) =>
    request<T>('requests', path, options),
}

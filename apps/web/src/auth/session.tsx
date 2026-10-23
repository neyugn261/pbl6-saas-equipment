/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { identityBase } from '../api/config'

export interface Profile {
  id: string
  tenantId: string | null
  customerId: string | null
  userType: 'PLATFORM_STAFF' | 'TENANT_STAFF' | 'CUSTOMER'
  email: string
  fullName: string
  roles: string[]
}
interface Tokens {
  accessToken: string
  refreshToken: string
}
const base = identityBase
const key = 'pbl6.session.refresh'
let accessToken = ''
let refreshPromise: Promise<string> | null = null
function store(tokens: Tokens) {
  accessToken = tokens.accessToken
  sessionStorage.setItem(key, tokens.refreshToken)
}
export function clearTokens() {
  accessToken = ''
  sessionStorage.removeItem(key)
  window.dispatchEvent(new Event('pbl6:session-cleared'))
}
export function getAccessToken() {
  return accessToken
}

async function json<T>(path: string, init: RequestInit): Promise<T> {
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init.headers },
  })
  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new Error(body.message || `Identity: ${response.status}`)
  }
  return response.json() as Promise<T>
}
export async function login(input: {
  email: string
  password: string
  tenantCode?: string
}): Promise<Profile> {
  const result = await json<Tokens & { user: Profile }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify(input),
  })
  store(result)
  try {
    return await me()
  } catch (error) {
    clearTokens()
    throw error
  }
}
export async function activate(input: {
  token: string
  password: string
}): Promise<Profile> {
  const result = await json<Tokens & { user: Profile }>('/users/activate', {
    method: 'POST',
    body: JSON.stringify(input),
  })
  store(result)
  try {
    return await me()
  } catch (error) {
    clearTokens()
    throw error
  }
}
export function refresh(): Promise<string> {
  if (refreshPromise) return refreshPromise
  const token = sessionStorage.getItem(key)
  if (!token) return Promise.reject(new Error('Phiên đăng nhập đã hết hạn.'))
  refreshPromise = json<Tokens>('/auth/refresh', {
    method: 'POST',
    body: JSON.stringify({ refreshToken: token }),
  })
    .then((result) => {
      store(result)
      return result.accessToken
    })
    .catch((error) => {
      clearTokens()
      throw error
    })
    .finally(() => {
      refreshPromise = null
    })
  return refreshPromise
}
export async function me(): Promise<Profile> {
  return json<Profile>('/auth/me', {
    method: 'GET',
    headers: { Authorization: `Bearer ${accessToken}` },
  })
}
export async function restoreSession(): Promise<Profile | null> {
  if (!sessionStorage.getItem(key)) return null
  try {
    await refresh()
    return await me()
  } catch {
    clearTokens()
    return null
  }
}
export async function logout() {
  const token = sessionStorage.getItem(key)
  clearTokens()
  if (token)
    await fetch(`${base}/auth/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: token }),
    }).catch(() => {})
}
interface SessionValue {
  profile: Profile | null
  setProfile: (profile: Profile | null) => void
  clear: () => void
}
const Context = createContext<SessionValue | null>(null)
export function SessionProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null)
  useEffect(() => {
    const clear = () => setProfile(null)
    window.addEventListener('pbl6:session-cleared', clear)
    return () => window.removeEventListener('pbl6:session-cleared', clear)
  }, [])
  return (
    <Context.Provider
      value={{
        profile,
        setProfile,
        clear: () => {
          clearTokens()
          setProfile(null)
        },
      }}
    >
      {children}
    </Context.Provider>
  )
}
export function useSession() {
  const value = useContext(Context)
  if (!value) throw new Error('SessionProvider missing')
  return value
}

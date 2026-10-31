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
let sessionGeneration = 0
export const getSessionGeneration = () => sessionGeneration
function assertGeneration(epoch: number) {
  if (epoch !== sessionGeneration)
    throw new Error('Phiên đăng nhập đã thay đổi.')
}
async function revoke(refreshToken: string) {
  await fetch(`${base}/auth/logout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
    signal: AbortSignal.timeout(5000),
  }).catch(() => undefined)
}
let refreshPromise: Promise<string> | null = null
function store(tokens: Tokens) {
  accessToken = tokens.accessToken
  sessionStorage.setItem(key, tokens.refreshToken)
}
export function clearTokens() {
  sessionGeneration++
  refreshPromise = null
  for (let i = sessionStorage.length - 1; i >= 0; i--) {
    const item = sessionStorage.key(i)
    if (item?.startsWith('pbl6.registration.')) sessionStorage.removeItem(item)
  }
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
  clearTokens()
  const epoch = sessionGeneration
  const result = await json<Tokens & { user: Profile }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify(input),
  })
  if (epoch !== sessionGeneration) {
    await revoke(result.refreshToken)
    assertGeneration(epoch)
  }
  store(result)
  try {
    return await me()
  } catch (error) {
    if (epoch === sessionGeneration) clearTokens()
    throw error
  }
}
export async function activate(input: {
  token: string
  password: string
}): Promise<Profile> {
  clearTokens()
  const epoch = sessionGeneration
  const result = await json<Tokens & { user: Profile }>('/users/activate', {
    method: 'POST',
    body: JSON.stringify(input),
  })
  if (epoch !== sessionGeneration) {
    await revoke(result.refreshToken)
    assertGeneration(epoch)
  }
  store(result)
  try {
    return await me()
  } catch (error) {
    if (epoch === sessionGeneration) clearTokens()
    throw error
  }
}
export function refresh(): Promise<string> {
  if (refreshPromise) return refreshPromise
  const token = sessionStorage.getItem(key)
  if (!token) return Promise.reject(new Error('Phiên đăng nhập đã hết hạn.'))
  const epoch = sessionGeneration
  const flight = json<Tokens>('/auth/refresh', {
    method: 'POST',
    body: JSON.stringify({ refreshToken: token }),
  })
    .then(async (result) => {
      if (epoch !== sessionGeneration) {
        await revoke(result.refreshToken)
        assertGeneration(epoch)
      }
      store(result)
      return result.accessToken
    })
    .catch((error) => {
      if (epoch === sessionGeneration) clearTokens()
      throw error
    })
    .finally(() => {
      if (refreshPromise === flight) refreshPromise = null
    })
  refreshPromise = flight
  return flight
}
export async function me(): Promise<Profile> {
  const epoch = sessionGeneration
  const profile = await json<Profile>('/auth/me', {
    method: 'GET',
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  assertGeneration(epoch)
  return profile
}
export async function restoreSession(): Promise<Profile | null> {
  if (!sessionStorage.getItem(key)) return null
  const epoch = sessionGeneration
  try {
    await refresh()
    return await me()
  } catch {
    if (epoch === sessionGeneration) clearTokens()
    return null
  }
}
export async function logout() {
  const token = sessionStorage.getItem(key)
  clearTokens()
  if (token) await revoke(token)
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

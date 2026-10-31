import { useEffect, useState } from 'react'
import { api, ApiError } from '../api/client'

export type DirectoryRow = {
  id: string
  name: string
  code?: string
  manufacturer?: string
  modelCode?: string
  status?: string
  address?: string
  email?: string
  phone?: string
  taxCode?: string
  category?: string
  description?: string
  assetCode?: string
  serialNumber?: string
}
export const setupRoles = ['TENANT_ADMIN', 'SERVICE_MANAGER']
export const errorText = (error: unknown) =>
  error instanceof ApiError
    ? `${error.status} · ${error.message}`
    : error instanceof Error
      ? error.message
      : 'Không thể tải dữ liệu.'
export function useDirectory<T>(
  area: 'organization' | 'assetM2' | 'maintenance',
  path: string | null,
  revision = 0,
) {
  const key = `${area}:${path}:${revision}`
  const [state, setState] = useState<{
    key: string
    value: T | null
    error: string
  }>({ key: '', value: null, error: '' })
  useEffect(() => {
    let active = true
    if (path)
      api[area]<T>(path).then(
        (value) => {
          if (active) setState({ key, value, error: '' })
        },
        (error) => {
          if (active) setState({ key, value: null, error: errorText(error) })
        },
      )
    return () => {
      active = false
    }
  }, [area, path, key])
  return path === null
    ? { value: null, error: '', loading: false }
    : state.key === key
      ? { ...state, loading: false }
      : { value: null, error: '', loading: true }
}

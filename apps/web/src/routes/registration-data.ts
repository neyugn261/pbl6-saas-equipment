import { useEffect, useState } from 'react'
import { api, ApiError } from '../api/client'
import { getSessionGeneration } from '../auth/session'

export type DirectoryRow = {
  defaultServicingBranchId?: string | null
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
  area:
    | 'organization'
    | 'assetM2'
    | 'maintenance'
    | 'identity'
    | 'workorders'
    | 'requestsLive',
  path: string | null,
  revision = 0,
) {
  const generation = getSessionGeneration()
  const key = `${area}:${path}:${revision}:${generation}`
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
          if (active && generation === getSessionGeneration())
            setState({ key, value, error: '' })
        },
        (error) => {
          if (active && generation === getSessionGeneration())
            setState({ key, value: null, error: errorText(error) })
        },
      )
    return () => {
      active = false
    }
  }, [area, path, key, generation])
  return path === null
    ? { value: null, error: '', loading: false }
    : state.key === key
      ? { value: state.value, error: state.error, loading: false }
      : { value: null, error: '', loading: true }
}

export function modelSetupError(error: unknown): string {
  if (error instanceof ApiError) {
    if (
      ['MODEL_POLICIES_MISSING', 'POLICY_NOT_CONFIGURED'].includes(error.code)
    )
      return 'Model chưa có đủ chính sách bảo hành và bảo trì đã công bố. Cấu hình cả hai phần, kể cả Không áp dụng có lý do, rồi tải lại chính sách.'
    if (error.code === 'MODEL_POLICIES_DISABLED')
      return 'Việc áp dụng chính sách mới đang tạm dừng. Bạn có thể lưu nháp và tiếp tục sau.'
  }
  return error instanceof ApiError
    ? errorText(error)
    : 'Chưa xác nhận được kết quả lưu. Tải lại kết quả đã lưu hoặc đối soát hồ sơ trước khi thử lại.'
}

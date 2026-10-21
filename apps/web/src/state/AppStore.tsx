/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, type ReactNode } from 'react'
import { mockService } from '../services/mock-service'
import type { RequestStatus, Role, ServiceRequest, WorkOrder } from '../types/domain'

interface Toast { id: number; title: string; description: string }
interface AppStoreValue {
  role: Role
  setRole: (role: Role) => void
  requests: ServiceRequest[]
  workOrders: WorkOrder[]
  createRequest: (request: Omit<ServiceRequest, 'id' | 'number' | 'createdAt' | 'timeline' | 'status' | 'attachments'>) => ServiceRequest
  updateRequestStatus: (id: string, status: RequestStatus, message?: string) => void
  approveEstimate: (id: string, approved: boolean) => void
  toasts: Toast[]
  notify: (title: string, description: string) => void
  dismissToast: (id: number) => void
}

const AppStore = createContext<AppStoreValue | null>(null)

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<Role>(() => (localStorage.getItem('pbl6.role') as Role | null) ?? 'TENANT_ADMIN')
  const [requests, setRequests] = useState(mockService.getRequests)
  const [workOrders] = useState(mockService.getWorkOrders)
  const [toasts, setToasts] = useState<Toast[]>([])

  const notify = (title: string, description: string) => {
    const id = Date.now()
    setToasts((current) => [...current, { id, title, description }])
    window.setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), 4200)
  }
  const dismissToast = (id: number) => setToasts((current) => current.filter((toast) => toast.id !== id))
  const changeRole = (nextRole: Role) => { setRole(nextRole); localStorage.setItem('pbl6.role', nextRole) }

  const update = (updater: (current: ServiceRequest[]) => ServiceRequest[]) => {
    setRequests((current) => {
      const next = updater(current)
      mockService.saveRequests(next)
      return next
    })
  }

  const createRequest: AppStoreValue['createRequest'] = (input) => {
    const now = new Date()
    const request: ServiceRequest = {
      ...input,
      id: `req-${Date.now()}`,
      number: `SR-${now.getFullYear()}-${String(requests.length + 99).padStart(4, '0')}`,
      createdAt: `${now.toLocaleDateString('vi-VN')} · ${now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`,
      status: 'NEW',
      attachments: 0,
      timeline: [{ id: `t-${Date.now()}`, title: 'Yêu cầu được tạo', description: 'Khách hàng gửi yêu cầu từ Customer Portal', time: 'Vừa xong', tone: 'success' }],
    }
    update((current) => [request, ...current])
    notify('Đã gửi yêu cầu', `${request.number} đã được chuyển đến bộ phận dịch vụ.`)
    return request
  }

  const updateRequestStatus = (id: string, status: RequestStatus, message?: string) => {
    update((current) => current.map((request) => request.id === id ? {
      ...request,
      status,
      timeline: [...request.timeline, { id: `t-${Date.now()}`, title: message ?? 'Trạng thái đã cập nhật', description: `Trạng thái mới: ${status}`, time: 'Vừa xong', tone: status === 'RESOLVED' || status === 'CLOSED' ? 'success' : 'warning' }],
    } : request))
    notify('Cập nhật thành công', 'Thay đổi đã được đồng bộ trên Admin và Customer Portal.')
  }

  const approveEstimate = (id: string, approved: boolean) => {
    update((current) => current.map((request) => request.id === id && request.estimate ? {
      ...request,
      status: approved ? 'ACCEPTED' : 'COST_REJECTED',
      estimate: { ...request.estimate, status: approved ? 'APPROVED' : 'REJECTED' },
      timeline: [...request.timeline, { id: `t-${Date.now()}`, title: approved ? 'Báo giá được phê duyệt' : 'Báo giá bị từ chối', description: approved ? 'Khách hàng đồng ý chi phí dự kiến' : 'Khách hàng từ chối chi phí dự kiến', time: 'Vừa xong', tone: approved ? 'success' : 'warning' }],
    } : request))
    notify(approved ? 'Đã duyệt báo giá' : 'Đã từ chối báo giá', 'Bộ phận dịch vụ đã nhận được phản hồi.')
  }

  const value = { role, setRole: changeRole, requests, workOrders, createRequest, updateRequestStatus, approveEstimate, toasts, notify, dismissToast }
  return <AppStore.Provider value={value}>{children}</AppStore.Provider>
}

export function useAppStore() {
  const value = useContext(AppStore)
  if (!value) throw new Error('useAppStore must be used within AppStoreProvider')
  return value
}

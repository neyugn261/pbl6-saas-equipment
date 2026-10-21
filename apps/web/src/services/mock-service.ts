import { initialRequests, initialWorkOrders } from '../data/mock-data'
import type { ServiceRequest, WorkOrder } from '../types/domain'

const REQUESTS_KEY = 'pbl6.service-requests'
const WORK_ORDERS_KEY = 'pbl6.work-orders'

function read<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(key)
    return value ? JSON.parse(value) as T : fallback
  } catch {
    return fallback
  }
}

export const mockService = {
  getRequests: () => read<ServiceRequest[]>(REQUESTS_KEY, initialRequests),
  saveRequests: (requests: ServiceRequest[]) => localStorage.setItem(REQUESTS_KEY, JSON.stringify(requests)),
  getWorkOrders: () => read<WorkOrder[]>(WORK_ORDERS_KEY, initialWorkOrders),
  saveWorkOrders: (workOrders: WorkOrder[]) => localStorage.setItem(WORK_ORDERS_KEY, JSON.stringify(workOrders)),
}


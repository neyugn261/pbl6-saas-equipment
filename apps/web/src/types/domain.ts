export type Role =
  | 'PLATFORM_ADMIN'
  | 'TENANT_ADMIN'
  | 'SERVICE_MANAGER'
  | 'DISPATCHER'
  | 'TECHNICIAN'
  | 'INVENTORY_STAFF'
  | 'CUSTOMER_ADMIN'
  | 'CUSTOMER_USER'
export type EquipmentStatus =
  'ACTIVE' | 'IN_SERVICE' | 'OUT_OF_SERVICE' | 'RETIRED'
export type RequestStatus =
  | 'NEW'
  | 'REVIEWING'
  | 'AWAITING_INFO'
  | 'AWAITING_CUSTOMER_APPROVAL'
  | 'ACCEPTED'
  | 'PROCESSING'
  | 'RESOLVED'
  | 'CLOSED'
  | 'REJECTED'
  | 'COST_REJECTED'
  | 'CANCELLED'
export type Priority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT'

// Wire types from the M1 OpenAPI contracts.
export interface Page<T> {
  items: T[]
  page: number
  pageSize: number
  total: number
}
export interface CustomerRecord {
  id: string
  code: string
  name: string
  status: 'ACTIVE' | 'INACTIVE'
  email: string | null
  phone: string | null
  address: string | null
}
export interface TenantRecord {
  id: string
  code: string
  name: string
  status: 'ACTIVE' | 'SUSPENDED' | 'DISABLED'
}
export interface EquipmentRecord {
  id: string
  modelId: string
  customerId: string
  customerSiteId: string
  assetCode: string
  serialNumber: string
  status: EquipmentStatus
  handoverDate: string | null
  model?: { name: string }
  warranty?: { result: 'IN_WARRANTY' | 'OUT_OF_WARRANTY' | 'NO_WARRANTY' }
}
export interface RequestRecord {
  id: string
  requestNo: string
  customerId: string
  equipmentId: string
  type: 'WARRANTY' | 'REPAIR' | 'MAINTENANCE' | 'INSPECTION'
  priority: Priority
  title: string
  description: string
  status: RequestStatus
  createdAt: string
}
export interface RequestDetail extends RequestRecord {
  resolutionResult?: 'RESOLVED' | 'PARTIALLY_RESOLVED' | 'UNRESOLVED' | null
  resolutionSummary?: string | null
  resolvedWorkOrderNo?: string | null
  resolutionCompletedAt?: string | null
  warrantyCheck: {
    result: 'IN_WARRANTY' | 'OUT_OF_WARRANTY' | 'NO_WARRANTY'
  } | null
  allowedActions: string[]
}
export interface RequestStatusChange {
  id: string
  oldStatus: RequestStatus | null
  newStatus: RequestStatus
  reason: string | null
  changedAt: string
}
export interface RequestComment {
  id: string
  authorUserId: string
  visibility: 'CUSTOMER' | 'INTERNAL'
  content: string
  createdAt: string
}

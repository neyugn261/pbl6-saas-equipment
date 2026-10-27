export type Role = 'PLATFORM_ADMIN' | 'TENANT_ADMIN' | 'SERVICE_MANAGER' | 'INVENTORY_STAFF' | 'CUSTOMER_ADMIN' | 'CUSTOMER_USER'
export type EquipmentStatus = 'ACTIVE' | 'OUT_OF_SERVICE' | 'RETIRED'
export type WarrantyStatus = 'ACTIVE' | 'EXPIRED'
export type RequestStatus = 'NEW' | 'REVIEWING' | 'AWAITING_CUSTOMER_APPROVAL' | 'ACCEPTED' | 'PROCESSING' | 'RESOLVED' | 'CLOSED' | 'REQUEST_REJECTED' | 'COST_REJECTED' | 'CANCELLED'
export type WorkOrderStatus = 'CREATED' | 'ASSIGNED' | 'ACCEPTED' | 'IN_PROGRESS' | 'ON_HOLD' | 'COMPLETED' | 'CANCELLED'
export type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'

export interface Customer { id: string; code: string; name: string; taxCode: string; industry: string; phone: string; email: string; address: string; contact: string }
export interface Location { id: string; customerId: string; name: string; type: string; address: string; parentId?: string }
export interface Equipment { id: string; assetCode: string; name: string; model: string; serial: string; customerId: string; locationId: string; status: EquipmentStatus; warranty: WarrantyStatus; warrantyEnd: string; installationDate: string; handoverDate: string; manufacturer: string }
export interface TimelineEvent { id: string; title: string; description: string; time: string; tone?: 'success' | 'warning' | 'default' }
export interface CostEstimate { labor: number; parts: number; other: number; status: 'PENDING' | 'APPROVED' | 'REJECTED' }
export interface ServiceRequest { id: string; number: string; customerId: string; equipmentId: string; type: string; priority: Priority; status: RequestStatus; title: string; description: string; createdAt: string; contact: string; attachments: number; estimate?: CostEstimate; timeline: TimelineEvent[] }
export interface WorkOrder { id: string; number: string; requestId: string; technicianId?: string; scheduledAt: string; status: WorkOrderStatus; priority: Priority; workLog: string; partsUsed: string[] }
export interface Technician { id: string; name: string; branch: string; skills: string[]; availability: 'AVAILABLE' | 'BUSY' | 'OFF'; workload: number; phone: string }
export interface Part { id: string; code: string; name: string; category: string; unit: string; stock: number; minimum: number; warehouse: string }
export interface MaintenancePlan { id: string; equipmentId: string; frequency: string; lastDate: string; nextDate: string; status: 'UPCOMING' | 'OVERDUE' | 'ACTIVE' }
export interface Tenant { id: string; code: string; name: string; status: 'ACTIVE' | 'SUSPENDED'; admin: string; users: number; customers: number; equipment: number; createdAt: string }


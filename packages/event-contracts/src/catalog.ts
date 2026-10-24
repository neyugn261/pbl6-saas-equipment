import { type Check, is, shapeProblems } from './checks';

/**
 * Event catalog v1 (docs/architecture/events.md). Each event has a type, a
 * version, the service that owns it and a payload contract checked at both
 * ends: `enqueueEvent` refuses an invalid payload, consumers dead-letter one.
 *
 * Changing a payload incompatibly = a new version (`TenantCreated` v2) next to
 * the old one, never an edit of v1. Adding an optional field is compatible.
 */
export interface EventDefinition<TPayload = unknown> {
  type: string;
  version: number;
  aggregateType: string;
  /** Only this service publishes the event. */
  producer: string;
  fields: Record<string, Check>;
  /** Phantom field that carries the payload type. */
  readonly __payload?: TPayload;
}

function define<TPayload>(
  definition: Omit<EventDefinition<TPayload>, '__payload'>,
): EventDefinition<TPayload> {
  return definition;
}

export type PayloadOf<D> = D extends EventDefinition<infer P> ? P : never;

export const TENANT_STATUSES = ['ACTIVE', 'SUSPENDED', 'DISABLED'] as const;
export type TenantStatus = (typeof TENANT_STATUSES)[number];

export const MEMBERSHIP_STATUSES = ['ACTIVE', 'INACTIVE'] as const;
export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];

export const SERVICE_REQUEST_STATUSES = [
  'NEW',
  'REVIEWING',
  'AWAITING_INFO',
  'AWAITING_CUSTOMER_APPROVAL',
  'ACCEPTED',
  'PROCESSING',
  'RESOLVED',
  'CLOSED',
  'REJECTED',
  'CANCELLED',
  'COST_REJECTED',
] as const;
export type ServiceRequestStatus = (typeof SERVICE_REQUEST_STATUSES)[number];

export const SERVICE_REQUEST_TYPES = [
  'WARRANTY',
  'REPAIR',
  'MAINTENANCE',
  'INSPECTION',
] as const;
export const PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const;

export interface TenantCreatedV1 {
  tenantId: string;
  code: string;
  name: string;
  status: TenantStatus;
}

export interface TenantStatusChangedV1 {
  tenantId: string;
  code: string;
  status: TenantStatus;
  previousStatus: TenantStatus;
  /** organization_db.tenants.updated_at; consumers ignore older changes. */
  changedAt: string;
}

export interface CustomerMembershipChangedV1 {
  membershipId: string;
  /** identity_db.users.id of a CUSTOMER account. */
  userId: string;
  customerId: string;
  status: MembershipStatus;
  /** organization_db.customer_user_memberships.updated_at; older changes are ignored. */
  changedAt: string;
}

export interface ServiceRequestCreatedV1 {
  serviceRequestId: string;
  requestNo: string;
  customerId: string;
  equipmentId: string;
  requesterId: string;
  type: (typeof SERVICE_REQUEST_TYPES)[number];
  priority: (typeof PRIORITIES)[number];
}

export interface ServiceRequestStatusChangedV1 {
  serviceRequestId: string;
  requestNo: string;
  customerId: string;
  equipmentId: string;
  fromStatus: ServiceRequestStatus | null;
  toStatus: ServiceRequestStatus;
  /** NULL when the change was made by an event, not a user. */
  changedBy: string | null;
  reason: string | null;
}

export const WORK_ORDER_TYPES = [
  'REPAIR',
  'WARRANTY',
  'MAINTENANCE',
  'INSPECTION',
] as const;
export const REPORT_RESULTS = [
  'RESOLVED',
  'PARTIALLY_RESOLVED',
  'UNRESOLVED',
] as const;

// Exactly one of serviceRequestId / maintenanceTaskId is set (work_orders CHECK).
interface WorkOrderOrigin {
  serviceRequestId: string | null;
  maintenanceTaskId: string | null;
}

export interface WorkOrderCreatedV1 extends WorkOrderOrigin {
  workOrderId: string;
  workOrderNo: string;
  equipmentId: string;
  customerId: string;
  type: (typeof WORK_ORDER_TYPES)[number];
  priority: (typeof PRIORITIES)[number];
}

export interface WorkOrderAssignedV1 {
  workOrderId: string;
  workOrderNo: string;
  technicianId: string;
  /** identity_db.users.id of the technician, for notifications. */
  technicianUserId: string;
  assignedBy: string;
  scheduledStart: string | null;
}

export interface WorkOrderCompletedV1 extends WorkOrderOrigin {
  workOrderId: string;
  workOrderNo: string;
  equipmentId: string;
  customerId: string;
  serviceReportId: string;
  result: (typeof REPORT_RESULTS)[number];
  completedAt: string;
}

export interface WorkOrderCompletedV2 extends WorkOrderCompletedV1 {
  /** Customer-facing summary; internal technician notes are never included. */
  customerSummary: string;
}

export interface WorkOrderCancelledV1 extends WorkOrderOrigin {
  workOrderId: string;
  workOrderNo: string;
  equipmentId: string;
  reason: string | null;
  cancelledAt: string;
}

export interface WorkOrderCancelledV2 extends WorkOrderCancelledV1 {
  /** False returns an unfinished request to ACCEPTED; true cancels it. */
  cancelServiceRequest: boolean;
}

export interface MaintenanceTaskDueV1 {
  maintenanceTaskId: string;
  maintenancePlanId: string;
  equipmentId: string;
  /** Snapshot kept by Maintenance so Work Order needs no synchronous call. */
  customerId: string;
  customerSiteId: string | null;
  scheduledDate: string;
  title: string;
}

export interface LowStockDetectedV1 {
  stockId: string;
  partId: string;
  partSku: string;
  warehouseId: string;
  /** Decimal strings. */
  quantity: string;
  minQuantity: string;
}

export const Events = {
  TenantCreated: define<TenantCreatedV1>({
    type: 'TenantCreated',
    version: 1,
    aggregateType: 'Tenant',
    producer: 'organization-service',
    fields: {
      tenantId: is.uuid,
      code: is.string(50),
      name: is.string(200),
      status: is.oneOf(TENANT_STATUSES),
    },
  }),
  TenantStatusChanged: define<TenantStatusChangedV1>({
    type: 'TenantStatusChanged',
    version: 1,
    aggregateType: 'Tenant',
    producer: 'organization-service',
    fields: {
      tenantId: is.uuid,
      code: is.string(50),
      status: is.oneOf(TENANT_STATUSES),
      previousStatus: is.oneOf(TENANT_STATUSES),
      changedAt: is.isoDateTime,
    },
  }),
  CustomerMembershipChanged: define<CustomerMembershipChangedV1>({
    type: 'CustomerMembershipChanged',
    version: 1,
    aggregateType: 'CustomerUserMembership',
    producer: 'organization-service',
    fields: {
      membershipId: is.uuid,
      userId: is.uuid,
      customerId: is.uuid,
      status: is.oneOf(MEMBERSHIP_STATUSES),
      changedAt: is.isoDateTime,
    },
  }),
  ServiceRequestCreated: define<ServiceRequestCreatedV1>({
    type: 'ServiceRequestCreated',
    version: 1,
    aggregateType: 'ServiceRequest',
    producer: 'service-request-service',
    fields: {
      serviceRequestId: is.uuid,
      requestNo: is.string(50),
      customerId: is.uuid,
      equipmentId: is.uuid,
      requesterId: is.uuid,
      type: is.oneOf(SERVICE_REQUEST_TYPES),
      priority: is.oneOf(PRIORITIES),
    },
  }),
  ServiceRequestStatusChanged: define<ServiceRequestStatusChangedV1>({
    type: 'ServiceRequestStatusChanged',
    version: 1,
    aggregateType: 'ServiceRequest',
    producer: 'service-request-service',
    fields: {
      serviceRequestId: is.uuid,
      requestNo: is.string(50),
      customerId: is.uuid,
      equipmentId: is.uuid,
      fromStatus: is.nullable(is.oneOf(SERVICE_REQUEST_STATUSES)),
      toStatus: is.oneOf(SERVICE_REQUEST_STATUSES),
      changedBy: is.nullable(is.uuid),
      reason: is.nullable(is.string(2000)),
    },
  }),
  WorkOrderCreated: define<WorkOrderCreatedV1>({
    type: 'WorkOrderCreated',
    version: 1,
    aggregateType: 'WorkOrder',
    producer: 'workorder-service',
    fields: {
      workOrderId: is.uuid,
      workOrderNo: is.string(50),
      serviceRequestId: is.nullable(is.uuid),
      maintenanceTaskId: is.nullable(is.uuid),
      equipmentId: is.uuid,
      customerId: is.uuid,
      type: is.oneOf(WORK_ORDER_TYPES),
      priority: is.oneOf(PRIORITIES),
    },
  }),
  WorkOrderAssigned: define<WorkOrderAssignedV1>({
    type: 'WorkOrderAssigned',
    version: 1,
    aggregateType: 'WorkOrder',
    producer: 'workorder-service',
    fields: {
      workOrderId: is.uuid,
      workOrderNo: is.string(50),
      technicianId: is.uuid,
      technicianUserId: is.uuid,
      assignedBy: is.uuid,
      scheduledStart: is.nullable(is.isoDateTime),
    },
  }),
  WorkOrderCompleted: define<WorkOrderCompletedV1>({
    type: 'WorkOrderCompleted',
    version: 1,
    aggregateType: 'WorkOrder',
    producer: 'workorder-service',
    fields: {
      workOrderId: is.uuid,
      workOrderNo: is.string(50),
      serviceRequestId: is.nullable(is.uuid),
      maintenanceTaskId: is.nullable(is.uuid),
      equipmentId: is.uuid,
      customerId: is.uuid,
      serviceReportId: is.uuid,
      result: is.oneOf(REPORT_RESULTS),
      completedAt: is.isoDateTime,
    },
  }),
  WorkOrderCompletedV2: define<WorkOrderCompletedV2>({
    type: 'WorkOrderCompleted',
    version: 2,
    aggregateType: 'WorkOrder',
    producer: 'workorder-service',
    fields: {
      workOrderId: is.uuid,
      workOrderNo: is.string(50),
      serviceRequestId: is.nullable(is.uuid),
      maintenanceTaskId: is.nullable(is.uuid),
      equipmentId: is.uuid,
      customerId: is.uuid,
      serviceReportId: is.uuid,
      result: is.oneOf(REPORT_RESULTS),
      completedAt: is.isoDateTime,
      customerSummary: is.string(2000),
    },
  }),
  WorkOrderCancelled: define<WorkOrderCancelledV1>({
    type: 'WorkOrderCancelled',
    version: 1,
    aggregateType: 'WorkOrder',
    producer: 'workorder-service',
    fields: {
      workOrderId: is.uuid,
      workOrderNo: is.string(50),
      serviceRequestId: is.nullable(is.uuid),
      maintenanceTaskId: is.nullable(is.uuid),
      equipmentId: is.uuid,
      reason: is.nullable(is.string(2000)),
      cancelledAt: is.isoDateTime,
    },
  }),
  WorkOrderCancelledV2: define<WorkOrderCancelledV2>({
    type: 'WorkOrderCancelled',
    version: 2,
    aggregateType: 'WorkOrder',
    producer: 'workorder-service',
    fields: {
      workOrderId: is.uuid,
      workOrderNo: is.string(50),
      serviceRequestId: is.nullable(is.uuid),
      maintenanceTaskId: is.nullable(is.uuid),
      equipmentId: is.uuid,
      reason: is.nullable(is.string(2000)),
      cancelledAt: is.isoDateTime,
      cancelServiceRequest: (value) => typeof value === 'boolean',
    },
  }),
  MaintenanceTaskDue: define<MaintenanceTaskDueV1>({
    type: 'MaintenanceTaskDue',
    version: 1,
    aggregateType: 'MaintenanceTask',
    producer: 'maintenance-service',
    fields: {
      maintenanceTaskId: is.uuid,
      maintenancePlanId: is.uuid,
      equipmentId: is.uuid,
      customerId: is.uuid,
      customerSiteId: is.nullable(is.uuid),
      scheduledDate: is.isoDate,
      title: is.string(200),
    },
  }),
  LowStockDetected: define<LowStockDetectedV1>({
    type: 'LowStockDetected',
    version: 1,
    aggregateType: 'Stock',
    producer: 'inventory-service',
    fields: {
      stockId: is.uuid,
      partId: is.uuid,
      partSku: is.string(100),
      warehouseId: is.uuid,
      quantity: is.decimal,
      minQuantity: is.decimal,
    },
  }),
} as const;

export type EventName = keyof typeof Events;

export const ALL_EVENTS: readonly EventDefinition[] = Object.values(Events);

export function findEventDefinition(
  type: string,
  version: number,
): EventDefinition | undefined {
  return ALL_EVENTS.find(
    (definition) => definition.type === type && definition.version === version,
  );
}

export function payloadProblems(
  definition: EventDefinition,
  payload: unknown,
): string[] {
  return shapeProblems(payload, definition.fields);
}

/** Topic exchange every service publishes to. */
export const EVENTS_EXCHANGE = 'pbl6.events';

/** `TenantCreated.v1` — consumers bind exactly the versions they understand. */
export function routingKey(
  definition: Pick<EventDefinition, 'type' | 'version'>,
): string {
  return `${definition.type}.v${definition.version}`;
}

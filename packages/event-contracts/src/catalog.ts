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
export function routingKey(definition: Pick<EventDefinition, 'type' | 'version'>): string {
  return `${definition.type}.v${definition.version}`;
}

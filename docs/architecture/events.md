# Versioned event catalog

Transport, envelope and guarantees: [ADR 0005](../decisions/0005-event-transport.md).
The executable contract is `Events` in
[`packages/event-contracts/src/catalog.ts`](../../packages/event-contracts/src/catalog.ts);
this page and that file must change in the same PR.

## Events

| Event (routing key) | Producer | Aggregate | Payload | Consumers |
|---|---|---|---|---|
| `TenantCreated.v1` | organization-service | Tenant | `tenantId, code, name, status` | identity-service.directory → `tenant_directory` |
| `TenantStatusChanged.v1` | organization-service | Tenant | `tenantId, code, status, previousStatus, changedAt` | identity-service.directory → `tenant_directory` |
| `CustomerMembershipChanged.v1` | organization-service | CustomerUserMembership | `membershipId, userId, customerId, status (ACTIVE\|INACTIVE), changedAt` | identity-service.directory → `user_customer_links` (ADR 0003) |
| `ServiceRequestCreated.v1` | service-request-service | ServiceRequest | `serviceRequestId, requestNo, customerId, equipmentId, requesterId, type, priority` | notification (M3) |
| `ServiceRequestStatusChanged.v1` | service-request-service | ServiceRequest | `serviceRequestId, requestNo, customerId, equipmentId, fromStatus, toStatus, changedBy, reason` | notification (M3), asset history (M2), workorder (toStatus CANCELLED → cancels the live Work Order, ADR 0008 D4) |

`tenantId` is in the envelope, not repeated in payloads (except tenant events,
where it is the aggregate).

Defined ahead of their milestone (so producers and consumers can be built in
parallel; the producer may still refine them through a PR before first use).
`WorkOrderCompleted` and `WorkOrderCancelled` start at v2 (ADR 0008 D4a, D6a):
their v1 was never published. Consumers retain v1 validation for compatibility
with pre-release or already queued messages; producers publish v2:

| Event (routing key) | Producer | Milestone | Payload | Consumers |
|---|---|---|---|---|
| `WorkOrderCreated.v1` | workorder-service | M2 | `workOrderId, workOrderNo, serviceRequestId\|null, maintenanceTaskId\|null, equipmentId, customerId, type, priority` | service-request (→ PROCESSING), maintenance (task ↔ WO) |
| `WorkOrderAssigned.v1` | workorder-service | M2 | `workOrderId, workOrderNo, technicianId, technicianUserId, assignedBy, scheduledStart\|null` | notification (M3) |
| `WorkOrderCompleted.v1` | — (compatibility only) | legacy compatibility | `workOrderId, workOrderNo, serviceRequestId\|null, maintenanceTaskId\|null, equipmentId, customerId, serviceReportId, result, completedAt` | service-request (→ RESOLVED / ACCEPTED), asset (`equipment_history`), maintenance |
| `WorkOrderCompleted.v2` | workorder-service | M2 | `WorkOrderCompleted.v1` fields + `customerSummary` | service-request (→ RESOLVED / ACCEPTED, stores the customer summary, ADR 0008 D6a), asset (`equipment_history`), maintenance |
| `WorkOrderCancelled.v1` | — (compatibility only) | legacy compatibility | `workOrderId, workOrderNo, serviceRequestId\|null, maintenanceTaskId\|null, equipmentId, reason\|null, cancelledAt` | service-request (→ ACCEPTED), maintenance (release task, ADR 0002) |
| `WorkOrderCancelled.v2` | workorder-service | M2 | `WorkOrderCancelled.v1` fields + `cancelServiceRequest` | service-request (→ CANCELLED when `cancelServiceRequest`, else → ACCEPTED; ADR 0008 D4a), maintenance |
| `MaintenanceTaskDue.v1` | maintenance-service | M2 | `maintenanceTaskId, maintenancePlanId, equipmentId, customerId, customerSiteId\|null, scheduledDate (YYYY-MM-DD), title` | workorder (create WO) |
| `LowStockDetected.v1` | inventory-service | M3 | `stockId, partId, partSku, warehouseId, quantity, minQuantity` (decimal strings) | notification (M3) |

`MaintenanceTaskDue` carries a customer snapshot because event consumers do
not call other services synchronously (ADR 0004); Maintenance keeps that
snapshot on the plan. Its payload has no `createdBy`: the scheduler creates
the task, and Work Order records `created_by = NULL` for the resulting
system-created order (ADR 0007 D12e and ADR 0008 D5).

## Adding or changing an event

1. Add the definition to `catalog.ts` (type, version, aggregate, producer,
   field checks) and a row above; add a test for a valid and an invalid payload.
2. Incompatible change (field removed, renamed, meaning changed) = new version
   (`v2`) next to `v1`. The producer publishes both until every consumer
   moved, then `v1` is removed in a later PR.
3. The PR needs a review from the producer's owner and from every consumer's
   owner.

## Consumers

| Queue | Service | Handles |
|---|---|---|
| `identity-service.directory` | identity-service | TenantCreated v1, TenantStatusChanged v1, CustomerMembershipChanged v1 |
| `service-request-service.work-orders` | service-request-service | WorkOrderCreated v1, WorkOrderCompleted v1/v2, WorkOrderCancelled v1/v2 |

Each queue has `<queue>.retry` and `<queue>.dlq`.

## Operations

- **Outbox row `FAILED`** (`SELECT * FROM outbox_events WHERE status='FAILED'`):
  fix the cause, then `UPDATE outbox_events SET status='PENDING',
  attempt_count=0, available_at=now() WHERE id=...`.
- **Message in `<queue>.dlq`**: inspect it in the RabbitMQ console
  (http://localhost:15672, Queues → `<queue>.dlq` → Get messages). After the
  fix, move it back with the console's *Move messages* (shovel plugin) or
  republish it to `pbl6.events` with its routing key. Handlers are idempotent,
  so a replay is safe.

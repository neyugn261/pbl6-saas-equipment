# Event catalog v1

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
| `ServiceRequestCreated.v1` | service-request-service | ServiceRequest | `serviceRequestId, requestNo, customerId, equipmentId, requesterId, type, priority` | notification (M4) |
| `ServiceRequestStatusChanged.v1` | service-request-service | ServiceRequest | `serviceRequestId, requestNo, customerId, equipmentId, fromStatus, toStatus, changedBy, reason` | notification (M4), asset history (M2) |

`tenantId` is in the envelope, not repeated in payloads (except tenant events,
where it is the aggregate).

## Planned (owners add them with their milestone)

| Event | Producer | Milestone | Main consumers |
|---|---|---|---|
| `WorkOrderCreated` | workorder-service | M2 | service-request (→ PROCESSING), maintenance (task ↔ WO) |
| `WorkOrderAssigned` | workorder-service | M2 | notification |
| `WorkOrderCompleted` | workorder-service | M2 | service-request (→ RESOLVED), asset (`equipment_history`), maintenance |
| `WorkOrderCancelled` | workorder-service | M2 | service-request (→ ACCEPTED), maintenance (release task, ADR 0002) |
| `MaintenanceTaskDue` | maintenance-service | M3 | workorder (create WO) |
| `LowStockDetected` | inventory-service | M3 | notification |

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

# Notification recipient matrix (M3)

The Q3 recipient projection and public API scope are implemented locally. The
shared snapshot/bootstrap event definitions and Identity producer are not yet
in the shared event catalog, so Notification does not bind those event names.
Notification binds only existing business-event versions from the catalog.
Event names and payloads must match
[the event catalog](../architecture/events.md). User and customer scope must
follow [ADR 0003](../decisions/0003-customer-scope.md) and
[ADR 0004](../decisions/0004-service-auth-and-authorization.md).

Huy's detailed Q3 contract/schema and pending-fan-out review is in
[M3-HUY-Q3-REVIEW.md](../../apps/notification-service/M3-HUY-Q3-REVIEW.md).
The matrix is the audience and content policy for those bindings. The
recipient snapshot/bootstrap broker integration remains blocked until its
shared contracts and Identity producer are merged.

## M3 recipient policy (implemented for catalogued business events)

The version suffixes below are the exact catalog versions. Notification binds
only these versions; it must not consume compatibility-only Work Order v1
completion/cancellation events or infer a new version. Runtime fan-out remains
fail-closed until the required local recipient and Service Request projections
exist.

| Catalog event | Producer | Proposed recipients and scope | Allowlisted template data | Navigation/resource |
|---|---|---|---|---|
| `ServiceRequestCreated.v1` | `service-request-service` | Exact `requesterId`; additionally active SERVICE_MANAGER and DISPATCHER memberships in envelope tenant. Customer requester means that one user only, never every CUSTOMER user. | Request number, type, priority, generic created message. No title, description or comments. | `SERVICE_REQUEST` + `serviceRequestId` for requester and staff. |
| `ServiceRequestStatusChanged.v1` | `service-request-service` | Original requester from the local Created projection; active SERVICE_MANAGER and DISPATCHER memberships in envelope tenant. Do not separately notify `changedBy`. | Request number and `toStatus` using a status allowlist. Ignore `reason`, even for CUSTOMER. | `SERVICE_REQUEST` + `serviceRequestId`. |
| `WorkOrderAssigned.v1` | `workorder-service` | Exact `technicianUserId` in envelope tenant, after active membership/role validation. Previous technician/reassignment policy remains unresolved. | Work Order number and `scheduledStart` only. | Staff-only Work Order reference. |
| `WorkOrderCreated.v1` | `workorder-service` | Active SERVICE_MANAGER and DISPATCHER memberships in envelope tenant. Requester only when `serviceRequestId` resolves through the SR projection; no customer audience for maintenance-origin orders. | Work Order number and generic created message. No internal reason/notes. | Staff may use the Work Order reference; customer must use the associated `SERVICE_REQUEST` reference only. |
| `WorkOrderCompleted.v2` | `workorder-service` | Active SERVICE_MANAGER and DISPATCHER memberships; original requester only when a Service Request projection exists. No customer audience for maintenance-origin orders. | Staff: Work Order number and result. Customer: request number and allowlisted `customerSummary`/completion status only. Never report notes or attachment/storage metadata. | Customer: `SERVICE_REQUEST` + its ID. Staff: Work Order reference. |
| `WorkOrderCancelled.v2` | `workorder-service` | Active SERVICE_MANAGER and DISPATCHER memberships only. The customer-facing cancellation is represented by the Service Request status event; `cancelServiceRequest=false` does not cancel the request. | Generic staff cancellation text. Never render `reason`. | Staff: Work Order reference. Customer: no Work Order cancellation notice. |
| `LowStockDetected.v1` | `inventory-service` | Active INVENTORY_STAFF memberships in envelope tenant only. Do not notify CUSTOMER or PLATFORM_STAFF. | SKU and decimal quantity/minimum values. No supplier, procurement or internal notes. | Staff-only stock reference. |

The projection, revision, bootstrap, and membership model are approved; the
local projection and business-event processor implement these rules. Event
delivery still requires the recipient's account to be ACTIVE and authorized for
`notification:read`; current role-to-permission links are in the shared RBAC
catalog. PLATFORM_STAFF has no tenant scope and is excluded until an explicit
platform-wide policy exists. Maintenance-only events have no CUSTOMER audience.

### Replay, ordering, membership and bootstrap policy

- The existing notification DB uniqueness is `(source_event_id, user_id,
  channel)` when `source_event_id` is non-null. Replaying the same event to the
  same recipient/channel is a no-op. Do not claim semantic deduplication
  between different event IDs: the event contract has no shared transition
  identity, and a distinct assignment/status event may be meaningful. Agree a
  stable semantic key before adding suppression across event IDs.
- A status event before its Service Request Created projection, or a Work Order
  event before its Service Request projection, must remain retryable/pending;
  it must not be ACKed, dropped or fanned out to an unscoped audience. Inbox
  acknowledgement is allowed only after local projection/notification writes
  commit.
- The approved Q3 design requires snapshots to be applied monotonically using an Identity-owned
  source revision (or reviewed timestamp ordering). Inactive users and
  inactive/revoked customer memberships are not recipients. A later revocation
  affects CUSTOMER reads after the projection event is applied. Notification
  migrations `0002` and `0003` have been applied and drift-checked only on
  `notification_test_db`; do not apply them automatically to other databases.
- Q3 approves a replay-safe Identity bootstrap snapshot followed by the same
  event stream. The core handlers are implemented, but no broker binding is
  active until the shared contracts and Identity producer are merged. No
  consumer may bootstrap via synchronous Identity/Organization calls or
  impersonate a Tenant Admin. Missing-recipient behavior remains fail-closed
  and fan-out stays pending until the relevant projection exists.

### Public API and owner decisions

The contract in [notification.yaml](notification.yaml) defines service-local
`/notifications`, `/notifications/unread-count` and
`/notifications/{notificationId}/read`; Gateway's current public mapping is
`/api/notifications[/*]` → `/notifications[/*]`. The response exposes only
allowlisted title/body/resource fields, not source payloads or customer/internal
metadata. The API has authenticated service-level HTTP and PostgreSQL
integration coverage. Customer navigation always uses the authorized Service
Request; never expose an internal Work Order URL to a customer. UI route names
and deep-link handling still need confirmation from the Web/Mobile owner.

Remaining external handoffs:

- **Nguyên / Identity + shared catalog:** merge the approved snapshot and
  bootstrap contracts and Identity producer; review revision/replay behavior
  and the explicit PLATFORM_STAFF exclusion.
- **Khương / Work Order:** confirm exact customer audience for v2 completion
  and cancellation, reassignment behavior, and whether a Work Order transition
  can be semantically duplicated under a new event ID.
- **Minh / Inventory:** deliver the `LowStockDetected.v1` producer and approve
  threshold/re-alert suppression policy and the inventory read destination.
- **Hatsady / Web and Mobile:** confirm screen routes/deep links and the
  customer-safe `SERVICE_REQUEST` navigation mapping.
- **Huy / Notification + schema reviewer:** review additive recipient
  `customerId` persistence and C2 scope tests before migration deployment.

## Data source and owner handoff

| Event / flow | Source available without a synchronous consumer lookup | Owners to coordinate | Approval still needed |
| --- | --- | --- | --- |
| ServiceRequestCreated.v1 | Envelope tenant; payload requester/customer/equipment/request IDs | Huy (SR), Identity owner, Notification owner | Directory of ACTIVE service staff with notification:read; duplicate NEW status notice suppression |
| ServiceRequestStatusChanged.v1 | Payload status and IDs; requester from the local Created-event projection | Huy, Notification owner | Durable handling when StatusChanged arrives before Created; no unscoped fallback recipient |
| WorkOrderCreated.v1 / Completed.v2 / Cancelled.v2 | Envelope tenant and payload serviceRequestId; requester/customer audience from the SR projection | Work Order owner, Huy, Notification owner | Apply ADR 0008 D6/D6a; customer links must point to SERVICE_REQUEST and its ID, never a Work Order/report API. Maintenance-only events have no CUSTOMER recipient under this proposal. |
| WorkOrderAssigned.v1 | Exact technicianUserId and scheduledStart from payload | Work Order owner, Identity owner, mobile/web owner | ACTIVE recipient validation and reassignment policy; read link also requires work_order:read and assignment scope |
| LowStockDetected.v1 | Payload stockId, partSku and exact decimal quantities | Inventory owner, Identity owner, Notification/web owner | M3 producer, threshold/suppression policy and inventory:read when following the link |
| Account activation (ADR 0008 D8) | No activation event exists in the accepted event catalog | Identity owner, Notification owner, shared catalog owner | Separate reviewed contract before implementation; do not embed activation tokens in list/title/body/resourceId, logs or a reusable notification event |

All recipients must still hold `notification:read` and the account type and
tenant/customer scope of their notification. For CUSTOMER, re-check that the
current token customer matches the notification's customer context; switching
membership must not expose messages for the previous customer. The platform
admin case (`tenantId` null) requires an explicit M3 scope decision, rather
than passing through `dataScope()` as a tenant user.

For every Work Order row above, the Resource reference column is staff-facing
when it names a Work Order ID. CUSTOMER content and links use only the
associated Service Request. Never deliver customer-facing Work Order data
solely because a customerId was present on a maintenance event. Raw `reason`,
INTERNAL comments, attachments, report notes and full event payloads are not
notification body data. The customer-safe `customerSummary` is allowlisted
only for Completed.v2.

Web/mobile currently have no Notification API consumer in this checkout.
Confirm `readAt`, `unreadCount`, pagination and route mapping with their owners.
The Gateway maps public `/api/notifications[/*]` to Notification Service
`/notifications[/*]`; UI clients use the public path once. Gateway E2E covers
route mapping; a live Gateway-to-Notification service integration was not run.
The configured Notification port is 3005; 3008 belongs to Inventory.

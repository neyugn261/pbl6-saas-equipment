# Notification recipient matrix (M3 draft)

This is a planning contract only; M2 does not implement Notification Service,
delivery, inbox persistence or recipient resolution. Event names and payloads
must match [the event catalog](../architecture/events.md). User and customer
scope must follow [ADR 0003](../decisions/0003-customer-scope.md) and
[ADR 0004](../decisions/0004-service-auth-and-authorization.md).

| Event / version                  | Producer                  | Recipient group                                  | Role/user/customer filter                                                                                                  | Allowed display data                                                                                            | Resource reference                                             | Idempotency key             | Duplicate policy                                                                                    | Open question / dependency                                                                                 |
| -------------------------------- | ------------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | --------------------------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `ServiceRequestCreated.v1`       | `service-request-service` | Requester; tenant service staff                  | Exact `requesterId`; staff roles SERVICE_MANAGER / DISPATCHER in `tenantId`                                                | Request number, request type, priority, generic created text; no description or comments                        | Service Request ID                                             | `eventId + recipientUserId` | Unique per event and recipient; repeated delivery is a no-op                                        | Identity recipient directory and notification consumer auth are not agreed.                                |
| `ServiceRequestStatusChanged.v1` | `service-request-service` | Requester; tenant service staff                  | Resolve requester from stored ServiceRequestCreated reference; staff roles SERVICE_MANAGER / DISPATCHER in envelope tenant | Request number, new status, safe template only; never render raw `reason` for CUSTOMER                          | Service Request ID                                             | `eventId + recipientUserId` | Unique per event and recipient; do not notify `changedBy` unless they are independently a recipient | Confirm status-specific audience and whether CUSTOMER membership recipients beyond requester are required. |
| `WorkOrderCreated.v1`            | `workorder-service`       | Tenant service staff; request customer requester | Staff roles SERVICE_MANAGER / DISPATCHER; customer recipient must be resolved from Service Request event/read model        | Work Order number and generic assignment/created notice; do not expose staff-only Work Order fields to CUSTOMER | Work Order ID; optionally Service Request ID only when present | `eventId + recipientUserId` | Unique per event and recipient                                                                      | No requester ID in payload. No synchronous cross-service lookup is assumed.                                |
| `WorkOrderAssigned.v1`           | `workorder-service`       | Assigned technician                              | Exact `technicianUserId`, tenant from envelope                                                                             | Work Order number and `scheduledStart`; no internal work logs                                                   | Work Order ID                                                  | `eventId + recipientUserId` | Unique per event and recipient                                                                      | Confirm whether reassignment should notify the previous technician as well.                                |
| `WorkOrderCompleted.v2`          | `workorder-service`       | Requester/customer; tenant service staff         | Customer recipient resolved from Service Request read model; staff roles SERVICE_MANAGER / DISPATCHER                      | For CUSTOMER: `result`, `customerSummary`, `completedAt`, `workOrderNo` only; never report/internal notes       | Service Request ID when associated, otherwise Work Order ID    | `eventId + recipientUserId` | Unique per event and recipient; ignore legacy v1 for customer-summary notifications                 | Establish customer recipient read model and whether legacy v1 gets a generic notice.                       |
| `WorkOrderCancelled.v2`          | `workorder-service`       | Requester/customer; tenant service staff         | Customer recipient resolved from Service Request read model; staff roles SERVICE_MANAGER / DISPATCHER                      | Generic cancellation text; do not expose internal reason to CUSTOMER                                            | Service Request ID when associated, otherwise Work Order ID    | `eventId + recipientUserId` | Unique per event and recipient                                                                      | Confirm whether cancellation initiated by Service Request should suppress a duplicate notification.        |
| `LowStockDetected.v1`            | `inventory-service`       | Tenant inventory staff                           | Role INVENTORY_STAFF in envelope tenant; possibly SERVICE_MANAGER after business review                                    | Part SKU and quantity/minimum as decimal strings; no supplier or procurement data                               | Stock ID                                                       | `eventId + recipientUserId` | Unique per event and recipient; repeated threshold events need a dedupe window decision             | Event is M3; confirm alert threshold, recipient roles and dedupe/suppression window.                       |

## Recipient resolution dependencies

- Identity currently offers an internal user list filtered by `role`,
  `userType` and `status` for tenant staff. The Notification consumer has no
  agreed service credential under ADR 0004, and event consumers should not add
  an uncontracted synchronous dependency.
- That list does not filter CUSTOMER users by `customerId`. `CustomerMembershipChanged.v1`
  contains the membership changes, but Notification is not currently an
  approved consumer. A local customer-recipient read model or an Identity
  directory event/API must be reviewed before customer-wide notifications.
- Events with an exact recipient user ID (`requesterId`,
  `technicianUserId`) can be targeted without resolving a role directory.
- Persist notifications with `(eventId, recipientUserId)` uniqueness. Keep
  envelope `tenantId` on every row and authorize reads/updates by both the
  verified user and tenant; customer scope must also match for CUSTOMER users.

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
The current Gateway strips `/api/notifications`, so the draft local
`/notifications` path would publicly be `/api/notifications/notifications`;
choose the final public mapping with the Gateway owner before M3. Do not
silently repeat that prefix in UI code. The configured Notification port is
3005; 3008 belongs to Inventory.

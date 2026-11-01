# M3-D1/D4 integration decisions for review

Status: **draft for Huy, Khương and Nguyên review**. This note does not amend
ADR 0004 or approve a new event. It records the contract needed before Identity
producer and mobile file code can be integrated.

## Q3 — Notification recipient directory

Identity currently has no business-event outbox. Notification cannot call
Identity's `/internal/users` from an event consumer under ADR 0004, and that
endpoint cannot list CUSTOMER accounts by customer ID. The existing
`CustomerMembershipChanged.v1` reaches Identity but is not a complete account
status/role feed for Notification.

Proposed contract for review: Identity publishes a versioned recipient snapshot
event after invite, activation, status change, role change and accepted customer
membership change. Payload contains `userId`, `tenantId`, `userType`, `status`,
role codes, active `customerId` (if applicable) and a monotonic source revision
or timestamp. It contains no email, token, name or notification body. Identity
persists the change and outbox entry in one local transaction; for membership
events, inbox and downstream outbox commit together. Notification stores a
tenant-scoped local projection and ignores older updates. A one-time Identity
bootstrap command emits snapshots for accounts that predate the new event;
re-running it must be safe. The producer and consumer should test out-of-order
delivery and a changed CUSTOMER membership before sending customer notices.

Review must still decide the event name/version, revision ordering, audience
for each business event, suppression on disabled accounts, what to do when a
business event precedes its recipient snapshot, and whether PLATFORM_STAFF
receives any M3 notification. No service should mint a Tenant Admin token for
this consumer.

## Q4 — Activation email

Identity creates a raw single-use activation token; production API responses
hide it. The accepted event catalog has no activation-delivery contract.
Publishing the raw token in a reusable notification event or notification row
would expose a credential to broker consumers and inbox readers. Huy and
Nguyên need to choose the delivery owner and retry boundary before code:
either an Identity-owned private delivery outbox/SMTP adapter, or a dedicated
Notification delivery command with a protected secret transport and an approved
service authorization model. The review should specify expiry, replay,
redaction, delivery failure and the demo mail sink. An ordinary
`NotificationRequested` event without token handling is insufficient for
account activation.

## Q1/Q6 — Mobile file dependency

Gateway routes Work Order API requests through `/api/workorders/*`; MinIO bytes
go directly to its public S3 endpoint. The demo Compose stack now creates a
private bucket and limits browser CORS to `DEMO_PUBLIC_URL`. Work Order still
has no implemented K8 prepare/finalize/download API or signing adapter. Mobile
can validate file size/type and model retry state against K8, but a live upload,
signed URL and Android acceptance case require A2/A3 and a reviewed public
storage endpoint. API JWT must never be sent to the S3 PUT URL.

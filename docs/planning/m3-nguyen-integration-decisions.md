# M3 — Nguyên's Q3/Q4/Q6 proposal for Huy's review

This 02/11 draft is superseded for handoff by
[Nguyên's Q3/Q4/Q6 decision and status](m3-nguyen-huy-q3-q4-q6-handoff.md).
Use that document for the event name, single-customer membership invariant and
current `origin/develop` baseline; the text below remains the earlier proposal.

Status: **proposal, 02/11/2026**. Huy has no separate Prisma schema proposal
yet. This is the review input; it does not amend ADR 0004 or authorize a
migration before producer and consumer review.

## Q3 — Recipient directory and customer context

Use an **event-driven local projection**. ADR 0004 prohibits synchronous
Identity/Organization calls from an event consumer. Identity becomes the single
producer of a versioned recipient snapshot after invite, activation, account
status change, role change and an accepted customer membership update.
Organization still emits `CustomerMembershipChanged.v1`; Identity applies it
then emits its unified snapshot in the same local inbox/outbox transaction.
Identity needs a new outbox migration and relay; it has none now.

Proposed payload: `userId`, `tenantId`, `userType`, `status`, sorted role codes,
active `customerId` or null, membership status and a per-user monotonic
`revision`. No email, name, token or notification body. Notification upserts
only when revision is newer. Identity needs a repeatable bootstrap command
emitting current snapshots for every existing tenant account; live events and
bootstrap use the same revision ordering. No machine token or Tenant Admin
impersonation is needed.

If a business event arrives before a required recipient or SR Created snapshot,
Notification stores an allowlisted pending record locally and commits it before
broker ack. Arrival of the missing snapshot retries pending work. Unresolved
records remain visible to operators; a bounded retry/DLQ alone must not
silently lose a valid notice. Duplicate eventId is idempotent in the same
transaction.

For CUSTOMER notification rows, persist their `customerId` context. List,
count and mark-read require row tenantId/userId, principal.customerId **and**
the current local recipient projection's active customerId to match. Revoked
membership stops reads once its event arrives. ADR 0004's event/token latency
still applies. PLATFORM_STAFF has no M3 business audience; tenantId-null
notifications stay outside scope.

Schema review checklist for Huy: tenant-scoped recipient projection keyed by
userId with revision/status/roles/customer membership; pending-event table with
source eventId, tenant, safe fields and retry state; nullable customerId context
on notification rows; indexes for user+tenant+read state and pending replay.
Preserve the existing partial unique index on
`(source_event_id, user_id, channel)`. Huy owns exact Notification Prisma/SQL,
migration and consumer tests; Nguyên owns shared event contract, Identity
revision/outbox/bootstrap and ADR/ERD changes. Event name/version and schemas
need cross-owner review before implementation.

Concrete schema proposal for that review (names and constraints can be adjusted
by Huy before migration):

| Table | Proposed columns and invariant |
| --- | --- |
| `recipient_snapshots` | `user_id UUID PRIMARY KEY`, `tenant_id UUID NOT NULL`, `revision BIGINT NOT NULL CHECK (revision > 0)`, `user_type`, `account_status`, `roles JSONB`, nullable `customer_id UUID`, `membership_status`, `updated_at`. Upsert only for a strictly greater revision; tenant/user identity must not change across revisions. |
| `pending_notification_events` | `source_event_id UUID`, `consumer VARCHAR`, `event_type VARCHAR`, `tenant_id UUID`, allowlisted `payload JSONB`, `reason`, `attempts`, `next_attempt_at`, `created_at`, `resolved_at`; unique `(source_event_id, consumer)`. A pending event is durable before RabbitMQ ack; replay transitions it atomically to resolved plus notifications. |
| `notifications` (additive) | `customer_id UUID NULL` as the customer context at creation. For a CUSTOMER row it must be non-null; staff rows may be null. Add an index on `(tenant_id, user_id, customer_id, created_at DESC)` for scoped inbox reads. Keep the existing partial unique event/user/channel index. |

Huy should decide whether pending payload is stored as typed columns or
allowlisted JSON for each event version; it must exclude tokens, signed URLs and
unneeded customer data. The migration must leave `0001_init` untouched and
update ERD plus the Notification API/recipient matrix in the same PR.

## Q4 — Activation email

Recommendation for team review: **Identity owns token lifecycle and the
activation-mail retry queue**; Notification owns ordinary business notices.
Identity already creates a single-use token and hides it in production API
responses. A raw token in a reusable broker event or user-visible notification
row would disclose a credential. A private Identity delivery row can hold an
encrypted expiring activation link; the token hash remains in `account_tokens`.
An Identity mail worker retries idempotently, removes ciphertext after
success/expiry and never logs the link. A local Mailpit SMTP sink can prove
delivery without real outbound mail. This changes planned C5 ownership and
needs Huy's agreement and an Identity ADR/schema review before code. Encryption
key rotation, retry schedule, resend and demo mail configuration remain review
items.

## Q6 — Gateway, SR files and storage

Public Notification path is `/api/notifications[/*]` → service
`/notifications[/*]`. Gateway E2E covers root and nested paths.

The two planned SR paths are
`/api/service-requests/{id}/result/attachments` and
`/api/service-requests/{id}/result/attachments/{attachmentId}/download`.
Gateway's SR proxy maps both to the same service suffix; E2E checks them.
Work Order's `/internal/service-request-attachments/*` is blocked. Huy's C4
public SR controller is not in checkout `a437724`, so mapping tests are not an
SR→WO integration result.

Work Order K8 prepare/finalize/list/download and A4 projection are merged.
The local demo stack configures its private bucket, CORS and signing origin;
a real Gateway→MinIO upload/download plus idempotent replay passed on
02/11/2026. Browser and Android UI remain separate acceptance cases. API JWT
must never be sent to a signed S3 URL.

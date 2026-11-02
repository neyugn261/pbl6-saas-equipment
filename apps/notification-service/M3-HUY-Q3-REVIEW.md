# M3-C1 — Huy review of Q3/Q4 proposal

Date: 2026-11-02  
Status: **Q3 architecture approved; local schema, migration, projection core,
and catalogued business-event handling implemented.** The shared snapshot/
bootstrap event definitions and Identity producer are not in the event
catalog, so their broker bindings remain external. Notification migrations
have been applied and drift-checked only on `notification_test_db`.

Review input: Nguyên's
[Q3/Q4/Q6 proposal](../../docs/planning/m3-nguyen-integration-decisions.md),
the current
[recipient matrix](../../docs/api/notification-recipient-matrix.md),
[Notification API draft](../../docs/api/notification.yaml), Notification
`0001_init`, the shared event envelope/catalog, Identity's current schema, and
ADRs 0003/0004.

## Recommendation

Proceed with the approved event-driven recipient snapshot and Notification
local projection. Do not add synchronous Identity or Organization calls to an
event consumer. The API/schema can be implemented against the approved design,
but the additive SQL migration must receive Nguyên's review before merge or
deployment. Do not bind the new snapshot events until their definitions merge
in the shared event catalog.

Identity currently models one `UserCustomerLink` per user. This proposal
therefore snapshots the user's **current** membership, including an inactive
membership tombstone; it does not invent a multi-customer membership model.
If Identity later supports multiple concurrent customer memberships, that
requires an explicit contract/schema review.

## Proposed recipient snapshot contract

Use the existing shared `EventEnvelope` shape unchanged:

| Envelope field                 | Meaning                                                                                  |
| ------------------------------ | ---------------------------------------------------------------------------------------- |
| `eventId`                      | Producer outbox event UUID; replay/idempotency key                                       |
| `eventType`, `eventVersion`    | Assigned by the shared event-catalog owner after review; no name/version is created here |
| `producer`                     | `identity-service`                                                                       |
| `tenantId`                     | Non-null for tenant recipients; PLATFORM_STAFF is outside M3 business audiences          |
| `aggregateType`, `aggregateId` | Existing envelope metadata; user aggregate identity                                      |
| `occurredAt`                   | Business-change time, not the revision ordering key                                      |
| `correlationId`                | Existing nullable correlation metadata                                                   |
| `payload`                      | Full recipient snapshot described below                                                  |

The agreed snapshot payload for the shared-contract PR is:

```text
userId: UUID
userType: TENANT_STAFF | CUSTOMER
accountStatus: INVITED | ACTIVE | SUSPENDED | DISABLED
roles: sorted, unique catalog role-code array
customerMembership: null | {
  membershipId: UUID
  customerId: UUID
  status: ACTIVE | INACTIVE
  sourceChangedAt: ISO-8601 timestamp
}
revision: positive decimal string
bootstrapRunId: UUID | null
```

`tenantId` is carried only by the envelope. CUSTOMER accounts have at most one
active membership in M3. An inactive membership remains in the payload as a
tombstone; a null membership means no membership is known for that snapshot.
TENANT_STAFF must use `customerMembership: null`. Snapshot payloads contain no
email, name, activation token, notification body, or raw business-event
payload. `revision` is a decimal string so PostgreSQL BIGINT precision is
preserved through JSON.

The bootstrap completion event proposed for the shared-contract PR is
`NotificationRecipientBootstrapCompleted.v1`, producer `identity-service`,
aggregate `RecipientBootstrap`, aggregate ID equal to `bootstrapRunId`, and a
non-null tenant envelope. Its payload is
`{bootstrapRunId, expectedUsers, startedAt, completedAt}`. A run becomes
COMPLETE only after the marker and the expected number of distinct snapshots
tagged with that run have both been applied. Marker-first and snapshot-first
delivery are both supported; `expectedUsers: 0` completes after its marker.
RUNNING, COMPLETED, FAILED, and no-user/empty runs must remain distinguishable.
Replay of the same `(bootstrapRunId, userId)` receipt cannot increment the
count twice, and snapshots update the recipient projection only for a strictly
higher revision.

The shared envelope already carries producer and event metadata. Do not
duplicate those fields inside `payload`, and do not add a parallel event
version. The snapshot should be emitted after invite, activation, account
status/role change, and an accepted `CustomerMembershipChanged.v1` update.
Identity must commit its local change/inbox and snapshot outbox record in the
same transaction.

## Revision, membership, and bootstrap semantics

1. Identity owns a monotonically increasing per-user revision. Increment it
   transactionally for every change that can affect eligibility or content
   scope: account status, roles, user type, tenant, or customer-membership
   state. Do not use wall-clock timestamps as a substitute for this revision.
2. Identity consumes `CustomerMembershipChanged.v1` using its existing
   `sourceChangedAt` ordering and inbox. It emits a new snapshot from the
   resulting authoritative local state; a stale membership event must not
   recreate an older customer link.
3. Bootstrap emits the same full snapshot and revision used by live events,
   tagged with `bootstrapRunId`; the completion marker carries the expected
   distinct-user count and timestamps. It must not reset revisions or overwrite
   newer live state. Identity must serialize the source cut with revision
   updates or otherwise guarantee a consistent run.
4. Notification applies only `incoming.revision > stored.revision`. A lower
   revision is stale. An equal revision with identical normalized content is
   an idempotent replay; equal revision with different content is a conflict,
   not an overwrite. Tenant/user identity must not change for an existing
   `userId`.
5. Inactive, suspended, disabled, missing-customer, and revoked snapshots stay
   in the projection with their revision. Deleting a snapshot would permit a
   delayed old ACTIVE event to restore eligibility.
6. Membership revocation becomes effective in Notification when the new
   snapshot is applied. Token claims may remain stale until refresh under
   ADR 0003/0004; do not claim instantaneous revocation.

Bootstrap readiness must be explicit and durable. Before the relevant tenant
bootstrap is COMPLETED, a missing user or role audience means
`RECIPIENT_PROJECTION_NOT_READY`, not “there are no recipients.” After READY:

- An existing inactive user or an `INACTIVE`/`NONE` membership is known and
  ineligible; it is not a missing projection.
- A user with `UNKNOWN` membership is still unresolved for customer-scoped
  delivery and read authorization.
- A missing exact user referenced by an event remains pending for operator
  reconciliation; it must not be silently ACKed as a successful no-recipient
  result.
- A role-based audience with zero matches can be treated as empty only after
  the tenant snapshot is READY and the reviewed event policy permits it.
- A Work Order/customer event whose Service Request projection is absent stays
  pending as `SERVICE_REQUEST_PROJECTION_MISSING`; it is not fanned out from
  `customerId` alone.

The approved marker contract makes readiness per tenant and bootstrap run.
Identity still owns producing the run marker and snapshots; Notification owns
distinct receipt tracking and only treats a run as complete after both marker
and data are present.

## Event and recipient policy review matrix

These policies are implemented for the catalog versions present in this
checkout. Runtime fan-out remains pending until the local recipient and
Service Request projections exist; the snapshot/bootstrap core is not
broker-bound until its shared event contracts are published.

| Event                            | Recipient policy                                                                                                        | Safe content/resource                                                                       | Verification or external integration status                                                                                       |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `ServiceRequestCreated.v1`       | Exact active requester; active SERVICE_MANAGER and DISPATCHER in the tenant                                            | Request number, type, priority; `SERVICE_REQUEST` ID                                        | DB fan-out test passes; real producer-to-Notification delivery is not verified                                                    |
| `ServiceRequestStatusChanged.v1` | Original requester from the local Created projection; active SERVICE_MANAGER and DISPATCHER                            | Request number and allowlisted `toStatus`; never `reason`; `SERVICE_REQUEST` ID             | Missing Created projection remains pending; status event is the customer-facing SR state source                                    |
| `WorkOrderCreated.v1`            | Active SERVICE_MANAGER and DISPATCHER; customer requester only through a resolved SR projection                         | WO number and generic text; customer resource is only the associated `SERVICE_REQUEST`      | DB assertions verify customer SR resource and staff WO resource; maintenance-only events have no customer recipient               |
| `WorkOrderAssigned.v1`           | Exact active `technicianUserId` in the envelope tenant                                                                 | WO number and scheduled start; staff-only WO resource                                       | DB assertions exercise A→B→A as three separate assignments                                                                        |
| `WorkOrderCompleted.v2`          | Staff matrix; original active CUSTOMER requester only if the WO resolves to an SR and current membership matches       | Staff: allowlisted result. Customer: `customerSummary`; SR resource only                   | DB assertions verify distinct staff and customer content/resource                                                                  |
| `WorkOrderCancelled.v2`          | Active SERVICE_MANAGER and DISPATCHER only; customer cancellation comes from the committed SR status transition         | Generic staff cancellation; no raw `reason`; no customer Work Order cancellation notice     | DB assertions cover `cancelServiceRequest` true/false; neither produces a customer Work Order notice                               |
| `LowStockDetected.v1`            | Active INVENTORY_STAFF only                                                                                            | SKU and decimal quantities; staff-only stock resource                                       | Consumer DB test passes; Inventory producer is absent, so producer-to-consumer flow is unverified                                  |
| Recipient snapshot               | Updates the local eligibility projection; not a user notification                                                      | Snapshot fields only                                                                        | Core DB tests pass; Identity producer and published broker contract remain external                                                |

For CUSTOMER scope, persist the exact `customerId` used when creating the row.
List, unread count, and mark-read must all scope by principal tenant/user,
principal customer claim, and the current local snapshot's ACTIVE customer
membership. A membership change hides old-customer notifications after the
projection is updated. Never broadcast to all CUSTOMER accounts in a tenant.
PLATFORM_STAFF remains excluded from tenant business notifications. Do not
expose Work Order/report URLs, internal notes, attachment metadata, raw event
payloads, or unallowlisted text.

Recommended source-of-truth rule: `ServiceRequestStatusChanged.v1` is
authoritative for customer-facing Service Request state transitions. A
Work-Order-origin customer message is allowed only for a separately approved
result summary that is not another rendering of the same state transition.
Khương and Huy must resolve this against the Work Order v2 event semantics
before enabling either consumer path.

## Durable pending, replay, and fan-out algorithm

1. Validate the existing envelope and exact catalog type/version, then
   normalize only allowlisted event fields. Invalid envelopes follow the
   existing broker error/DLQ convention; never put the raw payload into a
   customer-visible row or log.
2. In one Notification DB transaction, record the inbox receipt and payload
   digest, and insert a durable pending business-event row keyed by
   `(source_event_id, consumer)`. Commit before acknowledging RabbitMQ. A
   repeated event ID with the same digest is a no-op; the same ID with a
   different digest creates conflict evidence and no side effect.
3. A reconciler selects due pending rows with a lease/claim, resolves all
   required local projections, and freezes the recipient set with customer
   context. Missing recipient directory or SR projection stays pending with a
   reason and retry schedule.
4. Create each recipient's `IN_APP` notification and mark its fan-out row
   complete in one local transaction. Preserve the existing partial unique
   index `(source_event_id, user_id, channel)`; it remains the final
   same-event replay guard. Do not introduce cross-event semantic dedup until
   the producer contract supplies a reviewed occurrence/transition identity.
5. Retry unfinished recipients independently. A crash after partial fan-out
   resumes from persisted delivery rows; it neither loses later recipients nor
   repeats a committed notification. Mark the parent event resolved only when
   all recipient rows have a terminal, policy-approved outcome.
6. Membership-snapshot and SR-projection changes wake the reconciler, while a
   periodic startup-safe scan recovers work after restart. An in-memory queue
   may wake workers but is never the source of pending work.
7. The same event ID with a different canonical payload hash is a conflict:
   store sanitized event IDs, hashes, type/version, and timestamps; do not
   overwrite, fan out again, or silently mark it resolved. If a producer later
   adds a reviewed semantic identity, collisions on that identity need the
   same conflict/reconciliation treatment; no generic semantic key is proposed
   here.

Suggested retry policy for review: exponential backoff with a cap, up to 12
automatic attempts for transient failures, then `MANUAL_REVIEW` without
deleting the pending record. Missing prerequisites remain pending and are
rechecked on projection updates; they are not discarded by a retry limit.
Operator alerts should include age and reason but no raw payload, token, or
customer content.

## Additive schema and migration proposal

This is the concrete additive Notification migration design for Nguyên's SQL
review. It does not modify `0001_init` and must not be deployed until the SQL
review gate is complete.

| Object                            | Proposed shape and invariants                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `recipient_snapshots`             | `user_id UUID PRIMARY KEY`, `tenant_id UUID NOT NULL`, `revision BIGINT NOT NULL CHECK (revision > 0)`, `user_type`, `account_status`, `role_codes JSONB NOT NULL` (array, sorted/unique at validation), nullable `customer_id`, `membership_id`, `membership_status`, `membership_source_changed_at`, nullable `bootstrap_run_id`, `source_occurred_at`, `updated_at`. TENANT_STAFF has null membership fields; CUSTOMER inactive rows retain membership IDs. No cross-database FK. |
| `recipient_bootstrap_runs`        | `bootstrap_run_id UUID PRIMARY KEY`, `tenant_id UUID NOT NULL`, nullable `expected_users` until marker, `received_users INTEGER NOT NULL DEFAULT 0`, `marker_received BOOLEAN NOT NULL DEFAULT false`, `status RUNNING/COMPLETED/FAILED`, started/completed timestamps. `received_users` is incremented only when a distinct receipt insert succeeds.                                                                                                                                |
| `recipient_bootstrap_receipts`    | `(bootstrap_run_id, user_id)` unique key, tenant and applied revision/timestamp. Stores distinct user receipts even when an older snapshot cannot replace the latest projection.                                                                                                                                                                                                                                                                                                     |
| `notifications` (additive)        | Nullable `customer_id UUID` storing the creation-time customer context. Application invariant: CUSTOMER rows require it; non-CUSTOMER rows leave it null. Existing `source_event_id`/user/channel uniqueness remains unchanged.                                                                                                                                                                                                                                                      |
| `pending_notification_events`     | `(source_event_id UUID, consumer VARCHAR)` primary/unique key, exact `event_type`/version, `tenant_id`, sanitized allowlisted payload, payload SHA-256, state/reason, attempt count, `next_attempt_at`, last safe error category, lease timestamps, created/updated/resolved timestamps. Never store raw token, signed URL, or unnecessary customer fields.                                                                                                                          |
| `pending_notification_deliveries` | Local reference to pending event, recipient user, nullable customer context, channel, state/attempts/next attempt/completion; unique `(source_event_id, consumer, user_id, channel)`. Freezes fan-out for crash-safe per-recipient retry.                                                                                                                                                                                                                                            |
| `notification_event_conflicts`    | Event ID/consumer, expected and observed SHA-256, event type/version, detection time, sanitized resolution state/actor/time. No raw competing payload.                                                                                                                                                                                                                                                                                                                               |

Index/constraint proposal:

- `recipient_snapshots`: primary key by globally unique Identity `user_id`;
  check positive revision; check valid user/account/membership states in service
  validation and, where stable, SQL CHECK constraints. An ACTIVE membership
  requires membership/customer IDs and source time; NONE/UNKNOWN carry no
  membership IDs; INACTIVE retains the revoked IDs.
- `recipient_bootstrap_runs`: `expected_users >= 0` when marker received;
  `received_users >= 0`; CHECK prevents COMPLETED unless marker is received and
  `received_users = expected_users`. Use transaction-level locking for run
  updates and unique receipt insertion for replay safety.
- `recipient_bootstrap_receipts`: primary key `(bootstrap_run_id, user_id)` and
  index by `(tenant_id, user_id)`.
- `notifications`: retain `uq_notifications_event_user_channel`; add a partial
  IN_APP list index on `(tenant_id, user_id, customer_id, created_at DESC, id)`
  and a partial unread count index on `(tenant_id, user_id, customer_id)` where
  `channel='IN_APP' AND read_at IS NULL`.
- `pending_notification_events`: unique `(source_event_id, consumer)` and a
  partial due-work index on `(next_attempt_at, created_at)` for pending/
  retryable states.
- `pending_notification_deliveries`: unique event/consumer/recipient/channel
  and a partial due-work index on `(next_attempt_at, source_event_id)`.
- `notification_event_conflicts`: index `(state, detected_at)` for operator
  review. Keep all referenced IDs as logical references; no foreign key to
  Identity, Organization, Service Request, Work Order, or Inventory DBs.

Data that is derivable and should not be copied: names/emails, permission
expansion, event bodies, Work Order/SR detail, source storage metadata, and
current membership history beyond the single Identity membership represented
by its present schema. The pending row needs only the validated fields needed
to reconstruct the approved notification.

Retention proposal:

- Keep current recipient snapshots, including inactive/revoked tombstones,
  indefinitely; deleting them can make stale replay re-enable access.
- Never auto-delete unresolved pending events or unresolved conflicts. Move
  exhausted transient work to visible `MANUAL_REVIEW`; preserve sanitized
  evidence until an operator resolves it.
- After successful resolution, clear the sanitized pending payload after
  30 days but retain the event/consumer tombstone and digest for deduplication.
  Keep conflict hashes and resolution evidence for at least 90 days; extend
  until the review/audit owner approves a shorter period.
- Do not add automatic deletion of Notification rows in this migration; no
  product retention policy is currently approved.

## Migration and implementation gates

Keep `0001_init` byte-for-byte unchanged and preserve the existing partial
unique index. Migrations `0002_recipient_projection_and_pending` and
`0003_remove_duplicate_bootstrap_fk` were applied only to the dedicated
`notification_test_db`; `0003` removes the redundant single-column FK while
retaining tenant-scoped referential integrity. The DB suite and drift check
pass. Migration from an empty database was not separately exercised; no
additional database was created or migrated.

The C2 API, recipient projection/bootstrap core, and durable business-event
processor are implemented. The runtime binds only business-event versions
already published in the shared catalog; actual RabbitMQ delivery/redelivery
was verified with PostgreSQL. Snapshot/bootstrap broker binding and Identity
producer remain external. `pnpm-lock.yaml` is unchanged per ownership rules;
the updated Notification manifest therefore still needs the lockfile owner to
review and reconcile before frozen CI install. Do not bypass this with relative
production imports or duplicate auth/pagination/error implementations.

## Decisions and owner handoff

| Owner                              | Decision or implementation needed                                                                                                                                                                                                                                  |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Nguyên — Identity/shared contracts | Publish the approved snapshot/bootstrap contracts and Identity producer; define the outbox/bootstrap cut and ensure inactive/revoked states are represented. |
| Khương — Work Order                | Provide/verify the published Work Order producer path; assignment A→B→A is preserved, and customer cancellation notices remain sourced from Service Request status changes. |
| Minh — Inventory                   | Provide the `LowStockDetected.v1` producer and its existing threshold/re-arm behavior for producer-to-consumer verification. |
| Huy — Notification                 | C2 API, local projection/pending/fan-out and migrations are implemented; PostgreSQL/RabbitMQ tests and drift pass. Keep the isolated DB guard and existing unique index. |
| Hatsady — Web/Mobile               | Confirm public screen routes, SR deep-link contract, unread/list/read behavior, and UI acceptance cases.                                                                                                                                                           |

Remaining integration checks:

- Bind snapshot/bootstrap handlers only after their shared event definitions
  and Identity producer are available; test replay and source-cut ordering
  against that producer.
- Verify Work Order and Inventory producer-to-Notification flows when those
  services are available. Customer-facing cancellation remains represented by
  `ServiceRequestStatusChanged`; `cancelServiceRequest=false` is not an SR
  cancellation.
- Reconcile the Notification manifest with the shared lockfile through its
  owner before frozen CI installation.
- Complete live Gateway/MinIO and Web/Mobile acceptance; local service and DB
  tests do not imply those integrations passed.

## Q4/C5 position

Decision: Identity owns the activation-token lifecycle, private delivery job,
retry queue, SMTP adapter, and Mailpit demo. Notification owns only ordinary
business notices. Huy must not build an activation consumer, queue, SMTP
adapter, or token persistence here. C5 remains an Identity-owned external
handoff until its implementation exists; Huy's work is security review and
coordinated acceptance only. Notification must neither accept nor persist
activation tokens.

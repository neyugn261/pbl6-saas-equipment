# M3 Notification — implementation readiness (2026-11-02)

Status: **C2 implemented and PostgreSQL-tested; C3 business-event handling is
implemented for catalogued versions and verified with RabbitMQ; recipient
snapshot/bootstrap broker integration and Identity-owned C5 remain
external.** The Q3 projection and public API policy are implemented locally.
Snapshot/bootstrap event definitions and the Identity producer are not in the
shared catalog, so those event types are not bound.

The approved design and replay/bootstrap rules are in
[M3-HUY-Q3-REVIEW.md](M3-HUY-Q3-REVIEW.md). The business consumer binds only
versions already published in the shared catalog and keeps fan-out pending
until its required local projections exist.

## C2 implementation

The Notification service now has authenticated `notification:read` routes for
list, unread count, and idempotent mark-read. Tenant and user scope are derived
from the verified principal. Staff reads are limited to rows without customer
context; CUSTOMER reads require an ACTIVE local recipient snapshot whose tenant,
user, membership, and customer context match the principal. PLATFORM_STAFF and
missing/stale snapshots fail closed. The response maps only allowlisted public
fields; it never exposes stored payloads.

Migrations `0002_recipient_projection_and_pending` and
`0003_remove_duplicate_bootstrap_fk` add customer context, recipient
projection, bootstrap receipts, durable pending events/deliveries and conflict
storage. Both have been applied only to `notification_test_db`; `0001_init`
was not changed. Migration drift is clean against the Prisma schema. The
per-recipient delivery records and notification rows are committed together
in the local database transaction.

## Verification

Verified:

| Command | Result |
|---|---|
| `pnpm.cmd --filter notification-service typecheck` | PASS |
| `pnpm.cmd --filter notification-service lint` | PASS |
| `pnpm.cmd --filter notification-service build` | PASS |
| `pnpm.cmd --filter notification-service test --runInBand` | 39/39 PASS |
| `pnpm.cmd --filter notification-service test:e2e --runInBand` | 6/6 PASS |
| `pnpm.cmd --filter notification-service test:e2e:db` | 16/16 PASS, 5 suites; PostgreSQL and real RabbitMQ |
| `pnpm.cmd --filter notification-service db:migrate` | `0003` applied; `0001`–`0003` present in `notification_test_db` |
| `pnpm.cmd --filter notification-service db:check-drift` | PASS, no difference detected |
| `pnpm.cmd --filter service-request-service test --runInBand` | 81/81 PASS |
| `pnpm.cmd --filter service-request-service test:e2e --runInBand` | 28/28 PASS |
| `pnpm.cmd --filter service-request-service test:e2e:db` | 69/69 PASS |
| `pnpm.cmd --filter service-request-service test:e2e:db --testRegex=work-order-ordering.repro.ts` | P0 regression 1/1 PASS |
| Service Request `typecheck`, `lint`, `build`, `db:check-drift` | PASS individually |
| `pnpm.cmd install --lockfile-only --frozen-lockfile --ignore-scripts` | BLOCKED: Notification manifest has 6 dependency specifiers absent from the shared lockfile; lockfile preserved |

Both DB harnesses require explicit isolated test database URLs and refuse
non-test database names. No development or production database was migrated.
Notification migration verification upgraded the existing test schema from
`0001` through `0003`; a separate blank-database deployment was not exercised.
RabbitMQ integration used a temporary exchange/queue and cleaned them after
the test. Frozen-install validation is constrained by ownership: the updated
Notification manifest has direct dependencies absent from the shared lockfile;
the lockfile remains unchanged per the M3 scope rules. Resolve through the
lockfile owner rather than treating frozen install as passing.

## C1/C3: contract and integration gates

The recipient projection and bootstrap core handlers support revisions,
membership tombstones, distinct receipts, marker-first delivery and pending
reconciliation. Snapshot/bootstrap broker binding remains gated because those
event types are absent from the shared event catalog; the core is covered by
PostgreSQL tests.

The business consumer binds only catalogued versions:
`ServiceRequestCreated.v1`, `ServiceRequestStatusChanged.v1`,
`WorkOrderCreated.v1`, `WorkOrderAssigned.v1`, `WorkOrderCompleted.v2`,
`WorkOrderCancelled.v2` and `LowStockDetected.v1`. An actual RabbitMQ delivery
and redelivery test confirms durable pending state and event-id deduplication
with PostgreSQL. Recipient fan-out remains fail-closed when required
projections are missing. The Inventory producer is not present in this
checkout, so a LowStock producer-to-consumer flow was not verified. Work Order
cancellation is staff-only; Service Request status changes remain the
customer-facing source of truth.

## C5: activation delivery boundary

Identity owns activation-token creation and activation delivery. No Notification
email consumer, SMTP integration, token storage, or retry path was added.
Notification must not read or forward raw activation tokens. The RabbitMQ DB
test injects a synthetic unknown `activationToken` field and confirms the
allowlisted pending payload does not persist it. The approved boundary and
remaining Identity-owned work are recorded in the Q3/Q4 review.

## Remaining external work

- **Identity/shared catalog:** publish the approved snapshot/bootstrap event
  definitions and producer; Notification's core handlers are ready but cannot
  bind unpublished events.
- **Inventory:** the `LowStockDetected.v1` producer and threshold/re-alert
  lifecycle were not available for end-to-end verification.
- **Web/Mobile:** confirm the consumer routes and customer-safe
  `SERVICE_REQUEST` navigation.
- **Integration environment:** a live Gateway → Service Request → Work Order →
  MinIO flow and Identity/Mailpit activation flow were not run. C4's DB
  regression passed, but that is not a full-stack integration result.
- **Lockfile owner:** review the Notification manifest/lockfile mismatch before
  frozen CI install; this task did not modify the shared lockfile.

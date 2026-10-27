# Service Request Service

Service requests, warranty review, comments, cost estimates (state machine: `docs/architecture/state-machines.md`). Publishes `ServiceRequestCreated`, `ServiceRequestStatusChanged`.

- Owner: Member C ([CONTRIBUTING.md](../../CONTRIBUTING.md))
- Port: `SERVICE_REQUEST_SERVICE_PORT` (default 3007)
- Database: `service_request_db` via `SERVICE_REQUEST_DATABASE_URL` — see [prisma/README.md](prisma/README.md)
- API contract (draft): [service-request.yaml](../../docs/api/service-request.yaml); conventions: [docs/api/conventions.md](../../docs/api/conventions.md)

## Status

M1 Service Request endpoints are implemented. Asset calls go through the
`AssetClient` interface; `HttpAssetClient` forwards the caller's token and
correlation id through `ServiceHttpClient`, while `FakeAssetClient` supports
isolated tests.

- `GET /health` — public, `200 {status:'ok', database:'up'}` or 503.
- Every other route requires an access token (global guards of `@pbl6/auth`);
  request data is scoped by tenant/customer claims in the verified token.
- Implemented: create/list/detail/update requests, status history, comments
  with CUSTOMER/INTERNAL visibility, warranty checks, and M1 review, accept,
  reject, cancel, confirm and reopen transitions.
- Request creation validates the equipment but does not snapshot its warranty;
  staff may omit `customerId` and use the equipment's customer.
  `POST /service-requests/{id}/review` starts review and records the initial
  warranty snapshot in the same transaction as the status history and event.
- `POST /service-requests/{id}/warranty-check` refreshes the warranty snapshot
  while the request is in `REVIEWING`.
- `GET /internal/service-requests/{id}` returns a scoped Service Request
  reference including its title and requires a tenant-staff access token and
  `service_request:read`.
- Request number allocation, status history and `ServiceRequestCreated` /
  `ServiceRequestStatusChanged` outbox writes share database transactions.
  `OutboxRelay` publishes them to RabbitMQ when `RABBITMQ_URL` is configured.
- The idempotent `service-request-service.work-orders` consumer handles
  WorkOrderCreated, WorkOrderCompleted v1/v2 and WorkOrderCancelled v1/v2.
  It ignores WorkOrderCreated for an already-cancelled request and writes
  customer-safe completion summary fields from v2 events. It stores the active
  Work Order logical ID so delayed completion/cancellation events from a
  replaced Work Order cannot overwrite the current result.
  Terminal requests (CLOSED/REJECTED/CANCELLED) are recorded in the inbox
  without further transitions. Created for an already active Work Order is a
  no-op. Completion/cancellation before Created fail the inbox transaction and
  use the existing bounded retry/DLQ policy; durable reordering and lifecycle
  deduplication after the active ID is cleared are still review blockers.
- Cost Estimate APIs support DRAFT revision create/list/update/delete, send,
  revise, customer approve/reject and lazy expiration. Totals use PostgreSQL
  decimal values and generated item amounts; the request row is locked while
  allocating revisions and applying estimate transitions. Expiration for
  approve/reject/revise is checked after acquiring those locks and commits
  EXPIRED before returning 409. CUSTOMER accounts
  cannot list or see DRAFT estimates.
- A SENT estimate expires after its `validUntil` calendar date in
  `Asia/Ho_Chi_Minh`. Per the current team direction, the request remains
  `AWAITING_CUSTOMER_APPROVAL`; a replacement flow for that expired state still
  needs a state-machine decision.
- Staff may cancel an `ACCEPTED` request. A `PROCESSING` request returns 409
  `WORK_ORDER_CANCELLATION_REQUIRED`; cancel its Work Order first. Out-of-
  warranty requests cannot be accepted without an approved estimate.
- Errors follow `{code, message, details?}`; logs are JSON lines with the
  correlation id.

Set `ASSET_SERVICE_URL` to the Asset Service base URL. It is validated at
startup and is already listed in the root `.env.example`.
For local runs without RabbitMQ, leave `RABBITMQ_URL` empty; events are retained
in the outbox until the relay is enabled, and Work Order events are not consumed.
Production requires the broker URL.

## Commands

```bash
# Run from the monorepo root
pnpm dev:service-request
pnpm --filter service-request-service test
pnpm --filter service-request-service test:e2e
pnpm --filter service-request-service test:e2e:db
pnpm --filter service-request-service lint
pnpm --filter service-request-service typecheck
pnpm --filter service-request-service build
pnpm --filter service-request-service db:migrate
pnpm --filter service-request-service db:check-drift
```

The migration `0004_active_work_order_tracking` adds the local Work Order
reference used by the consumer. Because this changes the ERD-level data model,
the migration requires the shared-schema/ADR reviewer to approve the matching
ERD update before merge or deployment.
The 2026-10-26 read-only audit found 0004 already applied in the configured
development database as well as the test database; its approval remains
unverified. No development migration or rollback was run during the audit.

Direct estimate endpoints start at `/estimates`. The current Gateway correctly
maps `/api/service-requests/{id}` to `/service-requests/{id}`, but does not yet
map estimate actions. See the [audit and owner handoff](../../docs/testing/m2-service-request-audit.md)
and [manual guide](../../docs/testing/m2-service-request.md) before testing.

`pnpm start:dev` is a service-local command, not a root workspace script. To
use it directly, first change directory to `apps/service-request-service`.
The database-backed E2E suite migrates and truncates `SERVICE_REQUEST_TEST_DATABASE_URL`;
it refuses to run unless the database name contains `test`.

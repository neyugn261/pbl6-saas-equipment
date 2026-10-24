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
  customer-safe completion summary fields from v2 events.
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
pnpm --filter service-request-service db:migrate
pnpm --filter service-request-service db:check-drift
```

`pnpm start:dev` is a service-local command, not a root workspace script. To
use it directly, first change directory to `apps/service-request-service`.
The database-backed E2E suite migrates and truncates `SERVICE_REQUEST_TEST_DATABASE_URL`;
it refuses to run unless the database name contains `test`.

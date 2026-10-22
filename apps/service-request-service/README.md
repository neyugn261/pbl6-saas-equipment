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
- Request creation snapshots the current warranty result. `POST
  /service-requests/{id}/review` begins review and refreshes the snapshot in the
  same transaction as the status history and status event. The existing
  `start-review` and `warranty-check` endpoints remain available separately.
- `GET /internal/service-requests/{id}` returns only the minimal scoped
  Service Request reference and requires a tenant-staff access token and
  `service_request:read`.
- Request number allocation, status history and `ServiceRequestCreated` /
  `ServiceRequestStatusChanged` outbox writes share database transactions.
  `OutboxRelay` publishes them to RabbitMQ when `RABBITMQ_URL` is configured.
- Cost Estimate endpoints and Work Order event consumers remain later
  milestone work; out-of-warranty requests cannot be accepted without an
  approved estimate.
- Staff cancellation from `ACCEPTED` is deliberately unavailable until the
  Work Order service can verify that no non-terminal work order exists.
  This is also reported as `WORK_ORDER_CHECK_REQUIRED`; no uncontracted
  cross-service endpoint is assumed before the Work Order contract is ready.
- Errors follow `{code, message, details?}`; logs are JSON lines with the
  correlation id.

Set `ASSET_SERVICE_URL` to the Asset Service base URL. It is validated at
startup and is already listed in the root `.env.example`.
For local runs without RabbitMQ, leave `RABBITMQ_URL` empty; events are retained
in the outbox until the relay is enabled. Production requires the broker URL.

## Commands

```bash
# Run from the monorepo root
pnpm dev:service-request
pnpm --filter service-request-service test
pnpm --filter service-request-service test:e2e
pnpm --filter service-request-service lint
pnpm --filter service-request-service typecheck
pnpm --filter service-request-service db:migrate
pnpm --filter service-request-service db:check-drift
```

`pnpm start:dev` is a service-local command, not a root workspace script. To
use it directly, first change directory to `apps/service-request-service`.

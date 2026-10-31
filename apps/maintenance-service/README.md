# Maintenance Service

## Detailed history and equipment dossier integration (ADR 0010)

Additive migration `20261027141000_maintenance_history` records Plan/Task changes
atomically with local writes/inbox/outbox. No public edit/delete audit endpoint.
`GET /maintenance-history` filters by equipment/plan/task/event/time;
`GET /maintenance-plans/:id/history` scopes one Plan;
`GET /maintenance-tasks/:id/journey` returns current Task/Plan, all linked WO and
replacement requests, responsibility, allowedActions and a paginated history.
`GET /maintenance-summary?equipmentId=...` computes counts/earliest due over all
matching rows and limits only the attention preview to five. Task list accepts
`equipmentId`. Dates are planned due dates, not confirmed appointments.

Read APIs require `maintenance:read` and current tenant/customer scope. CUSTOMER
receives no internal diagnostics, actor IDs/roles or cancellation reasons.
Existing CUSTOMER_ADMIN access and CUSTOMER_USER restrictions remain. Historical
Plan/schedule/site snapshots are never rewritten by later Plan edits or moves.
Rows predating the migration may have no detailed audit.

Contract: [maintenance-history.yaml](../../docs/api/maintenance-history.yaml).
UI/service-owner handoff: [equipment-dossier-handoff.md](../../docs/plans/equipment-dossier-handoff.md).

Owner Minh / Member B. Port 3003 (`MAINTENANCE_SERVICE_PORT`), database
`maintenance_db` only. [OpenAPI](../../docs/api/maintenance.yaml),
[ADR 0007](../../docs/decisions/0007-maintenance-snapshot.md),
[runtime proposal ADR 0009](../../docs/decisions/0009-maintenance-m2-runtime.md),
[owner handoff](../../docs/plans/minh-m2-handoff.md).

M2 now implements Plan CRUD/status, scoped Task reads, fixed-anchor scheduler,
EquipmentMoved snapshots, WO lifecycle inbox and explicit replacement requests.
Work Order's **replacement producer** remains Khương's handoff; the first-WO
producer is integrated without changing his service. This local implementation
and shared schema/events still need the normal owner reviews before merge.

## API and security

| Method/path | Permission and caller |
| --- | --- |
| GET /maintenance-plans, /maintenance-plans/:id | maintenance:read; tenant staff or scoped CUSTOMER_ADMIN |
| POST /maintenance-plans | maintenance:manage; tenant staff (current catalog: SERVICE_MANAGER) |
| PATCH /maintenance-plans/:id | maintenance:manage; tenant staff |
| GET /maintenance-tasks, /maintenance-tasks/:id | maintenance:read; same scope as Plan |
| POST /maintenance-tasks/:id/replacement | maintenance:manage; tenant staff |
| GET /health | public; database up/down |

Gateway prefix is `/api/maintenance`. CUSTOMER_USER has no maintenance:read;
customer/site/tenant input is rejected. Create calls Asset's scoped internal
reference with the original access token/correlation ID. RETIRED is rejected.
No fake fallback, cross-service SQL, fake scheduler user or public scheduler API.

## Scheduling

The initial nextDueDate is a fixed anchor. MONTH Jan 31 → Feb 28/29 → Mar 31;
YEAR Feb 29 restores Feb 29 in leap years. Completion does not shift the anchor.
One tick catches up only the latest due occurrence per active Plan and advances
to the first future date. Row locks + `(plan_id, scheduled_date)` uniqueness
keep concurrent/repeated ticks safe. Task, Due outbox and advancement commit
together. Ticks process at most 100 due Plans; remaining Plans run next tick.

PAUSED/INACTIVE generate nothing. Resume restarts from today's Vietnam date.
INACTIVE cannot resume. Schedule edits preserve existing Tasks. Existing Task
snapshots remain their creation-time data; Plan snapshots follow Equipment moves.

Scheduler defaults: enabled, every 60000 ms; set
`MAINTENANCE_SCHEDULER_ENABLED=false` for controlled tests/manual runs, or adjust
`MAINTENANCE_SCHEDULER_INTERVAL_MS` (1000–3600000). It starts one background tick
at boot, prevents overlapping ticks per process, and awaits completion on shutdown.

## Events and operations

- Outbox producer: `maintenance-service`; Due v1 and replacement request v1.
- Queue `maintenance-service.equipment`: EquipmentMoved v1, complete snapshots
  ordered by integer version. The cursor also survives periods with no Plans.
  Scheduler skips a Plan behind a known local snapshot; unknown broker-delayed
  moves remain subject to eventual consistency.
- Queue `maintenance-service.workorder`: Created v1, Completed/Cancelled v2.
  Completion may precede Created; durable per-WO tombstones prevent regressions.
  Successful/partial completion → COMPLETED and max(lastCompletedAt); unresolved
  → FAILED without advancing lastCompletedAt; cancellation → PENDING.
- A manager POSTs a UUID requestId for replacement. Retries return the same
  allocated replacementWorkOrderId; another request while pending returns 409.
  Replaying Due does not create a replacement. No automatic replacement loop.
- With RabbitMQ down, rows remain durable in outbox; reconnect resumes delivery.
  Consumer retries use 5 attempts with 2/4/8/16 second delays, then `<queue>.dlq`.
  Missing references roll back inbox and retry; malformed/mismatched events go
  to DLQ. Fix causes before replaying the **same** event ID.
- Inspect FAILED outbox rows and DLQ using [event operations](../../docs/architecture/events.md).
  Never delete inbox rows to retry a business operation. A manual transport
  replay uses the same event; a new replacement uses a new manager requestId.

## Commands and demo seed

Run from repository root unless stated otherwise:

```powershell
pnpm build:packages
pnpm --filter maintenance-service db:migrate
pnpm --filter maintenance-service build
pnpm --filter maintenance-service start:dev
```

After the M1 Identity/Organization/Asset seeds and services are available:

```powershell
pnpm --filter maintenance-service db:seed:dev
pnpm --filter maintenance-service db:seed:dev
pnpm --filter maintenance-service scheduler:tick
```

Seed validates Equipment through Asset and the manager's verified token, writes
only Maintenance, and creates fixed Plan `…003001` due today. Reruns preserve the
schedule/Tasks. It refuses production. A locally supplied
`MAINTENANCE_SEED_ACCESS_TOKEN` may replace demo login; it is still verified and
must have maintenance:manage. Never commit tokens. `scheduler:tick` defaults to
today; an optional YYYY-MM-DD override is allowed only in dev/test.

## Validation

```powershell
pnpm --filter maintenance-service lint
pnpm --filter maintenance-service typecheck
pnpm --filter maintenance-service test --runInBand
pnpm --filter maintenance-service test:e2e
pnpm --filter maintenance-service test:db
pnpm --filter maintenance-service db:check-drift
pnpm --filter asset-service --filter maintenance-service --filter workorder-service --filter api-gateway build
pnpm --filter maintenance-service test:integration
```

`test:db` refuses any target except `maintenance_test_db`. The vertical slice
also requires exactly `asset_test_db` and `workorder_test_db`, plus RabbitMQ
(`RABBITMQ_TEST_URL` or local `RABBITMQ_URL`). It creates isolated service
instances, Gateway, exchange/queues and tenant fixtures, then cleans only its
fixtures. It uses real Asset/WO APIs and producers; Identity tokens and
Organization references are explicit test fixtures. It proves initial WO
completion, real cancellation, and a durable replacement request. DB event tests
cover replacement Created/Completed fixtures; actual replacement production is
not claimed until Khương implements the handoff.

Migrations remain additive. The earlier snapshot migration refuses nonempty
legacy Plans; follow ADR 0007 backfill review rather than inventing IDs. Runtime
migration backfills anchors and Task snapshots using local Plan rows only.

## Initial equipment registration (ADR 0012)

See [API contract](../../docs/api/equipment-registration.yaml),
[technical design](../../docs/plans/equipment-registration-technical-design.md)
and [verification](../../docs/testing/equipment-registration.md).

Apply both additive migrations before using the web handover workflow:

```sh
pnpm --filter asset-service --filter maintenance-service db:migrate
```

Asset owns the DRAFT → PENDING_MAINTENANCE → COMPLETED record and commits
Warranty before calling Maintenance with the caller's token. Maintenance's
internal PUT creates or links one Plan per tenant/registration; repeated calls
return the same receipt without changing the current schedule. No cross-database
transaction, new event or new role is introduced. A pending input is frozen;
resume checks the original operation rather than starting another setup.

Service Manager can complete the workflow. Tenant Admin can save a draft but
has no maintenance:manage permission. Raw setup data is staff-only. Existing
equipment remains NOT_RECORDED until explicitly reviewed; there is no backfill.

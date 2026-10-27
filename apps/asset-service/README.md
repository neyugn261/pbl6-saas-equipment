# Asset Service

Equipment models, equipment, warranties and warranty check, QR codes, equipment history.

- Owner: Member B ([CONTRIBUTING.md](../../CONTRIBUTING.md))
- Port: `ASSET_SERVICE_PORT` (default 3002)
- Database: `asset_db` via `ASSET_DATABASE_URL` — see [prisma/README.md](prisma/README.md)
- API contract: [asset.yaml](../../docs/api/asset.yaml); conventions: [docs/api/conventions.md](../../docs/api/conventions.md)
- Detailed dossier/history supplement: [equipment-dossier.yaml](../../docs/api/equipment-dossier.yaml), [frontend/owner handoff](../../docs/plans/equipment-dossier-handoff.md), ADR 0010.
- Organization HTTP client: `ORGANIZATION_SERVICE_URL` (required, already in root `.env.example`). It forwards the caller's token and correlation id; production has no fake fallback.
- QR portal base URL: `ASSET_QR_PORTAL_BASE_URL` (required, HTTP(S)); generated QR links use `<base>/portal/qr/<token>`.

## Status

The approved dossier extension adds per-unit display name/specifications/commission
date, an explicit operational confirmation with a required internal reason, and
detailed Asset/Model/Warranty/QR audit. `GET /equipment/:id/dossier` composes
caller-scoped Organization, Request, WO and Maintenance reads. Optional
`SERVICE_REQUEST_SERVICE_URL`, `WORKORDER_SERVICE_URL`, `MAINTENANCE_SERVICE_URL`
are already listed in root `.env.example`; absent URLs yield NOT_CONFIGURED.
Source outages and permission restrictions are separate section statuses.
CUSTOMER cannot read WO through this composition. No source write operation is
proxied or authorized by an Asset response.

`GET /equipment-history`, `/equipment/:id/timeline`, `/equipment-history/:id`,
`/warranties/:id/history`, `/equipment-models/:id/history` provide filtered feeds
and resource audit. Internal reasons and arbitrary legacy metadata are removed
from customer views. Histories before audit deployment may be incomplete.
Source events lacking original equipment context explicitly use
`AT_EVENT_PROCESSING`; this is not proof of the historical job site.

Local migration `20261027140000_equipment_dossier_history` is additive. Apply with
`pnpm --filter asset-service db:migrate`. DB suites now include real HTTP/RBAC,
PostgreSQL audit checks, explicit source fakes and a separate real-service
Gateway/RabbitMQ test under Maintenance.

M0 bootstrap and A2–A5 Asset endpoints are implemented. M2 adds transactional
EquipmentMoved outbox and idempotent service-event history consumers. Equipment detail and list warranty filtering read
real ACTIVE warranty rows from `asset_db` and use today's date in
`Asia/Ho_Chi_Minh`. VOID periods are ignored. No warranty value is fabricated.

- `GET /health` — public, `200 {status:'ok', database:'up'}` or 503.
- `GET /equipment-models` — TENANT_STAFF with `equipment:read`, tenant-scoped;
  `page`, `pageSize`, `q`, `status`, `sort` per the contract. CUSTOMER gets 403.
- `POST /equipment-models` — TENANT_STAFF with `equipment:manage`. Creates an
  ACTIVE model. Duplicate `(tenantId, manufacturer, modelCode)` → 409
  `UNIQUE_VIOLATION`.
- `PATCH /equipment-models/:modelId` — TENANT_STAFF with `equipment:manage`.
  A model of another tenant or an unknown ID → 404 `MODEL_NOT_FOUND`.
- `GET /equipment` — TENANT_STAFF or CUSTOMER with `equipment:read`. Token scope
  limits tenant and, for CUSTOMER, customer. Supports pagination, search,
  customer/site/status/warranty filters, and stable sort per `asset.yaml`.
  Search treats `%` and `_` as literal characters.
- `POST /equipment` — TENANT_STAFF with `equipment:manage`. Requires an ACTIVE
  model in the token tenant and Organization-validated customer, site and
  optional location. Equipment and REGISTERED history commit together. The
  database enforces unique asset code per tenant and serial per tenant/model.
- `GET /equipment/:equipmentId` — scoped detail with current model, a genuine
  local warranty result, and whether an active QR row exists.
- `PATCH /equipment/:equipmentId` — TENANT_STAFF with `equipment:manage`.
  Moves stay within the existing customer; changing site without a location
  clears the old location. RETIRED is final. Effective changes write MOVED,
  STATUS_CHANGED and/or DETAILS_UPDATED in the same transaction. No-op writes
  create no history. A location-only PATCH returns 409 `EQUIPMENT_SITE_CHANGED`
  if the site changes after Organization validates the location; retry against
  the current site.
- `GET /equipment/:equipmentId/history` — scoped, stable newest-first history
  with pagination. M2 records ServiceRequestStatusChanged v1 and WorkOrderCompleted
  v2 using an explicit safe-field allowlist. SR reason/internal data is not copied.
- `GET /internal/equipment/:equipmentId` — scoped EquipmentRef for service
  callers forwarding the user's token. RETIRED stays readable as a status.
  snapshotVersion is a monotonic site/location version for Maintenance snapshots.
- `GET /equipment/:equipmentId/warranties` — scoped ACTIVE and VOID periods,
  newest start date first; `expired` is derived for today in Vietnam.
- `POST /equipment/:equipmentId/warranties` — staff with `warranty:manage`;
  locks equipment, rejects inclusive overlap with ACTIVE periods, and writes
  WARRANTY_ADDED history atomically. RETIRED equipment returns 409
  `EQUIPMENT_RETIRED`.
- `POST /warranties/:warrantyId/void` — staff with `warranty:manage`;
  preserves the row and writes WARRANTY_VOIDED history. Repeating it returns 409.
- `GET /equipment/:equipmentId/warranty-status?date=YYYY-MM-DD` — scoped;
  date defaults to today in Vietnam. Returns covering ACTIVE period, latest
  ended ACTIVE period, or null warranty fields per the contract.
- `POST /equipment/:equipmentId/qr-codes` — staff with `qr:manage`; creates or
  reprints one active random token and returns its portal URL. RETIRED
  equipment returns 409 `EQUIPMENT_RETIRED`.
- `DELETE /equipment/:equipmentId/qr-codes` — staff with `qr:manage`; revokes
  the active token, returns 204 even when already revoked.
- `GET /qr/:token` — authenticated, scoped equipment lookup; revoked, unknown
  and out-of-scope tokens return 404. RETIRED equipment remains readable, while
  Service Request decides whether new work may be created.
- Every non-health route needs an access token. The backend gets `tenantId`
  only from the verified token and rejects unknown request fields.
- Errors follow `{code, message, details?}`; logs are JSON lines with the
  correlation id.

## Commands

M2 event runtime uses optional `RABBITMQ_URL`. Queue `asset-service.history`
has bounded retry and DLQ; each history write and inbox row commit together.
Equipment patches increment snapshotVersion, add MOVED history and enqueue the
complete EquipmentMoved v1 snapshot under the same row lock/transaction.
When the broker is unavailable, events stay in the Asset outbox. See
[ADR 0009](../../docs/decisions/0009-maintenance-m2-runtime.md) and
[event operations](../../docs/architecture/events.md). The new additive migration
`20261027090000_equipment_move_outbox` preserves the original constraints.

```bash
pnpm start:dev        # watch mode (generates the Prisma client first)
pnpm test             # unit tests
pnpm test:e2e         # HTTP e2e tests with explicit fakes, no database writes
pnpm test:db          # integration against ASSET_TEST_DATABASE_URL only
pnpm lint && pnpm typecheck
pnpm build
pnpm db:migrate       # prisma migrate deploy
pnpm db:seed:dev      # idempotent DEMO models/equipment/warranties; never in production
pnpm db:check-drift   # migrations vs schema.prisma (needs ASSET_SHADOW_DATABASE_URL)
```

Unit and HTTP e2e tests cover query predicates, validation, auth, scope,
reference errors and error formatting. `test:db` calls
`requireTestDatabaseUrl('ASSET_TEST_DATABASE_URL')` before connecting and
uses only its own temporary tenant rows; it verifies transaction rollback,
unique keys, concurrent writes, history, and warranty date boundaries. The
`test:db` applies Asset's migrations to the dedicated test database before the
suite runs.

The dev seed owns only `asset_db`; run Organization's demo seed separately for
the referenced customers, sites and locations. Fixed Asset IDs are listed in
[fixtures.md](../../docs/api/fixtures.md). DEMO-ASSET-01 is covered through
2099-12-31, DEMO-ASSET-02 expired on 2021-12-31, and DEMO-ASSET-03 belongs to
the second customer and has no warranty. The seed has no user actor and never
reads another service database. These fixed periods are suitable for current
demo dates; update the fixture plan before 2100.

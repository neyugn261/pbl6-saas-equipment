# Asset Service

Equipment models, equipment, warranties and warranty check, QR codes, equipment history.

- Owner: Member B ([CONTRIBUTING.md](../../CONTRIBUTING.md))
- Port: `ASSET_SERVICE_PORT` (default 3002)
- Database: `asset_db` via `ASSET_DATABASE_URL` — see [prisma/README.md](prisma/README.md)
- API contract: [asset.yaml](../../docs/api/asset.yaml); conventions: [docs/api/conventions.md](../../docs/api/conventions.md)
- Organization HTTP client: `ORGANIZATION_SERVICE_URL` (required, already in root `.env.example`). It forwards the caller's token and correlation id; production has no fake fallback.
- QR portal base URL: `ASSET_QR_PORTAL_BASE_URL` (required, HTTP(S)); generated QR links use `<base>/portal/qr/<token>`.

## Status

M0 bootstrap and A2–A5 Asset endpoints are implemented. Service-event history
consumers are M2 work. Equipment detail and list warranty filtering read
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
  with pagination. A3–A5 write local Asset events; M2 adds events from other services.
- `GET /internal/equipment/:equipmentId` — scoped EquipmentRef for service
  callers forwarding the user's token. RETIRED stays readable as a status.
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

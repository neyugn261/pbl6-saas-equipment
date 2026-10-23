# Asset Service

Equipment models, equipment, warranties and warranty check, QR codes, equipment history.

- Owner: Member B ([CONTRIBUTING.md](../../CONTRIBUTING.md))
- Port: `ASSET_SERVICE_PORT` (default 3002)
- Database: `asset_db` via `ASSET_DATABASE_URL` — see [prisma/README.md](prisma/README.md)
- API contract (M1 draft, under review): [asset.yaml](../../docs/api/asset.yaml); conventions: [docs/api/conventions.md](../../docs/api/conventions.md)
- Organization HTTP client: `ORGANIZATION_SERVICE_URL` (required, already in root `.env.example`). It forwards the caller's token and correlation id; production has no fake fallback.

## Status

M0 bootstrap, A2 Equipment Model, and A3 Equipment endpoints are implemented.
Warranty mutation/status and QR endpoints are A4 work; service-event history
consumers are M2 work. Equipment detail and list warranty filtering already read
real ACTIVE warranty rows from `asset_db` and use today's date in
`Asia/Ho_Chi_Minh`. VOID periods are ignored. No warranty value is fabricated.

- `GET /health` — public, `200 {status:'ok', database:'up'}` or 503.
- `GET /equipment-models` — TENANT_STAFF with `equipment:read`, tenant-scoped;
  `page`, `pageSize`, `q`, `status`, `sort` per the contract. CUSTOMER visibility
  is awaiting a group decision, so CUSTOMER currently gets 403 and this
  endpoint is not fully accepted yet.
- `POST /equipment-models` — TENANT_STAFF with `equipment:manage`. Creates an
  ACTIVE model. Duplicate `(tenantId, manufacturer, modelCode)` → 409
  `UNIQUE_VIOLATION`.
- `PATCH /equipment-models/:modelId` — TENANT_STAFF with `equipment:manage`.
  A model of another tenant or an unknown ID → 404 `MODEL_NOT_FOUND`.
- `GET /equipment` — TENANT_STAFF or CUSTOMER with `equipment:read`. Token scope
  limits tenant and, for CUSTOMER, customer. Supports pagination, search,
  customer/site/status/warranty filters, and stable sort per `asset.yaml`.
- `POST /equipment` — TENANT_STAFF with `equipment:manage`. Requires an ACTIVE
  model in the token tenant and Organization-validated customer, site and
  optional location. Equipment and REGISTERED history commit together. The
  database enforces unique asset code per tenant and serial per tenant/model.
- `GET /equipment/:equipmentId` — scoped detail with current model, a genuine
  local warranty result, and whether an active QR row exists. The standalone
  warranty-status API remains A4.
- `PATCH /equipment/:equipmentId` — TENANT_STAFF with `equipment:manage`.
  Moves stay within the existing customer; changing site without a location
  clears the old location. RETIRED is final. Effective changes write MOVED,
  STATUS_CHANGED and/or DETAILS_UPDATED in the same transaction. No-op writes
  create no history.
- `GET /equipment/:equipmentId/history` — scoped, stable newest-first history
  with pagination. A3 writes local Equipment events; A4 and M2 add their events.
- `GET /internal/equipment/:equipmentId` — scoped EquipmentRef for service
  callers forwarding the user's token. RETIRED stays readable as a status.
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
pnpm db:check-drift   # migrations vs schema.prisma (needs ASSET_SHADOW_DATABASE_URL)
```

Unit and HTTP e2e tests cover query predicates, validation, auth, scope,
reference errors and error formatting. `test:db` calls
`requireTestDatabaseUrl('ASSET_TEST_DATABASE_URL')` before connecting and
uses only its own temporary tenant rows; it verifies transaction rollback,
unique keys, concurrent writes, history, and warranty date boundaries. The
test database needs Asset's existing migrations (`0001` and `0002`) deployed.

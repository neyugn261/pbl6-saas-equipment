# Asset Service

Equipment models, equipment, warranties and warranty check, QR codes, equipment history.

- Owner: Member B ([CONTRIBUTING.md](../../CONTRIBUTING.md))
- Port: `ASSET_SERVICE_PORT` (default 3002)
- Database: `asset_db` via `ASSET_DATABASE_URL` — see [prisma/README.md](prisma/README.md)
- API contract (M1 draft, under review): [asset.yaml](../../docs/api/asset.yaml); conventions: [docs/api/conventions.md](../../docs/api/conventions.md)
- Organization HTTP client: `ORGANIZATION_SERVICE_URL` (required, already in root `.env.example`). It forwards the caller's token and correlation id; production has no fake fallback.

## Status

M0 bootstrap plus the A2 Equipment Model endpoints are implemented. Equipment,
warranty, QR and history endpoints remain future M1 work.

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
- Every non-health route needs an access token. The backend gets `tenantId`
  only from the verified token and rejects unknown request fields.
- Errors follow `{code, message, details?}`; logs are JSON lines with the
  correlation id.

## Commands

```bash
pnpm start:dev        # watch mode (generates the Prisma client first)
pnpm test             # unit tests
pnpm test:e2e         # HTTP e2e tests with explicit fakes, no database writes
pnpm lint && pnpm typecheck
pnpm build
pnpm db:migrate       # prisma migrate deploy
pnpm db:check-drift   # migrations vs schema.prisma (needs ASSET_SHADOW_DATABASE_URL)
```

The A2 unit tests verify tenant predicates and the Organization HTTP adapter.
HTTP e2e tests exercise validation, auth, tenant isolation and error formatting
with an explicit repository fake. The Organization fake lives under
`test/support/` for later service tests.

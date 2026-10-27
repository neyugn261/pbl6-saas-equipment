# API Gateway

Public entry point for the PBL6 services. Configuration comes from the root
`.env` or this service's `.env`; see the root [`.env.example`](../../.env.example).
`API_GATEWAY_PORT` defaults to `3000`.
All eight `<SERVICE>_SERVICE_URL` settings are required at startup and must be
absolute HTTP(S) URLs. Populate them from the root `.env.example` before
starting the gateway.

## Routes

| Public prefix | Upstream URL setting | Upstream path |
| --- | --- | --- |
| `/api/auth/*`, `/api/identity/*` | `IDENTITY_SERVICE_URL` | `/*` |
| `/api/platform/*` | `IDENTITY_SERVICE_URL` | `/platform/*` |
| `/api/organization/*` | `ORGANIZATION_SERVICE_URL` | `/*` |
| `/api/assets/*` | `ASSET_SERVICE_URL` | `/*` |
| `/api/service-requests/*` | `SERVICE_REQUEST_SERVICE_URL` | `/service-requests/*` |
| `/api/service-requests/estimates/*` | `SERVICE_REQUEST_SERVICE_URL` | `/estimates/*` |
| `/api/workorders/*` | `WORKORDER_SERVICE_URL` | `/*` |
| `/api/maintenance/*` | `MAINTENANCE_SERVICE_URL` | `/*` |
| `/api/inventory/*` | `INVENTORY_SERVICE_URL` | `/*` |
| `/api/notifications/*` | `NOTIFICATION_SERVICE_URL` | `/*` |

The gateway forwards `Authorization` and `x-correlation-id`, generating a
correlation ID when absent. Requests whose path contains `/internal/` receive
404 before proxying. The same IP rate limit applies to both login routes
(`/api/auth/login` and `/api/identity/auth/login`); exceeding it returns 429.
Set `LOGIN_RATE_LIMIT` and `LOGIN_RATE_LIMIT_WINDOW_MS` to tune it. Set
`CORS_ORIGINS` to a comma-separated list of permitted web origins.

`GET /health` checks the Identity, Organization, Asset, and Service Request
health endpoints. It returns 200 when all are up or 503 with per-service state
when any are down. Other services are routed but are outside the M1 readiness
check.

## Development and verification

From the repository root, run `pnpm dev:gateway`. In this directory, run
`pnpm lint`, `pnpm typecheck`, `pnpm test:e2e`, and `pnpm build`.
The e2e suite uses local mock upstreams and needs no database. For the M1
integration path after all four services and demo fixtures are ready, run
`pnpm smoke:m1` from the root. The smoke test requires `SEED_DEMO_PASSWORD`.

## Local API Explorer and service dashboard

With `NODE_ENV=development` (or `test`), the Gateway serves:

- `http://localhost:3000/dev`: health of all eight upstream services, their
  configured addresses, implementation labels and links to API documentation.
- `http://localhost:3000/docs`: Swagger UI with six service documents and
  same-origin requests through the existing Gateway routes.
- `/dev/catalog`, `/dev/status`: developer-tool JSON, independent of the
  existing four-service `/health` readiness contract.
- `/docs/openapi/{service}.json`: a public Gateway view of `docs/api/*.yaml`.

The HTML, JS, CSS and Swagger bundle are served locally; no CDN is needed.
Nest copies `src/developer/public` when building. The Gateway reads contracts
from the monorepo's `docs/api` directory; keep that directory when running the
local developer portal. Changes do not modify the source YAML contracts.
All developer pages, assets and JSON routes return 404 in production.
These development-only routes intentionally have no business permission guard;
Try-it-out requests still use normal service authentication and tenant scope.

Start from the root:

```bash
pnpm install --frozen-lockfile
pnpm dev:gateway
```

If a Gateway watcher was already running before the first install/config change,
restart that Gateway process once so it loads the new dependency/asset settings.
Use your configured Gateway port if it differs from 3000. Start business services
and seed demo data as described in the root README to execute requests; the
portal itself can render even when some upstreams are unavailable.

To try an authenticated API: select Identity, expand `POST /auth/login`, click
Try it out, enter DEMO credentials and Execute. Copy `accessToken`, click
Authorize, and paste the token without a `Bearer ` prefix. Switch to Work Order
or another service and execute a request. Authorization is carried between
service selections in page memory, and cleared on a full page reload. After
logging in as another role, replace the authorized token explicitly.

Maintenance currently shows its contract with Try-it-out disabled. Inventory
and Notification have no OpenAPI document yet. Planned Cost Estimate operations
are omitted from the public SR document because implementation/Gateway routes
are not ready. Internal endpoints are removed from every public document and
remain blocked by the Gateway middleware. Catalog implementation labels must
be updated when a service ships its corresponding APIs.

Status `UP` means `/health` returned 2xx; `CHƯA CÓ HEALTH` means the upstream
answered 404 at that path; `DOWN` means another failing response or an
unreachable/timeout target. These labels do not assert business-flow readiness.

Validation: [developer portal checks](../../docs/testing/gateway-developer-portal.md).

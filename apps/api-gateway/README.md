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

# Maintenance Service

Maintenance owns `maintenance_db` and the Plan/Task lifecycle. M2-M1 installs
the service foundation and the customer/site snapshot migration; business
endpoints, EquipmentMoved consumption and scheduling follow in later tasks.

- Owner: Member B ([CONTRIBUTING.md](../../CONTRIBUTING.md))
- Port: `MAINTENANCE_SERVICE_PORT` (default 3003)
- Database: `maintenance_db` via `MAINTENANCE_DATABASE_URL`
- API contract: [maintenance.yaml](../../docs/api/maintenance.yaml)
- Decision: [ADR 0007](../../docs/decisions/0007-maintenance-snapshot.md)

The service uses the shared JSON logger, correlation ID, error format, global
JWT/permission guards and Prisma health check. `GET /health` is public; it
returns 200 with `database: up` or 503 with `database: down`. There are no
Maintenance business routes yet. Database migrations use only Maintenance's
database; IDs from Asset and Work Order remain logical references.

## Commands

Run from this directory after installing workspace dependencies:

```bash
pnpm start:dev       # generates Prisma client, then starts port 3003
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e       # bootstrap, auth/error pipeline and health with fake DB
pnpm build
pnpm db:migrate      # migrate deploy on MAINTENANCE_DATABASE_URL
pnpm db:check-drift  # uses MAINTENANCE_SHADOW_DATABASE_URL
pnpm test:db         # opt-in integration on MAINTENANCE_TEST_DATABASE_URL
```

`test:db` first checks that the URL names a test database, then applies
Maintenance migrations there. Create `maintenance_test_db` using
`infrastructure/postgres/dev-databases.sql` on existing Docker volumes. The
M2 snapshot migration refuses to run if `maintenance_plans` already has rows;
those environments need a reviewed backfill through Asset's authenticated API
before migration. Never insert placeholder UUIDs or read `asset_db` directly.

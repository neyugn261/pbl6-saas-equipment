# Organization Service

Tenants, branches, customers, sites, locations, contacts, customer memberships. Publishes `TenantCreated`, `TenantStatusChanged`, `CustomerMembershipChanged`.

- Owner: Member A ([CONTRIBUTING.md](../../CONTRIBUTING.md))
- Port: `ORGANIZATION_SERVICE_PORT` (default 3006)
- Database: `organization_db` via `ORGANIZATION_DATABASE_URL` — see [prisma/README.md](prisma/README.md)
- API contract (draft): [organization.yaml](../../docs/api/organization.yaml); conventions: [docs/api/conventions.md](../../docs/api/conventions.md)

## Status

M1 master data and tenants:

| Area | Endpoints | Permissions |
|---|---|---|
| Tenants | `GET/POST /tenants`, `GET/PATCH /tenants/{id}`, `POST /tenants/{id}/status` | `tenant:read` / `tenant:manage`, Platform Admin only |
| Branches | `GET/POST /branches`, `GET/PATCH/DELETE /branches/{id}` | `branch:read` / `branch:manage`, staff only |
| Customers | `GET/POST /customers`, `GET/PATCH/DELETE /customers/{id}` | `customer:read` / `customer:manage` |
| Sites | `GET/POST /customers/{id}/sites`, `GET/PATCH/DELETE /sites/{id}` | same |
| Locations | `GET/POST /sites/{id}/locations`, `PATCH/DELETE /locations/{id}` | same |
| Contacts | `GET/POST /customers/{id}/contacts`, `PATCH/DELETE /contacts/{id}` | same |
| Memberships | `GET/POST /customers/{id}/memberships`, `POST /memberships/{id}/status` | `user:read` / `user:manage` (Tenant Admin; Customer Admin for its own customer) |
| Branch staff | `GET/POST /branches/{id}/users`, `DELETE /branches/{id}/users/{userId}` | `user:read` / `branch:manage` |
| Internal | `GET /internal/customers/{id}`, `GET /internal/customers/{id}/sites/{siteId}?locationId=` | `customer:read` |

- Reads under a customer are open to CUSTOMER accounts for **their own
  customer only** (ADR 0003); any other id answers 404. Writes are staff only.
- `DELETE` is a soft delete. A deleted customer hides its sites, locations and
  contacts and deactivates its memberships (with `CustomerMembershipChanged`);
  a deleted site hides its locations and its contacts lose the site.
- `q` searches code and name; `%` and `_` are matched literally.
- Business rules: one primary contact per customer (setting `isPrimary` moves
  it), a contact's site must belong to the same customer, a location's parent
  must be in the same site and a move may not create a cycle (the site row is
  locked during tree changes), a location with children cannot be deleted, a
  branch used by a site or a staff assignment cannot be deleted.
- Events: creating a tenant writes `TenantCreated`, a status change writes
  `TenantStatusChanged`, in the same transaction as the change
  (`outbox_events`, ADR 0005). With `RABBITMQ_URL` set the service runs
  `OutboxRelay` and publishes them; Identity consumes them into
  `tenant_directory`. Without it the events stay PENDING until a broker is
  configured. The tenant code never changes; a status change to the current
  status is 409 `INVALID_STATE_TRANSITION`.
- Memberships (ADR 0006): one customer per CUSTOMER account. A Tenant Admin
  links any CUSTOMER account and may move it to another customer; a Customer
  Admin only links CUSTOMER_USER accounts to its own customer and never takes
  one from another customer. Every change writes `CustomerMembershipChanged`,
  which Identity turns into the `customer_id` claim (ADR 0003).
- User ids are checked through Identity's `GET /internal/users/{id}` with the
  caller's token (`IDENTITY_SERVICE_URL`, `IdentityClient`); the e2e suites
  replace it with a fake that follows the same contract.
- Dev data: `pnpm db:seed:dev` (below).

`GET /health` is public (`200 {status:'ok', database:'up'}` or 503); every
other route requires an access token. Errors follow `{code, message, details?}`.

## Commands

```bash
pnpm start:dev        # watch mode (generates the Prisma client first)
pnpm test             # unit tests
pnpm test:e2e         # boots the app with a fake database client
pnpm test:e2e:db      # API suites against organization_test_db (ORGANIZATION_TEST_DATABASE_URL)
pnpm lint && pnpm typecheck
pnpm db:migrate       # prisma migrate deploy
pnpm db:check-drift   # migrations vs schema.prisma (needs ORGANIZATION_SHADOW_DATABASE_URL)
pnpm db:seed:dev      # demo data (refuses NODE_ENV=production), idempotent
```

## Dev seed

`pnpm db:seed:dev` writes tenant DEMO, 2 branches, 2 customers, 3 sites, a
location tree and contacts with the fixed ids of
[fixtures.md](../../docs/api/fixtures.md). Run Identity's
`db:migrate` and `db:seed:dev` first and keep Identity running: the seed logs
the demo accounts in (`IDENTITY_SERVICE_URL`, `SEED_DEMO_PASSWORD`) to read
their ids, then links the two customer accounts to DEMO-CUST-01 and assigns
the four staff accounts to branch HCM. Without Identity it seeds everything
else and prints a warning. `TenantCreated` and `CustomerMembershipChanged`
are written to the outbox for the rows it creates, as the API would.

Order on a fresh machine: `pnpm db:migrate` (root) → identity `db:seed:dev` →
start identity → organization `db:seed:dev` → start organization (publishes
the outbox).

# Organization Service

Tenants, branches, customers, sites, locations, contacts, customer memberships. Publishes `TenantCreated`, `TenantStatusChanged`, `CustomerMembershipChanged`.

- Owner: Member A ([CONTRIBUTING.md](../../CONTRIBUTING.md))
- Port: `ORGANIZATION_SERVICE_PORT` (default 3006)
- Database: `organization_db` via `ORGANIZATION_DATABASE_URL` — see [prisma/README.md](prisma/README.md)
- API contract (draft): [organization.yaml](../../docs/api/organization.yaml); conventions: [docs/api/conventions.md](../../docs/api/conventions.md)

## Status

M1 master data (PR 1):

| Area | Endpoints | Permissions |
|---|---|---|
| Branches | `GET/POST /branches`, `GET/PATCH/DELETE /branches/{id}` | `branch:read` / `branch:manage`, staff only |
| Customers | `GET/POST /customers`, `GET/PATCH/DELETE /customers/{id}` | `customer:read` / `customer:manage` |
| Sites | `GET/POST /customers/{id}/sites`, `GET/PATCH/DELETE /sites/{id}` | same |
| Locations | `GET/POST /sites/{id}/locations`, `PATCH/DELETE /locations/{id}` | same |
| Contacts | `GET/POST /customers/{id}/contacts`, `PATCH/DELETE /contacts/{id}` | same |
| Internal | `GET /internal/customers/{id}`, `GET /internal/customers/{id}/sites/{siteId}?locationId=` | `customer:read` |

- Reads under a customer are open to CUSTOMER accounts for **their own
  customer only** (ADR 0003); any other id answers 404. Writes are staff only.
- `DELETE` is a soft delete. A deleted customer hides its sites, locations and
  contacts; a deleted site hides its locations.
- Business rules: one primary contact per customer (setting `isPrimary` moves
  it), a contact's site must belong to the same customer, a location's parent
  must be in the same site and a move may not create a cycle (the site row is
  locked during tree changes), a location with children cannot be deleted, a
  branch used by a site or a staff assignment cannot be deleted.
- Next PRs: tenant API + events, memberships and branch staff, dev seed.

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
```

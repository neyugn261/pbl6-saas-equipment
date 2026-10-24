# service_request_db — Prisma migrations

`service_request_db` is owned only by Service Request Service. Its structure comes from
`docs/erd/pbl6-schema-v3.1.sql` (section `service_request_db`) and ADR 0001.

The rules are the same as for Identity — read
[identity-service/prisma/README.md](../../identity-service/prisma/README.md):
migrations are the source of truth, never `prisma db push`, and CHECK
constraints / partial indexes / generated columns live only in SQL and must
never be dropped by a later migration.

Notes for this database:

- `cost_estimate_items.amount` is a `GENERATED ALWAYS ... STORED` column. `schema.prisma` declares it with `@default(dbgenerated("round((quantity * unit_price), 2)"))` so the drift check matches; it is read-only — never set it in `create`/`update`.
- Migration `0003_work_order_resolution` adds the customer-safe resolution
  snapshot populated from `WorkOrderCompleted.v2`. The original v3.1 ERD and
  `0001_init` remain the immutable baseline; later schema changes are additive
  migrations.

## Commands (run in `apps/service-request-service`)

```bash
pnpm db:migrate        # prisma migrate deploy
pnpm db:check-drift    # migrations vs schema.prisma (needs SERVICE_REQUEST_SHADOW_DATABASE_URL)
pnpm prisma:generate   # Prisma Client into src/generated (not in git)
```

Changing the schema: `pnpm db:migrate:dev --create-only --name <change>`, review
the SQL (remove any DROP of the raw-SQL objects), then `pnpm db:migrate:dev`
and `pnpm db:check-drift`.

Verified on 2026-10-13 against PostgreSQL 17.11: `0001_init` applies cleanly
and twice in a row; both diffs (migrations ↔ schema, database ↔ schema) are empty.

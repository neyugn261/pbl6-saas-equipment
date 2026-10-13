# workorder_db — Prisma migrations

`workorder_db` is owned only by Work Order Service. Its structure comes from
`docs/erd/pbl6-schema-v3.1.sql` (section `workorder_db`) and ADR 0001.

The rules are the same as for Identity — read
[identity-service/prisma/README.md](../../identity-service/prisma/README.md):
migrations are the source of truth, never `prisma db push`, and CHECK
constraints / partial indexes / generated columns live only in SQL and must
never be dropped by a later migration.

Notes for this database:

- `WorkOrder.serviceReports` is a list in Prisma although the database allows at most one report per Work Order (`service_reports.work_order_id` is UNIQUE): the composite FK `(tenant_id, work_order_id)` is not itself unique, which Prisma requires for a 1:1 relation.

## Commands (run in `apps/workorder-service`)

```bash
pnpm db:migrate        # prisma migrate deploy
pnpm db:check-drift    # migrations vs schema.prisma (needs WORKORDER_SHADOW_DATABASE_URL)
pnpm prisma:generate   # Prisma Client into src/generated (not in git)
```

Changing the schema: `pnpm db:migrate:dev --create-only --name <change>`, review
the SQL (remove any DROP of the raw-SQL objects), then `pnpm db:migrate:dev`
and `pnpm db:check-drift`.

Verified on 2026-10-13 against PostgreSQL 17.11: `0001_init` applies cleanly
and twice in a row; both diffs (migrations ↔ schema, database ↔ schema) are empty.

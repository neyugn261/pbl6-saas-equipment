# workorder_db — Prisma migrations

`workorder_db` is owned only by Work Order Service. Its structure comes from
`docs/erd/pbl6-schema-v3.1.sql` (section `workorder_db`) and ADR 0001.

The rules are the same as for Identity — read
[identity-service/prisma/README.md](../../identity-service/prisma/README.md):
migrations are the source of truth, never `prisma db push`, and CHECK
constraints / partial indexes / generated columns live only in SQL and must
never be dropped by a later migration.

Notes for this database:

- `uq_work_orders_maintenance_task` ignores `CANCELLED` Work Orders ([ADR 0002](../../../docs/decisions/0002-workorder-maintenance-task-index.md), audit F07).
- `WorkOrder.serviceReports` is a list in Prisma although the database allows at most one report per Work Order (`service_reports.work_order_id` is UNIQUE): the composite FK `(tenant_id, work_order_id)` is not itself unique, which Prisma requires for a 1:1 relation.
- `0004_maintenance_replacement_reference` adds nullable, unique replacement
  request/predecessor references and a CHECK for Maintenance-only pairs
  ([ADR 0011](../../../docs/decisions/0011-workorder-maintenance-replacement.md)).
  Existing rows remain NULL. Apply before running the replacement consumer;
  do not reset the DB or rewrite existing migrations.

## M3-A1 persistence

`0005_attachment_lifecycle` prepares M3 upload intent/idempotency/cleanup
persistence and verified metadata/tombstones on the two existing attachment
tables ([ADR 0013](../../../docs/decisions/0013-workorder-attachment-lifecycle.md)).
Legacy size/hash/verifiedAt stay NULL together and must not be served until
verified. Owner decision is confirmed; shared/schema review and a legacy
inventory/backfill decision are required before business DB deployment. A1
does not implement upload routes, storage access or workers. CHECK constraints
for phase/target/lease/metadata and existing partial indexes remain raw SQL.

## Inventory reservations

`0006_inventory_reservations` adds local WO holds/tombstones under ADR 0016.
The only FK is tenant+WO to work_orders; Inventory usage/transaction IDs are
logical references. CHECK constraints enforce hash/request shape and phase
metadata; tenant+request identity and committed usage/ledger IDs are unique.
No expiry/backfill/reset. Apply before using the reservation APIs; it does not
change or delete existing rows. Shared/schema peer review remains required.

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

ADR 0022 adds nullable branch ownership (service cases/notifications), site routing revision and the WO site routing projection. Apply the new migration; historical rows are not assigned from a user or current site automatically. See [branch runbook](../../../docs/user-guide/branch-service-management.md).

# inventory_db — Prisma migrations

`inventory_db` is owned only by Inventory Service. Its structure comes from
`docs/erd/pbl6-schema-v3.1.sql` (section `inventory_db`) and ADR 0001.

The rules are the same as for Identity — read
[identity-service/prisma/README.md](../../identity-service/prisma/README.md):
migrations are the source of truth, never `prisma db push`, and CHECK
constraints / partial indexes / generated columns live only in SQL and must
never be dropped by a later migration.

Notes for this database:

- `StockTransaction.workOrderParts` is a list in Prisma although `work_order_parts.stock_transaction_id` is UNIQUE (same composite-FK reason as above).
- F09 is enforced by the runtime's single stock/ledger/usage transaction and tested
  rollback. The original FK alone does not force every usage field to equal its
  ISSUE ledger field; do not bypass the owning service with direct SQL writes.
- `0002_work_order_part_returns` keeps quantityUsed immutable and caps returns.
- `0003_inventory_runtime` adds durable tenant/key operations (including ISSUE
  PENDING/COMMITTED/ABORTED), exact before/after ledger balances and a tenant FK from
  each new RETURN to its originating usage. Legacy nullable fields remain unknown.
  SQL checks validate balance arithmetic, states/outcomes and RETURN link type.
- WO reservation rows belong to workorder_db and are not created here. There is
  no cross-database FK; see ADR 0014 and the proposed owner contract.
- `0004_inventory_accountability` adds quarantine, catalog audit, snapshots and
  confirmed-use/reversal records. Issued/returned/confirmed quantities are bounded
  together. New parts default to whole quantities; existing fractional data remains.
- `0005_internal_cost_currency` pairs new internal reference costs with currency;
  existing costs with unknown currency stay nullable. See ADR 0015.

## Commands (run in `apps/inventory-service`)

```bash
pnpm db:migrate        # prisma migrate deploy
pnpm db:check-drift    # migrations vs schema.prisma (needs INVENTORY_SHADOW_DATABASE_URL)
pnpm prisma:generate   # Prisma Client into src/generated (not in git)
```

Changing the schema: `pnpm db:migrate:dev --create-only --name <change>`, review
the SQL (remove any DROP of the raw-SQL objects), then `pnpm db:migrate:dev`
and `pnpm db:check-drift`.

Verified on 2026-10-13 against PostgreSQL 17.11: `0001_init` applies cleanly
and twice in a row; both diffs (migrations ↔ schema, database ↔ schema) are empty.

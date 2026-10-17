# identity_db — Prisma migrations

`identity_db` is owned only by Identity Service. Its structure comes from
`docs/erd/pbl6-schema-v3.1.sql` (section 1) and ADR 0001.

## Rules

1. **Migrations are the source of truth.** `0001_init/migration.sql` is a verbatim
   copy of the reference section; `0002_user_customer_links` adds the customer
   read model of ADR 0003. `schema.prisma` mirrors them for the client.
   A merged migration is never edited (not even its comments: Prisma checks
   checksums) — every change is a new migration.
2. **Never use `prisma db push`.** Apply schema only with `pnpm db:migrate`
   (`prisma migrate deploy`).
3. **Objects Prisma cannot express live only in SQL** and must never be dropped
   by a later migration:
   - CHECK constraints (`roles`, `users`, `auth_sessions`, `account_tokens`, `tenant_directory`)
   - `uq_users_tenant_email`, `uq_users_platform_email` (expression + partial unique on `lower(email)`)
   - `idx_auth_sessions_user_active` (partial index)
   - triggers `trg_user_roles_type_guard`, `trg_users_type_immutable_when_assigned`,
     `trg_roles_type_immutable_when_assigned`, `trg_user_customer_links_guard` (0002)
   - CHECK on `user_customer_links.status` (0002)
4. **The role catalog is seeded by `0001_init`**; tenants cannot change it.
   The permission catalog lives in `packages/auth/src/catalog.ts` (shared with
   every service's `PermissionsGuard`, ADR 0004) and is **PROVISIONAL** until
   ADR 0001 open point #1 is approved. It is applied by `pnpm db:seed`
   (idempotent). Move it into a migration once approved.

## Changing the schema

```bash
# 1. Edit schema.prisma, then let Prisma draft the SQL without applying it
pnpm db:migrate:dev --create-only --name <change>
# 2. Read the generated SQL. Remove any DROP of the objects listed above and add
#    raw SQL for new CHECK constraints / partial indexes / triggers.
# 3. Apply and verify there is no drift
pnpm db:migrate:dev
pnpm db:check-drift
```

`db:check-drift` compares the migrations directory with `schema.prisma`
(exit code 2 on any difference) and needs `IDENTITY_SHADOW_DATABASE_URL`.
CI also compares the migrated database with `schema.prisma`.

Verified on 2026-10-13 (PostgreSQL 16.14 locally; CI runs PostgreSQL 17): the
migration applies cleanly and twice in a row, both diffs are empty, the
raw-SQL objects above exist after `migrate deploy`, and
`prisma migrate dev --create-only` produces an empty migration (no DROP).

## Seeds

| Command | What it does | Environments |
|---|---|---|
| `pnpm db:seed` | Permission catalog + role_permissions (provisional) | all |
| `pnpm db:seed:dev` | + demo tenant `DEMO` in `tenant_directory`, demo accounts (password from `SEED_DEMO_PASSWORD`) and the customer links of the two customer accounts | refuses when `NODE_ENV=production` |

The demo tenant and the customer links are written directly into the read
models only until Organization Service publishes its events
(`TenantCreated`, `CustomerMembershipChanged`); the seeded link uses
`source_changed_at` = epoch, so any real event replaces it.

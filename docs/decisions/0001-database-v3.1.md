# ADR 0001 — Database design v3.1

- Status: Accepted
- Date: 2026-10-12
- Schema reference: [`docs/erd/pbl6-schema-v3.1.sql`](../erd/pbl6-schema-v3.1.sql)

## Context

Database v3 was delivered as one `init.sql` that created all databases and tables at container start. The review of v3 found conflicts with the architecture decisions (Prisma migrations per service, fixed RBAC catalog, separate Identity/Organization services) and several data-integrity gaps.

## Decisions

### Architecture

| Topic | Decision |
|---|---|
| Prisma vs `init.sql` | `infrastructure/postgres/init.sql` only creates the 8 databases. Each microservice owns its schema through its own Prisma migrations. The service section of the v3.1 reference file is the source of that service's `0001_init` migration. |
| PostgreSQL-specific objects | CHECK constraints, partial/expression unique indexes, triggers and generated columns are kept as raw SQL in migrations. A later migration must never silently drop them (verify that `prisma migrate dev` produces no drift). |
| RBAC | Fixed global role catalog (`roles` has no `tenant_id`). Tenants cannot create or edit roles or permissions. Roles are seeded by migration. |
| Platform vs tenant scope | `users.user_type` and `roles.user_type` ∈ `PLATFORM_STAFF`, `TENANT_STAFF`, `CUSTOMER`. A trigger only allows a role whose `user_type` matches the account. Whether the *assigner* may grant a role is checked in the service layer. |
| Customer users | Customer Admin / Customer User are Identity roles (`user_type = CUSTOMER`). `customer_user_memberships` only links an account to one Customer and is not a source of authorization. A CUSTOMER account can never receive Technician, Dispatcher or other staff roles. |
| Login | Tenant users: tenant code + email + password. Platform Admin: platform scope without a tenant code. Identity keeps a local `tenant_directory` read model (fed by Organization events) to resolve tenant codes and reject logins of suspended tenants. |
| Events | Transactional outbox (`outbox_events`) in each producing service; inbox (`processed_events`) in each consuming service. `outbox_events.id` is the event id. `equipment_history.source_event_id` and `notifications.source_event_id` are unique for idempotent writes. |
| Deletion | Business records are not hard-deleted. FKs default to `ON DELETE RESTRICT`. Tenant/Customer-side master data has `deleted_at` (soft delete). Deleting in one database never implies deletion in another. |
| `tenant_id` | Every tenant-owned business table has `tenant_id NOT NULL`; children use composite FK `(tenant_id, parent_id)`. |

### Data changes v3 → v3.1

- **identity_db**: `scope` replaced by `user_type`. `password_hash` may be NULL only when `status` is `INVITED` or `DISABLED`. `refresh_token_hash` and `token_hash` are UNIQUE. Added `tenant_directory` and `processed_events`. Seeded the 8 roles.
- **organization_db**: `deleted_at` on tenants, branches, customers, customer_sites, locations, customer_contacts. CASCADE → RESTRICT. `customer_contacts.tenant_id` added. At most one primary contact per customer and one primary branch per user. `customer_user_memberships.customer_role` removed; `user_id` is unique. Added `outbox_events`.
- **asset_db**: `tenant_id` + composite FK on warranties, QR codes and history. One active QR per equipment (partial unique). `equipment_history.source_event_id` (unique). Added `processed_events`.
- **service_request_db**: Warranty decision snapshot on `service_requests` (`warranty_check_result`, `warranty_id`, `warranty_end_date`, `warranty_checked_by/at`). `request_comments.visibility` (`INTERNAL` by default / `CUSTOMER`). Cost estimates are versioned (`revision_no`, status `SUPERSEDED`, one live revision per request). `document_sequences` for `request_no`. Added outbox and inbox.
- **workorder_db**: Added `work_order_status_history`. `work_logs` records `actor_user_id` (Dispatcher, Service Manager or Technician) with optional `technician_id`. `report_attachments.uploaded_by`. `document_sequences` for `work_order_no`. Added outbox and inbox.
- **maintenance_db**: No checklist (out of MVP). Added outbox and inbox.
- **inventory_db**: `ADJUST` split into `ADJUST_IN` / `ADJUST_OUT`. `stocks.min_quantity` and `low_stock_alerted_at` for a basic low-stock alert. `work_order_parts.stock_transaction_id` (unique) links each issued part to its ISSUE transaction. Added outbox.
- **notification_db**: Added `processed_events`.
- The `pgcrypto` extension was removed (`gen_random_uuid()` is built into PostgreSQL 13+).

### MVP scope for use cases

| Use case | MVP decision |
|---|---|
| Maintenance Checklist | Out. Only Maintenance Plan and Maintenance Task. |
| Minimum Stock / Low Stock Alert | In (basic). |
| Request Part | Out. Inventory Staff issues parts for a Work Order. |
| Platform Audit Log | No admin screen. A minimal technical audit for sensitive actions may be added later. |
| Manage Subscription Plan | Out. `tenants.plan` is informational only. |
| Technician Profile | Owned by Work Order Service. |
| Manage Role / Permission | Becomes View Role / Assign Role; catalog is read-only. |

## Open points

Status 2026-10-17 (M0): #1 enforcement mechanism decided in ADR 0004 (list
still provisional); #4 drafted in `docs/architecture/state-machines.md`
(Proposed).

Status 2026-10-20: #2, #3, #4 and #5 decided in
[ADR 0006](0006-m0-review-decisions.md); #4 is now Accepted. #1 stays
provisional (`branch:read` added).

Status 2026-10-26: #1 is resolved for M2 by ADR 0008 D9 and Identity migration
`0003_permission_catalog`; the existing role and permission grants are kept.

1. Permission catalog and `role_permissions` seed: to be agreed before the Identity Service migration.
2. Which roles each role may assign (for example, may a Tenant Admin assign Tenant Admin?). This lives in code, not in the database.
3. Returning unused parts: a `RETURN` transaction referencing the Work Order is supported, but `work_order_parts` does not store a returned quantity. Confirm whether reports compute "used = issued − returned".
4. Service Request status transitions (including whether `COST_REJECTED` can return to `AWAITING_CUSTOMER_APPROVAL` after a new estimate revision) must be documented as a state machine.
5. Request and Work Order attachments have no visibility flag; confirm that every attachment may be shown to the customer.

## Verification

On 2026-10-12 the reference schema was run on PostgreSQL **16.14** (embedded binaries; Docker was not available; the target in docker-compose is 17):

- `init.sql` ran twice with no error (idempotent).
- The full v3.1 schema created every table, index and trigger with no error.
- 33 behaviour checks (blocked and allowed cases for triggers, partial unique indexes, composite tenant FKs, RESTRICT deletes, generated column and sequence upsert) gave the expected results.

Still to verify: the run inside the `postgres:17-alpine` container, and Prisma migration drift.

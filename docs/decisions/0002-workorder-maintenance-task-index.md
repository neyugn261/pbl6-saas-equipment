# ADR 0002 — Release a Maintenance Task when its Work Order is cancelled

- Status: Accepted
- Date: 2026-10-13
- Amends: [ADR 0001](0001-database-v3.1.md), `workorder_db`
- Audit finding: F07

## Context

In v3.1, `uq_work_orders_maintenance_task` was a unique index on
`work_orders (maintenance_task_id) WHERE maintenance_task_id IS NOT NULL`.
It ignored the Work Order status, so once a Work Order created for a
Maintenance Task was `CANCELLED`, no replacement Work Order could ever be
created for that task (verified on PostgreSQL: the second insert fails with
`duplicate key value violates unique constraint "uq_work_orders_maintenance_task"`).
The task would stay stuck.

## Decision

The index only counts Work Orders that are not cancelled:

```sql
CREATE UNIQUE INDEX uq_work_orders_maintenance_task
    ON work_orders (maintenance_task_id)
    WHERE maintenance_task_id IS NOT NULL AND status <> 'CANCELLED';
```

A `COMPLETED` Work Order still blocks a second one for the same task.
This mirrors `uq_active_workorder_per_request` for Service Requests, except
that a completed maintenance task is not re-opened.

The change is applied to the reference schema `docs/erd/pbl6-schema-v3.1.sql`
and is part of `workorder_db` migration `0001_init` (no database had this
table yet, so no separate migration is needed).

## Consequences

- When a Work Order for a task is cancelled, Maintenance Service may request a
  new one; `maintenance_tasks.work_order_id` must then be updated to the new
  Work Order (still unique per Work Order in `maintenance_db`).
- The other v3.1 audit findings (F09–F15) are unchanged and still open.

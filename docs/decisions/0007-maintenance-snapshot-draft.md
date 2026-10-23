# ADR 0007 draft — Maintenance ownership, snapshots and recurrence

- Status: **Draft; no decision is accepted by this file**
- Scope: A7 preparation for M2
- References: [ADR 0002](0002-workorder-maintenance-task-index.md), [ADR 0003](0003-customer-scope.md), [ADR 0004](0004-service-auth-and-authorization.md), [ADR 0005](0005-event-transport.md), [Maintenance API draft](../api/maintenance.yaml)

## Confirmed baseline

`maintenance_db` owns `maintenance_plans`, `maintenance_tasks`, its outbox and
inbox. Asset owns Equipment; Work Order owns Work Orders. These services use
logical IDs, not cross-database joins or foreign keys. The current schema has
no customer/site snapshot on plans, while `MaintenanceTaskDue.v1` requires
`customerId` and permits `customerSiteId` to be null. The scheduler has no
user token, so it cannot call Asset with a fabricated bearer token.

The existing unique key `(maintenance_plan_id, scheduled_date)` prevents
duplicate tasks for one plan/day. Work Order's partial index permits a new
Work Order after the prior one is cancelled (ADR 0002). Event consumers must
use the inbox for idempotency and outbox delivery does not make two databases
one atomic transaction.

## Proposed snapshot, pending review

Add `customer_id UUID NOT NULL` and `customer_site_id UUID NULL` to
`maintenance_plans` in a **new** migration, with tenant/customer and due
indexes as needed. The API validates a scoped `EquipmentRef` with the user's
token on plan creation and stores customer/site IDs in Maintenance's own DB.
Requests never accept those snapshot IDs directly. CUSTOMER_ADMIN reads only
plans/tasks of its token customer; CUSTOMER_USER has no `maintenance:read` in
the current RBAC catalog. No service reads `asset_db` directly.

Before a migration is written, count existing plans. If the table is empty,
the new required column can be added without backfill. If it contains rows,
backfill must resolve each Equipment through Asset using legitimate access or
a reviewed service authentication design; do not substitute random IDs or
query Asset's DB. Prepare migration, ERD annotation and any auth/event catalog
change as separate reviewable changes. Never edit `0001_init`.

## Decisions needed before M2 implementation

1. **Movement:** Does a plan continue at its original site, or follow an
   Equipment move? If it follows, define an Asset event or authenticated
   refresh API and its ordering/idempotency. Until then, a stale snapshot must
   not silently schedule work at the wrong site.
2. **Eligibility and transitions:** May RETIRED Equipment receive a new plan?
   May PAUSED resume after missed due dates? Is INACTIVE terminal? Can the
   equipment ID or first due date be changed after tasks exist?
3. **Calendar rule:** Define DAY/WEEK/MONTH/YEAR addition, month-end and leap
   day behavior, timezone (proposed Asia/Ho_Chi_Minh), and whether the next
   date is anchored to the original schedule or the completion time.
4. **Downtime:** After scheduler downtime, create every missed task, only one
   catch-up task, or resume from today? Set a bound so backlog cannot grow
   without limit. PAUSED/INACTIVE plans generate no tasks.
5. **Completion and retry:** Decide when `lastCompletedAt` moves, when a task
   becomes COMPLETED/FAILED, whether a cancelled Work Order retries the same
   task automatically, and the maximum attempts/backoff. `WorkOrderCreated`,
   `WorkOrderCompleted` and `WorkOrderCancelled` must be correlated by
   `maintenanceTaskId`; a cancelled Work Order may be replaced per ADR 0002.

## M2 implementation and verification outline

- Plan API uses an Asset HTTP client that forwards the caller token and
  correlation ID. Tests use a fake plus a real integration path when Asset is
  available. No fallback fake runs in production.
- Scheduler locks due plan rows, creates task and `MaintenanceTaskDue.v1`
  outbox entry in one transaction, and advances `nextDueDate` by the agreed
  calendar rule. Repeated ticks and two instances must produce one task/event
  per scheduled date. Relay retries and DLQ follow ADR 0005.
- Work Order event consumers process once by event ID and update the task and
  plan consistently within `maintenance_db`; an older event cannot overwrite
  newer terminal state.
- Verify month end, leap year, downtime, concurrent ticks, transaction
  rollback, cancelled Work Order replacement and customer isolation on a DB
  whose name contains `test`. The work requires Maintenance's test DB/env and
  CI command; Gateway route and frontend use belong to their owners.

No scheduler, plan API, schema migration or event catalog change is part of
this A7 draft. The open decisions above gate that M2 work.

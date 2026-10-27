# ADR 0009 — Maintenance M2 runtime and event ordering

Status: local implementation proposal. Calendar/Plan rules confirmed by the
project owner on 2026-10-27; shared event/schema and replacement integration
still require the reviews in CONTRIBUTING.md before merge.

## Calendar and Plan lifecycle (D03)

The owner selected a fixed calendar anchor: Jan 31 → Feb 28/29 → Mar 31;
Feb 29 yearly → Feb 28 in ordinary years → Feb 29 in the next leap year.
Completion never shifts the anchor. Dates are Vietnam calendar dates.
The first due date is the anchor. Downtime emits only the latest occurrence
not later than today and advances nextDueDate to the first future occurrence.

PAUSED/INACTIVE emit nothing. Resume sets anchor and first due date to today's
Vietnam date, skipping paused periods. INACTIVE is terminal. Name/description
edits are allowed; schedule edits affect future generation only, reset the
anchor to the submitted nextDueDate (or existing nextDueDate) and preserve
existing tasks. A past task's date cannot be reused to emit it twice.
RESOLVED/PARTIALLY_RESOLVED complete a task and advance lastCompletedAt by max;
UNRESOLVED makes it FAILED without changing lastCompletedAt. FAILED is final
for that occurrence; a new plan occurrence remains independent.

## Equipment snapshot (D02)

Asset maintains an integer snapshotVersion, initially 0, incremented under its
Equipment row lock whenever site/location changes. EquipmentMoved.v1 contains
the complete customer/site/location snapshot and the version; the Asset update,
history and outbox insert commit together. Internal EquipmentRef exposes the
version. No timestamp tie breaker or broker delivery order is assumed.

Maintenance retains an equipment snapshot even when there is no Plan. Creation
and EquipmentMoved ingestion serialize on the same equipment advisory lock,
merge by version, and update all matching Plans atomically. Old/equal versions
are ignored. An event carrying a complete snapshot can safely skip a version.
Scheduler skips any Plan whose version is behind the known local snapshot.
An unknown, not-yet-delivered move remains subject to eventual consistency;
there is no claim of a distributed transaction or a scheduler call to Asset.
Tasks preserve their creation-time customer/site snapshot for WO validation.

## Task/WO ordering and explicit replacement (D04)

Every WorkOrder event is checked against tenant/task/equipment and (when
present) customer. Durable per-WO links retain cancellation/completion tombstones.
Completion/cancellation may arrive before Created; terminal events win over
late Created. An old cancellation never clears a newer WO or a completed task.
Only the first WO or a WO ID allocated in a durable replacement request can
become the task's current WO.

Service Manager explicitly POSTs /maintenance-tasks/{id}/replacement with a UUID
requestId. The cancelled WO ID is retained on a PENDING task. Maintenance locks
the task, verifies the cancelled link, allocates replacementWorkOrderId, stores
the request and enqueues MaintenanceWorkOrderReplacementRequested.v1 together.
Retry uses the same requestId and returns the same result; another request is
rejected while one is pending. No automatic business replacement loop exists.
The WO consumer must use the supplied replacementWorkOrderId, lock the source
task key, validate previousWorkOrderId is CANCELLED and that no live WO exists,
then create/history/outbox/inbox atomically. Replaying MaintenanceTaskDue.v1
never means replacement. This new WO consumer is a handoff to Work Order's
owner; this branch implements and tests the Maintenance side only.

Transport uses existing bounded retries (5 attempts, 2/4/8/16 second delay) and
DLQ. A missing reference rolls back inbox and retries; a malformed/provenance or
tenant mismatch is a permanent event error. Outbox survives broker outages.

## Migration and privacy

All changes are additive new migrations. Existing Plan anchors come from
nextDueDate; existing Task snapshots are backfilled through their local Plan.
No cross-service DB query or invented customer ID is used. Asset history stores
only customer-safe event fields; SR reason, cancellation reason and arbitrary
payloads are never copied into public history.

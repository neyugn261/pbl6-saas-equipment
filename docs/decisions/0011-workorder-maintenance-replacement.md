# ADR 0011 — Durable Work Order Maintenance replacement references

Status: Proposed; implementation for issue #31, pending owner/shared review before merge.
Date: 2026-10-28. Extends ADR 0002 and the replacement handoff in ADR 0009.

## Context

Maintenance allocates and persists requestId, previousWorkOrderId and
replacementWorkOrderId, then publishes MaintenanceWorkOrderReplacementRequested.v1.
The Work Order consumer must retain business identity after a replacement is
cancelled: an old request cannot create a second successor from the same
cancelled predecessor. Inbox eventId alone is not sufficient when a producer
delivers the same business request using another eventId.

## Proposed decision implemented for review

Work Order migration 0004 adds two nullable UUIDs on work_orders:

- maintenance_replacement_request_id: unique, logical reference to the request
  owned by Maintenance. A request produces at most one WO, even across tasks.
- replaces_work_order_id: unique local WO reference. A cancelled WO has at most
  one successor; subsequent replacement must reference that successor after
  it is cancelled, rather than branch again from an earlier WO.

A CHECK requires both columns together, a Maintenance Task origin, MAINTENANCE
type, and a predecessor ID different from the new WO ID. Tenant/task/equipment/
customer/site and predecessor CANCELLED status are checked in the consumer.
Existing rows remain NULL; no historical relationship is inferred. No cross-DB
FK is introduced. The existing non-cancelled-per-task partial unique index is
kept: COMPLETED continues to block replacement (ADR 0002).

The supplied replacementWorkOrderId is the new WO's primary key. Replays find
that ID, verify immutable source/request/predecessor identity, and have no
business effect, including after later completion, cancellation or rescheduling.
Reusing a request, predecessor or target ID for a different relationship is
rejected. Title/schedule edits on an existing WO are not undone by a replay.

Initial Due, explicit replacement and all Maintenance WO workflows share the
global advisory lock maintenance-task:<lowercase task UUID>, before WO and
technician row locks. This serializes cancellation with replacement creation.
Inbox + number + WO + history + Created outbox commit in one local transaction.
requestedBy is recorded in the system history reason; createdBy/changedBy remain
NULL, no user token is fabricated and no system work_log is inserted.

The existing workorder-service.maintenance-tasks queue binds both Due v1 and
ReplacementRequested v1. Each event has its own inbox consumer key. Replaying
Due still never creates a replacement. Event payloads, permissions and HTTP API
responses remain unchanged; the new DB columns are not exposed as new API fields.

Missing references/not-yet-cancelled predecessors roll back inbox and use bounded
transport retry/DLQ. Handler validation failures also follow the shared handler
retry policy; this change does not modify shared transport error classification.

## Deployment and validation

Apply migration 0004 to workorder_db before starting this consumer. Deploy the
queue binding before enabling replacement UI. For previously published requests
whose events had no binding, reconcile Maintenance's PENDING request and replay
the original outbox event with its original IDs; do not allocate a new request.
Published outbox status is not proof that a replacement WO exists.

DB tests cover replay, replacement chains, conflicting intents/IDs, source scope,
concurrent delivery/cancellation, DB constraints and transaction rollback. The
Maintenance vertical slice uses real Gateway/PostgreSQL/RabbitMQ and producer
outboxes; a documented delivery fault delays a replacement's Created until after
Completed to verify Maintenance's terminal tombstone handling.

This change does not fix SR F09/F10/F11, approve ADR 0009/0010, implement upload,
or claim Web/Android acceptance. Shared ADR/ERD review is still required before
merge under CONTRIBUTING.md.

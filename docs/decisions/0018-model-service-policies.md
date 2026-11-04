# ADR 0018 — Chính sách dịch vụ theo Model

Date: 2026-11-04. Status: implementation decision under the user's instruction;
peer review pending. Amends ADR 0012's single-plan setup limitation. Does not
claim approval from other repository owners.

Asset owns warranty revisions; Maintenance owns model maintenance profiles.
Each service serializes revision allocation/default publication per tenant/model.
Published content is immutable; edits create drafts. Retirement prevents new
selection but does not erase historical content or interrupt frozen setup replay.
No cross-database FK or query is introduced. No new role/permission is required.

A policy has explicit APPLY or NONE (reason required). Missing policy is not NONE.
Model policies are opt-in for existing registrations; legacy manually specified
Warranty/Plan and already pending commands retain their original codec/hash.
Model-policy selection is server-resolved and pinned to immutable versions in a
registration preview; a stale preview/retired revision cannot silently select latest.
The handover date determines warranty start. Add months with end-of-month clamp;
exclusive anniversary minus one day is stored as inclusive warranty end.
Maintenance rules start at occurrence >=1 after handover and retain that calendar
anchor, including leap-year/month-end behavior. Independent schedules produce
independent tasks; no automatic merging or charging is introduced.

A submitted registration freezes both snapshots and a complete group fingerprint.
Maintenance atomically ensures all rule Plans in its DB. The durable group receipt
maps exact rule IDs to Plan IDs; Asset validates the complete mapping before marking
COMPLETED. All HTTP is outside write transactions. Original registration identity
is reused on timeout/restart, and no JWT is persisted. Old setup endpoints continue
serving old pending commands, never a random first Plan from a new group.

Maintenance TaskDue v2 and ReplacementRequested v2 carry an immutable checklist.
Consumers support v1/v2 before new producers are enabled. A WO owns its checklist
and result revision; only its current assigned technician may edit results.
Completion validates required items under the same WO lock/transaction as report,
inventory-hold guard and outbox. Replacement starts fresh results from Task content.
A DONE checkbox never changes Inventory stock. Item notes stay staff-only.

SR keeps temporal warranty status separate from incident assessment. Policy-backed
claims require an explicit COVERED/NOT_COVERED assessment and reason; UNKNOWN stays
under review/request-info. No diagnostic-WO loop is introduced. Still-in-term but
excluded claims use the existing estimate approval flow. An assessment cannot be
changed while a live estimate exists, or after acceptance; start a new review cycle
on reopen. Legacy SRs retain existing temporal behavior until explicitly assessed.
Rejecting a claim does not VOID the device Warranty.

Customer projections expose applied terms and approved summaries only. Drafts,
internal notes, hashes and setup keys remain private. Additive migrations retain
legacy sources as null and never manufacture coverage/usage history.

Implementation/acceptance tracking:
[plan](../plans/model-service-policies-plan.md),
[tasks](../planning/model-service-policies-agent-tasks.md).

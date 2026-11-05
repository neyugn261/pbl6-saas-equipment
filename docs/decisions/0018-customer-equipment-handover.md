# ADR 0018 — Customer handover and activation

Status: implementation proposal for Asset, Organization, Identity, Notification,
Web and shared-contract owner review. No approval or deployment implied.

Asset owns handovers, immutable submitted snapshots and audit. Equipment.status
is the lifecycle (ACTIVE/IN_SERVICE/OUT_OF_SERVICE/RETIRED); operationalStatus is
a separately confirmed physical condition (ADR 0010). Registration is initial
warranty/maintenance setup (ADR 0012), not customer acceptance.

The new opt-in `handoverRequired` creation option starts equipment OUT_OF_SERVICE.
Legacy creation defaults and existing equipment remain unchanged. Enrolling an
inactive equipment in handover also enables the permanent gate. Creating a
handover for already ACTIVE equipment does not deactivate it. Customer ownership
transfer is not an existing public Asset API and is not added by this feature.
Acceptance is always tied to the current occurrence and customer/site snapshot.

Asset serializes mutations on the equipment row. Acceptance, acceptance audit,
ACTIVE lifecycle update, activation audit and outbox commit atomically. There is
no remote activation command or intermediate activation-success claim. A failed
transaction leaves the request pending; retrying acceptance is safe. Broker
outages leave notification events in the existing durable outbox. No background
process keeps or impersonates a user's JWT.

Only CUSTOMER_ADMIN receives the new `equipment_handover:respond` permission.
Staff uses equipment:manage. Decision requests check Identity /auth/me and a
new Organization self-membership endpoint using the caller's token. This is a
feature-specific strengthening of ADR 0003/0004, without changing old endpoints.
Revocation is observed at the synchronous authorization check; no claim of an
atomic transaction across Identity, Organization and Asset is made.

One open draft/pending occurrence per equipment is enforced by a partial unique
index. A terminal request may be replaced, retaining its audit and supersession
link. Deadlines are checked using database time under the equipment lock. The
expiry worker uses the same lock order. No automatic acceptance or reminders.

EquipmentHandoverChanged.v1 is additive and carries only safe identity/status
fields. Notification reuses its durable pending/inbox/projection/fan-out pipeline.
Consumers do not activate equipment. New contracts require owner plus consumer
review before production binding. No existing event version is changed.

Rollout: review contracts and this ADR; apply additive Asset and Identity
migrations; deploy shared packages and services together; seed/reconcile catalog;
bootstrap Notification recipients if not already done; verify real flows; then
use the opt-in creation flow. No legacy backfill or data reset.

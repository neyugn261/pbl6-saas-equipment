# Customer handover schema delta (ADR 0018)

Asset owns `equipment_handovers` and append-only API audit
`equipment_handover_audit`. Equipment has permanent `handover_required` and
`current_handover_id`. Existing rows receive false/null without status changes.
The current occurrence ID is checked against tenant/equipment/customer by the
database activation trigger. No cross-database FK is introduced.

Each handover has UUID occurrence identity, tenant-unique display number,
immutable snapshot, version, creator, expiry, submitted/accepted/activated times,
accepting user, rejection text and superseding occurrence ID. Audit records
action, actor (null for expiry worker), correlation ID and database timestamp.
Partial unique index permits one DRAFT/PENDING occurrence per equipment.
CHECKs constrain state/acceptance/activation evidence. ACCEPTED is only transient
inside the atomic acceptance transaction, never a committed partial activation.

Identity adds one permission and CUSTOMER_ADMIN grant through its own migration.
Organization retains authoritative memberships; new internal self lookup does
not change its schema. Notification uses existing pending/inbox/delivery tables.

Authoritative additive SQL: Asset migration `20261104090000_customer_handover`
and Identity migration `20261104090000_handover_permission`. Existing ERD v3.1
tables and operational-condition meanings remain unchanged.

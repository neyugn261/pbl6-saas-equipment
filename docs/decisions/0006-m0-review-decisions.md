# ADR 0006 — Team decisions after the M0 review

- Status: Accepted
- Date: 2026-10-20
- Amends: [ADR 0001](0001-database-v3.1.md) (open points #2–#5),
  [ADR 0004](0004-service-auth-and-authorization.md) (permission catalog)
- Audit decisions: DEC-01, DEC-05 – DEC-10, DEC-13 (DEC-02/03/04/12 were closed
  by ADR 0003 and ADR 0004; DEC-11 stays open until M2)

## Context

The audit of the repository before M0 listed the decisions the team had to
take before or during M1. M0 closed the technical ones. The team met after M0
and took the remaining business decisions below. Values that the meeting left
open were settled with the team afterwards and are marked *(follow-up)*.

## Decisions

### DEC-01 — Business baseline

The product is the Field Service Management platform for equipment vendors of
`AGENTS.md`, ERD v3.1 and the current code. SRS v1.0 (internal EAM) is no
longer a reference; SRS v1.1 follows this baseline and is kept by the team
outside the repository.

### DEC-05 / DEC-06 — Service Request and Work Order

[`docs/architecture/state-machines.md`](../architecture/state-machines.md) is
**Accepted**, with:

- In warranty: REVIEWING → ACCEPTED directly.
- Out of warranty: an estimate is sent and the customer must approve it. A
  free repair out of warranty is an estimate with `total_amount = 0` that goes
  through the same approval.
- A rejected estimate (COST_REJECTED) may get a new revision and return to
  AWAITING_CUSTOMER_APPROVAL. Every revision is kept.
- Finished work → RESOLVED; CLOSED only after the customer confirms. No
  automatic close.
- The Work Order keeps the ERD v3.1 statuses. It tracks the technical work;
  the Service Request tracks the request. No VERIFIED or CLOSED Work Order
  status.

### DEC-08 — Users and role assignment (ADR 0001 open point #2)

- Fixed roles only; no custom roles in the MVP.
- Who may grant or remove which role is `ASSIGNABLE_ROLES` in
  `packages/auth/src/catalog.ts`, checked by Identity on top of `role:assign`:

| Assigner | May assign |
|---|---|
| PLATFORM_ADMIN | TENANT_ADMIN, through tenant provisioning *(follow-up)* |
| TENANT_ADMIN | SERVICE_MANAGER, DISPATCHER, INVENTORY_STAFF, TECHNICIAN, and CUSTOMER_ADMIN / CUSTOMER_USER for any customer of the tenant *(follow-up)* |
| CUSTOMER_ADMIN | CUSTOMER_USER of its own customer only |
| other roles | nothing |

- A Tenant Admin never grants TENANT_ADMIN through the tenant's role API.
- CUSTOMER_ADMIN receives `user:read`, `user:manage` and `role:assign`. The
  services restrict it to accounts of its own customer (`dataScope`, ADR
  0003); an account of another customer answers 404. It never manages staff
  accounts.
- Linking a CUSTOMER account to a customer is account management: the
  Organization membership endpoints require `user:manage` (Tenant Admin for any
  customer, Customer Admin for its own customer and only for CUSTOMER_USER
  accounts that are not linked to another customer).
- New permission `branch:read`, granted to every TENANT_STAFF role.
  CUSTOMER_USER keeps `customer:read` (limited to its own customer).
- The backend always checks tenant and customer scope; hiding a screen is not
  authorization.

### DEC-13 — Serial number

`asset_db.equipments`: `UNIQUE (tenant_id, serial_number)` becomes
`UNIQUE (tenant_id, model_id, serial_number)`. The same serial number may
exist for two models of one tenant, never twice for one model.

### DEC-07 — Warranty overlap

- Warranties of one equipment never overlap. `start_date` and `end_date` are
  both covered days, so a warranty ending on day D and one starting on day D
  overlap.
- Creating or updating a warranty runs in one transaction that first locks the
  equipment row (`SELECT … FOR UPDATE`), then checks overlap, so two
  concurrent requests cannot both pass the check.
- Because of this rule, at most one ACTIVE warranty covers a given day; the
  `warranty-status` lookup needs no tie-breaker.

### DEC-09 — Attachments and returned parts (ADR 0001 open points #3, #5)

Attachments:

- `request_attachments`, `work_order_attachments` and `report_attachments` get
  `visibility VARCHAR(20) NOT NULL DEFAULT 'INTERNAL'
  CHECK (visibility IN ('INTERNAL', 'CUSTOMER'))`, the same values as
  `request_comments.visibility` *(follow-up: the meeting called the second
  value CUSTOMER_VISIBLE)*.
- A CUSTOMER account only receives `CUSTOMER` attachments of data in its scope
  (not in lists or counts either).

Parts:

- Issued, returned and consumed quantities are tracked per Work Order part:
  consumed = issued − returned.
- `inventory_db.work_order_parts` keeps `quantity_used` as the issued quantity
  and gets `quantity_returned NUMERIC(12,2) NOT NULL DEFAULT 0` with
  `CHECK (quantity_returned >= 0 AND quantity_returned <= quantity_used)`.
  A return writes a `RETURN` stock transaction (`reference_type`
  `WORK_ORDER`), increases `stocks.quantity` and `quantity_returned` in one
  transaction.

### DEC-10 — Mobile

The mobile owner is chosen when M1 ends. The M1 assignment does not change.

## Consequences

- Done together with this ADR: the permission catalog and `ASSIGNABLE_ROLES`
  (`packages/auth`), the state machines, the Organization and Asset contracts,
  the ERD reference and these migrations (additive, applied after `0001_init`):

| Change | Migration |
|---|---|
| Serial number unique per model | `asset_db` `0002_serial_unique_per_model` |
| `request_attachments.visibility` | `service_request_db` `0002_attachment_visibility` |
| `work_order_attachments.visibility`, `report_attachments.visibility` | `workorder_db` `0002_attachment_visibility` |
| `work_order_parts.quantity_returned` + `chk_work_order_parts_returned` | `inventory_db` `0002_work_order_part_returns` |

- Still to do by the owners when they build the features: the warranty lock
  and overlap check (Asset), filtering attachments by visibility (Service
  Request, Work Order) and the part return flow (Inventory).
- Identity's user API (M1) implements `ASSIGNABLE_ROLES`; existing tokens are
  not affected because permissions are not in the token (ADR 0004).
- The permission list stays PROVISIONAL until it is moved into an
  `identity_db` migration.

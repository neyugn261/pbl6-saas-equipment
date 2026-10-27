# ADR 0008 — Team decisions after the M1 review

- Status: Accepted
- Date: 2026-10-23
- Amends: [ADR 0006](0006-m0-review-decisions.md) (account management),
  [state machines](../architecture/state-machines.md) (review, cancel,
  technician status), ERD v3.1 (`work_orders.created_by`)
- Review decisions: D1 – D11, and D4a, D6a, D7a, C5 settled with the team the
  same day. D12a – e (maintenance) are recorded in
  [ADR 0007](0007-maintenance-snapshot.md).

## Context

The M1 review ran the whole stack through the Gateway. Two account flows of
ADR 0006 did not work end to end (a Platform Admin could not create a Tenant
Admin; a Customer Admin could not manage the Customer Users it invited), the
review workflow of a Service Request differed between the contract, the state
machine and the web, and several M2 questions were still open. The team met
on 2026-10-23 and took the decisions below. D4a, D6a, D7a and C5 came up while
the work was split; the team accepted the proposals of the review for them.

## Decisions

### D1 — A Customer Admin manages its Customer Users

- Identity stays the only service that creates and manages accounts. Account
  creation is not moved to Organization.
- A CUSTOMER_ADMIN sees an account of its own tenant only when it is a
  CUSTOMER account already linked to the caller's customer
  (`user_customer_links`), or a CUSTOMER_USER account it invited itself
  (`user_roles.assigned_by` = the caller) that is not linked to any customer
  yet.
- `GET /users/{id}` and `GET /internal/users/{id}` of Identity accept a
  CUSTOMER_ADMIN token under this rule. Any other account answers 404, so a
  Customer Admin cannot probe accounts outside its scope. Seeing a Customer
  Admin of its own customer does not allow managing it: only CUSTOMER_USER
  accounts are managed (`ASSIGNABLE_ROLES`).
- Organization keeps its own checks when linking: CUSTOMER_USER only
  (`ROLE_NOT_ASSIGNABLE`), never an account linked to another customer
  (`USER_LINKED_TO_OTHER_CUSTOMER`).

### D2 — A Platform Admin creates Tenant Admins

- Identity provides `POST /platform/tenants/{tenantId}/admins` (final path
  checked against the contract conventions in the PR). Gateway exposes it
  under `/api/platform/*`.
- PLATFORM_STAFF with `tenant:manage` only; no new permission. A Tenant Admin
  or Customer Admin never gets this operation.
- The tenant must exist in `tenant_directory` and be ACTIVE.
- Retry safe: when the email already belongs to an INVITED Tenant Admin of
  that tenant, the existing account is returned and its previous activation
  token is revoked before a new one is issued. Any other use of the email
  answers 409.
- Writing to the database by hand is not an onboarding path.

### D3 — One review operation for a Service Request

- A request starts in NEW. `review` moves NEW → REVIEWING and runs the first
  warranty check in the same transaction; the caller is recorded as
  `warranty_checked_by`.
- `start-review` is removed once the contract, backend, web and tests are
  changed together. `warranty-check` stays to check again while REVIEWING.
- Creating a request stores no warranty snapshot. The ERD CHECKs tie
  `warranty_check_result`, `warranty_checked_at` and `warranty_checked_by`
  together, so the snapshot is written whole by a staff check or not at all.
- `accept` is refused until a staff warranty check exists.

### D4 — Cancelling a Service Request and its Work Order

- Coordination is event driven. Service Request never calls Work Order
  synchronously to check or cancel a Work Order.
- An ACCEPTED request can be cancelled by `service_request:review`; the
  `ServiceRequestStatusChanged` event (to CANCELLED) is the signal.
- Work Order consumes that event idempotently (inbox) and cancels the live
  Work Order of the request when it is CREATED, ASSIGNED or ACCEPTED (D4a). A
  Work Order already TRAVELLING, IN_PROGRESS or ON_HOLD is never cancelled
  silently: it continues and the Service Manager is told.
- Race: a `WorkOrderCreated` that reaches a CANCELLED request is ignored (no
  PROCESSING); the Work Order side cancels that Work Order when it receives
  the cancel event, whatever the order of the two events.
- A PROCESSING request cannot be cancelled directly (409). The Work Order is
  cancelled through its own workflow; the result flows back by event (D4a).

**D4a.** `WorkOrderCancelled` v2 adds `cancelServiceRequest` (boolean). When
true the request moves PROCESSING → CANCELLED; when false it returns to
ACCEPTED as before. A Work Order cancelled because its request was cancelled
publishes `cancelServiceRequest: true`; the request is already CANCELLED
(terminal) and ignores it.

### D5 — `created_by` of automatic Work Orders

- `work_orders.created_by` becomes nullable. NULL means the Work Order was
  created by the system from an event (Maintenance Task); the source is traced
  through `maintenance_task_id`, the status history row (`changed_by` NULL)
  and the correlation id of the event.
- A Work Order created through the API always records the caller.
- No placeholder user is used to satisfy NOT NULL.

### D6 — What a customer sees of the result

- The customer follows the result through a safe summary on the Service
  Request. No permission to read a whole Work Order or Service Report is
  added in the MVP.
- **D6a.** The summary is the report `result`, `customerSummary`,
  `completedAt` and `workOrderNo`. `customerSummary` is text the technician
  writes for the customer, separate from internal notes, and is required when
  the report is submitted. It travels in `WorkOrderCompleted` v2 and is
  stored on the request.
- A CUSTOMER account only receives data of its own customer and only
  `CUSTOMER` attachments; internal notes and INTERNAL attachments are never
  returned, also not in history, nested objects or counts.

### D7 — A tenant never loses its administrators

- Nobody suspends their own account or removes their own TENANT_ADMIN role.
- Only PLATFORM_STAFF changes the status or roles of a TENANT_ADMIN.
- The last ACTIVE Tenant Admin of a tenant cannot be suspended. The check
  locks the tenant's Tenant Admin rows (`SELECT … FOR UPDATE`) in the same
  transaction, so two concurrent requests cannot suspend the last two.
- Proposed error codes: 403 `SELF_MODIFICATION_FORBIDDEN`, 409
  `LAST_TENANT_ADMIN`.
- **D7a.** A Platform Admin changes the status of a Tenant Admin with
  `POST /platform/tenants/{tenantId}/admins/{userId}/status`, next to D2.

### D8 — Activation token in responses

- The activation token is returned in an API response only in development and
  test, behind `IDENTITY_EXPOSE_ACTIVATION_TOKEN` (default false). Identity
  refuses to start when it is true with `NODE_ENV=production`.
- Tokens are single use and short lived (the current 72 hours is reduced; 24
  hours proposed), never written to logs, audit rows or public demo data.
- In M3 activation goes through Notification (email) and the response field is
  removed.

### D9 — Permission catalog

- Before the next `identity_db` migration the team approves the permissions
  M2 needs, and only those. The list and its backward-compatible changes are
  reported first.
- D2 reuses `tenant:manage`; D6 adds no permission. Existing permissions are
  not renamed or removed without checking every use.
- The catalog stays PROVISIONAL until then (ADR 0001 open point #1).

M2 resolution (2026-10-26): retain all existing role codes, permission codes,
and role → permission grants in `packages/auth/src/catalog.ts`. No D2 or D6
permission is added. `identity_db` migration `0003_permission_catalog` installs
this unchanged catalog; the Identity seed remains its idempotent reconciler.

### D10 — Codes of soft-deleted records

The code of a soft-deleted Branch or Customer stays reserved in the MVP:
creating the same code again answers 409. No partial unique index.

### D11 — Technician status

- BUSY and AVAILABLE are automatic; OFF_DUTY and INACTIVE are set by a manager
  and never overwritten automatically.
- A technician with at least one ACCEPTED assignment is BUSY. When an
  assignment ends (COMPLETED, REMOVED) and no ACCEPTED assignment remains, a
  BUSY technician becomes AVAILABLE.
- The status changes in the transaction that changes the assignment, with the
  technician row locked.
- No working calendar, leave or dispatch optimisation in the MVP.

### C5 — Gateway path of Work Orders

The Gateway keeps `/api/workorders`; the Work Order contract follows it.

## Consequences

- Done with this ADR: `state-machines.md` (D3, D4, D11), the ERD and the
  `workorder_db` migration `0003_created_by_nullable` (D5).
- Identity (M1): D1, D2, D7, D8 and their contract in `identity.yaml`.
- Service Request (M1): D3 and the Service Request side of D4 in
  `service-request.yaml`, the web and `m1-test-cases.md`.
- M2 preparation: `WorkOrderCancelled` v2 and `WorkOrderCompleted` v2 in the
  event catalog, the Work Order contract (D4a, D5, D6a, D11, C5), the summary
  columns of the Service Request (D6) and the permission list (D9).

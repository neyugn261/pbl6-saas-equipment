# ADR 0003 — Customer scope in the access token

- Status: Accepted
- Date: 2026-10-17
- Amends: [ADR 0001](0001-database-v3.1.md) (`identity_db`)
- Audit finding: ISS-02 (decision DEC-02)

## Context

A CUSTOMER account (Customer Admin / Customer User) may only see the
equipment, service requests and estimates of **its own customer**. The link
between an account and a customer lives in
`organization_db.customer_user_memberships`, but the access token only carried
`sub, sid, tenant_id, user_type, roles`. Asset, Service Request and Work Order
services therefore had no way to restrict a customer account without calling
Organization Service on every request. Without a restriction, a customer
account would see the data of every customer of the tenant (IDOR inside the
tenant).

Options considered:

1. Every service calls Organization (with a cache) to resolve the membership.
2. Identity keeps a local read model of the memberships, fed by an
   Organization event, and puts the customer id into the token.

## Decision

Option 2, the same pattern as `tenant_directory` (ADR 0001).

- Organization Service publishes `CustomerMembershipChanged` v1
  (`membershipId, userId, customerId, status ACTIVE|INACTIVE, changedAt`)
  through its outbox whenever a membership is created, moved or deactivated.
- Identity consumes it (queue `identity-service.directory`) into the new table
  `user_customer_links` (migration `0002_user_customer_links`):
  - one row per CUSTOMER account (`user_id` is the primary key);
  - a trigger only accepts a CUSTOMER account of the same tenant;
  - `source_changed_at` keeps the membership's `updated_at`; an older event is
    ignored, so a late redelivery never undoes a newer change;
  - the inbox (`processed_events`) makes the consumer idempotent.
- At login and refresh Identity adds the claim
  `customer_id` = customer of the ACTIVE link, else `null`. `/auth/me` returns
  it as `customerId`.
- Every service reads the scope with `dataScope(principal)` from `@pbl6/auth`:
  - TENANT_STAFF → `{ tenantId, customerId: null }` (whole tenant);
  - CUSTOMER with a customer → `{ tenantId, customerId }`;
  - CUSTOMER without a customer → 403 `CUSTOMER_SCOPE_MISSING` (never the
    whole tenant);
  - PLATFORM_STAFF → 403 `TENANT_SCOPE_REQUIRED`.
- Rows outside the scope are answered with **404**, not 403
  (`assertInScope`), so ids of other customers cannot be probed.

## Consequences

- No synchronous call to Organization on the request path.
- A membership change takes effect at the account's next token refresh, at
  most `JWT_ACCESS_TTL_SECONDS` (15 min) later. Acceptable for the MVP; a
  deactivated customer user can be cut off immediately by disabling the
  account in Identity (refresh then fails).
- Until Organization publishes the event (M1), the dev seed writes the links of
  the two demo customer accounts directly (`docs/api/fixtures.md`), with
  `source_changed_at` = epoch so any real event wins.
- `customer_user_memberships` stays the source of truth;
  `user_customer_links` is a read model and is never written by an API.
- Tokens issued before this change have no `customer_id`; the verifier treats
  the missing claim as `null`.

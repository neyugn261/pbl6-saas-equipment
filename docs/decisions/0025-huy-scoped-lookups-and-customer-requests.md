# ADR 0025: Huy scoped lookups, request access, and customer reporting

- Status: Proposed for owner review
- Date: 2026-11-25
- Scope: Organization, Identity RBAC, Service Request, Notification API

## Context

The 19/11 web/import handoff requires business-code batch lookup, customer-safe
request reporting, removal of Service Manager request creation, and searchable
recipient-scoped notifications. Service databases remain independent.

## Decisions

1. Organization exposes `POST /lookups/batch`. It resolves Customer,
   Site, Location, and Contact business codes in the caller's tenant and
   customer scope. Import rows provide codes, never an authorization scope.
   There is no 50-record business cap. Contact `code` is nullable and unique
   among live contacts of a customer; existing contacts remain valid.
2. Service Manager loses `service_request:create`; customer roles retain it.
   The shared permission catalog is the current authorization source used to
   derive permissions from role claims. Therefore old access tokens lose the
   permission as soon as services run the new catalog; refresh sessions do not
   need forced revocation. The Identity migration removes the persisted grant.
   Read/review, estimates, and Work Order actions remain unchanged.
3. Request list, summary, and customer report share one scoped filter builder.
   The report takes customer scope only from the verified principal and returns
   an allowlisted customer-visible projection. No estimate drafts, internal
   comments, inventory cost, or staff KPIs are included.
4. Notification search, event type, resource kind, read state, and date
   filters are composed with the existing recipient and branch scope. A
   resource link is a reference only; the destination endpoint must authorize
   the linked resource independently.

## Compatibility, migration, and rollback

- Organization adds `customer_contacts.code` as nullable, so existing rows and
  old clients continue to work. Rollback requires stopping clients that send
  the new field, then dropping `uq_customer_contacts_live_code` and `code` in
  a new forward migration; applied migrations are never edited.
- Identity applies a new data migration that deletes only the
  `SERVICE_MANAGER` grant for `service_request:create`. Customer grants and
  the permission catalog entry remain. Rollback is a new migration restoring
  that grant together with a reviewed catalog change; do not edit the applied
  migration.
- New request filters and report endpoints are additive. Existing list
  semantics remain, with stable ID tie-breakers. Rollback removes the new
  routes and filters after consumers stop using them.
- Notification query filters are additive and do not alter stored rows or
  resource authorization.

## Boundaries and follow-up

This decision does not add delivery-address entities, an unknown-site model,
equipment-name/site projections, estimate reporting, export jobs/download
authorization, or a parts-quote producer. Those require the owning Asset,
Inventory, Work Order, and Web contracts. The batch endpoint only returns
Organization-owned data and never joins another service database.

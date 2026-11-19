# ADR 0024 — Bulk registration, part prices, approved-parts projection and public QR

Date: 19/11/2026. Status: implementation proposal for owner/consumer review; not a merged contract.
Baseline: `develop@f0751a4`. Branch: `codex/minh-ux-20261119`.

The user authorized implementation of Minh's UX checklist and explicitly approved a public QR allowlist (name/model/warranty status), with anonymous reports queued for verification. Existing authenticated equipment/history APIs retain their access checks. Public access is an explicit capability granted per active QR, initially disabled for every existing code.

## Bulk registration

`POST /bulk-handovers/preview` validates 1–50 rows without creating equipment. `POST /bulk-handovers` creates equipment and DRAFT registrations, their histories and a durable batch result atomically **inside asset_db**. An actor/tenant-scoped Idempotency-Key recovers the original result; a changed payload conflicts. Unique database constraints arbitrate overlapping batches. RegistrationService reuses the same transaction; references are prevalidated before opening it, with the existing model lock retained on write.

The MVP accepts JSON rows or CSV UTF-8, up to 100,000 characters; the Web additionally checks file byte size. CSV is parsed as data, with quoted cells/escaped quotes, allowed headers and strict DTO validation. No Excel dependency, macro processing or native XLSX import is introduced. A default model may be selected, and each CSV row may override it.

Each batch uses one customer, site and delivery method. Warranty/maintenance remain UNCONFIRMED in the resulting drafts. Opening each existing registration preserves its policy preview, STORE/CUSTOMER_SITE rules, actual dates, customer acceptance and maintenance provisioning. Import does not itself activate warranties or invent customer consent. Policy submission remains a separate existing workflow; no distributed atomic handover is claimed. A bulk policy preview/confirmation experience is still a subsequent enhancement.

## Pricing

Part has nullable Decimal(14,2) costPrice and standardPrice. Existing data stays NULL (unknown), distinct from 0. The MVP currency is VND, fixed by a DB check; no currency conversion, tax calculation or accounting is added. Prices are JSON decimal strings, validated nonnegative with at most two decimal digits.

The current inventory:manage permission controls price writes and visibility of catalogue costPrice. Standard price is available to staff with inventory:read. An application interceptor also removes costPrice/cost_price from nested Part includes and audit before/after data for users without management permission. This policy concerns new catalogue prices; existing ISSUE unit-cost accounting semantics are unchanged.

`PUT /parts/{id}/pricing` locks Part, requires expectedVersion, increments pricingVersion, and records the before/after audit in the same transaction. Catalogue changes never mutate approved estimate snapshots. No new role or permission is introduced.

## Approved-parts projection — producer work still required

`CostEstimatePartsSnapshot.v1` is a proposed full snapshot emitted by Service Request, with a sourceVersion increasing **per Request**, estimateId/revision, APPROVED/WITHDRAWN status, VND and linked part lines (lineId, partId, description, quantity, unitPrice). WITHDRAWN has an empty line list. The producer must persist this sequence and enqueue snapshots in its owning transaction on approval, replacement or withdrawal. Manual legacy PART descriptions cannot be guessed into catalogue IDs.

Inventory owns the projection and inbox. It validates the envelope/producer/tenant, checks referenced Parts in its DB, deduplicates event IDs, rejects conflicting equal versions and ignores stale versions. WO is resolved through the existing authenticated Work Order API, including its branch and Request reference. `GET /work-orders/{id}/recommended-parts` returns NO_SNAPSHOT/WITHDRAWN/APPROVED, immutable approved prices and a per-Part reconciliation summary for the current WO.

The summary distinguishes approved quantity, unfulfilled open demand, PENDING ISSUE, issued, returned, confirmed used and unreconciled quantities. It is an operational comparison, not an invoice, spending authorization or a per-estimate-line allocation. Read results can evolve while events and stock operations converge. A replacement WO does not inherit the previous WO's issued quantities automatically.

Approval creates **no stock reservation**. Demand continues through PartRequest and ISSUE/reservation under ADR 0014/0016/0023. No automatic new PartRequest is generated, avoiding duplicate demand and violations of accepted-assignment rules. Catalogue lookup is the existing server-paginated `GET /parts?q=...&status=ACTIVE` with additive price fields.

Huy still owns estimate partId storage, source version/outbox production and lifecycle decisions. Nguyên owns integrating the estimate picker after that Request contract exists. This implementation does not claim the live approval-to-projection path is complete. The new event contract must be reviewed with those owners before publication.

## Public QR and pending inquiries

Authenticated staff with qr:manage explicitly enable an existing active QR; no GET issues or rotates codes. Settings use live Organization site validation and branch scope. The public projection contains only model name/code and the current warranty result, not equipment displayName (which can contain internal names), serial, customer, location, IDs, history, dates or prices.

The same high-entropy QR token grants only this public projection when enabled. Existing `/qr/{token}` still requires authentication and ownership. Revocation/rotation closes the old public link. The equipment snapshotVersion captured on enable must match current Equipment; movement invalidates access until staff review/re-enable. A TenantStatusChanged consumer disables all public links on suspension/disable, idempotently; reactivation does not reopen them. This is eventual event-based revocation, with the existing broker/topology/replay limits; it is not instant tenant introspection.

Lookup issues an HMAC capability with a 15-minute expiry, random nonce and QR binding. The HMAC domain is separate from JWT signatures, using the existing configured secret. POST validates the signature, active QR/equipment and expiry. Its token hash and request hash provide single-form idempotency, including response-loss retries; different data under the same form conflicts. Equipment locking serializes submission with revoke/rotation. Public responses expose a reference and PENDING_VERIFICATION, not contact details or internal state.

Inquiries live in asset_db because the QR owns the intake capability; they are unverified contact messages, not Service Requests or Work Orders. They capture the servicing branch configured when public access was enabled. Routing changes in Organization need staff review/re-enable; no live anonymous cross-service lookup is claimed. Branch staff see only their assigned inquiry queue. A handler records ACKNOWLEDGED or REJECTED plus a reason and actor/time; a second decision conflicts. Staff creates a real Request through the existing authorized process after verification. Automatic conversion, media upload and new notification events require Huy's contract and are not included.

The public endpoint has bounded in-memory minute windows (30 reads / 5 submissions per IP+QR per minute). A single Gateway can share an upstream IP, and several service replicas do not share the limiter. Production needs a trusted proxy policy and an edge/shared limiter, TLS, log URL redaction (QR capabilities must not enter access logs), monitoring and an agreed contact-data retention/purge policy. No automatic deletion of contact evidence is implemented without a retention decision. This is a local MVP capability, not approval to open an Internet deployment.

## Schema and compatibility

- Asset: new independent bulk/inquiry tables; additive QR fields, default private. Existing migration files remain unchanged.
- Inventory: additive prices and snapshot/inbox tables. No cross-database FK/query.
- OpenAPI supplement: [Minh UX](../api/minh-ux.yaml).
- Existing Web forms and authenticated routes remain available; public `/portal/qr/{token}` links to the authenticated `/portal/qr/{token}/secure` path.
- Web changes are limited to surfaces needed to demonstrate Minh's APIs. Flutter source is unchanged.

Deploy contract changes through a separate review before implementation merge, following CONTRIBUTING. No commit/PR/merge is part of this working-tree delivery.

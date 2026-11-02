# ADR 0016 — Work Order ownership of Inventory reservations

Date: 2026-11-02. Owner: Khương. Implements the user's request to integrate the
WO side of ADR 0014 after Inventory PR #54. Status: implementation prepared for
peer/shared-schema review; this document does not claim Nguyên/Minh approval.

## Decision

WO owns `work_order_inventory_reservations` in `workorder_db`, added by migration
`0006_inventory_reservations`. Inventory retains operations, stock, ledger and
usage in its own DB. The only FK is tenant+WO to the local `work_orders` table.
Inventory usage/transaction IDs are logical references, never cross-DB joins.

Identity is `(tenantId, requestId)`, where requestId is the Inventory idempotency
key. Persist its exact WO, canonical request fingerprint, original Inventory
actor/request snapshot, state, and committed usage/transaction IDs. Recovery can
be performed by another currently authorized Inventory staff member; it does
not change the original actor. No bearer token is stored.

Internal POST reserve and settle require TENANT_STAFF with `inventory:issue`
and `work_order:read`. Authorize the WO before requesting source proof. Fetch
`GET /internal/inventory-operations/{requestId}` from `INVENTORY_SERVICE_URL`
using the original bearer/correlation ID. Validate tenant/key/WO/ISSUE, canonical
SHA-256 fingerprint, original actor/request and phase. COMMITTED proof must have
the matching usage/ledger UUIDs, tenant/WO/part/warehouse/quantity/recordedBy.
Body outcome alone is never evidence of a stock commit or rollback.

Proof HTTP calls finish **before** taking WO DB locks. Under a transaction-level
advisory lock for tenant+request, then the scoped WO row lock, recheck ownership
and identity. Reserve does not subsequently take a source/technician lock, so
existing workflow order source → WO → technician is preserved without a cycle.

- First reserve requires PENDING proof and nonterminal WO, creates HELD.
- Same identity replays its current durable state, including terminal rows.
- HELD → COMMITTED only with stable Inventory COMMITTED proof and matching IDs.
- HELD → RELEASED only with stable ABORTED proof.
- ABORTED proof may create RELEASED before any hold, including for a terminal WO;
  this tombstone fences delayed reserve that fetched a stale PENDING proof.
- Missing hold cannot be settled COMMITTED. Terminal outcomes cannot reverse or
  swap usage/ledger identity. Identity mismatch is 409.
- HELD has no timer/expiry. Source PENDING, unreachable, invalid or unauthorized
  never unlocks a hold. This preserves safety after an uncertain remote commit.

Every complete/cancel path takes the same WO row lock and rejects any HELD with
409 `INVENTORY_RESERVATION_HELD`. The cancel guard lives in the workflow
repository used by HTTP and SR cancellation consumer; complete checks before
report/assignment/outbox writes. Multiple holds must all settle before terminal.
Settlement can finish after a WO becomes terminal when there is no hold to
release (e.g. an aborted reserve that lost the race).

An SR cancellation rejected by HELD rolls back inbox processing; it is not ACKed
as successfully processed. Existing bounded retry/DLQ still applies. After
settlement, replay the original event if it already exhausted retries; no consumer
calls Inventory synchronously or fabricates a service token.

## Configuration, errors and operation

`INVENTORY_SERVICE_URL` already exists in shared env/Compose; WO validates and
consumes it as optional. A missing URL keeps existing WO startup working but
reservation calls return 503 `INVENTORY_PROOF_UNAVAILABLE`.
Typed missing Inventory proof is 409; unknown source route 404/network/5xx is 503,
never a fabricated ABORTED proof. Source 401/403 keeps its status. Query/body
extras are rejected. Responses are no-store and expose only reservation identity
and state. Gateway continues blocking internal routes.

For recovery use Inventory operation GET/retry/abort with a current authorized
token and the **same** key. No auto-expiry, manual DB release or new UUID as a
timeout workaround. COMMITTED stock requires RETURN, not abort. Inventory
`PENDING_FINALIZE` is a stock success awaiting synchronization.

Apply WO migration 0006 and Inventory migrations through 0005 before enabling
ISSUE end-to-end. No backfill is needed: previously missing WO reservation routes
failed closed, leaving Inventory operations pending. Resume those exact keys
after deployment. Peer review of auth/tenant/schema and shared ERD is still part
of the PR process.

## Validation

DB/HTTP tests cover proof forgery, key rebinding, phases, concurrent reserve,
complete/cancel races, multiple holds, stale PENDING versus tombstone and SR
inbox rollback/replay. The live integration uses real Gateway, Inventory, WO and
two dedicated PostgreSQL DBs, original test JWTs, WO SIGKILL/restart and Inventory
application restart. Boundary hooks model lost responses; no fake reservation
or stock result is used. UI, live Identity and broker acceptance remain separate.

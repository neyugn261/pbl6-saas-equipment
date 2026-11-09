# Inventory Service

Seed hệ thống chuẩn: từ root chạy `pnpm demo:seed`; để xóa dữ liệu local và nạp lại chạy `pnpm demo:reset` khi backend đã dừng. [Catalog, 14 tài khoản và kịch bản hai chi nhánh](../../docs/user-guide/demo-data.md). Các seed riêng bên dưới phục vụ chuẩn bị danh mục của từng service.

M3 runtime owned by Minh. Part/Warehouse, stock/threshold reads, immutable ledger,
receive/adjust, issue/return, durable idempotency and LowStockDetected outbox/relay.
ISSUE uses the durable WO reservation API implemented under ADR 0016. Missing
reservation/proof services still fail closed. On 07/11/2026 the
[mobile stage 3 fixture](../../docs/testing/mobile-stage-3.md) verified real
Gateway/Identity/WO/Inventory ISSUE, settlement, RETURN, completed-report use
confirmation and reversal against isolated test databases. This supersedes
the earlier contract-fixture-only integration status in this README.

- Port: `INVENTORY_SERVICE_PORT` (default 3008)
- Database: `inventory_db` via `INVENTORY_DATABASE_URL` — see [prisma/README.md](prisma/README.md)

## API and permissions

Gateway prefix: `/api/inventory`. Business paths:

- `GET/POST /parts`, `GET/PATCH /parts/:id`
- `GET/POST /warehouses`, `GET/PATCH /warehouses/:id`
- `GET /stocks`, `PUT /warehouses/:warehouseId/stocks/:partId` (minQuantity only)
- `GET /stock-transactions`, `POST /stock-transactions/receive`, `/adjust`
- `GET/POST /work-orders/:workOrderId/parts`, `POST /work-order-parts/:id/return`
- `GET /inventory-operations`, `GET /inventory-operations/:key`,
  `POST /inventory-operations/:key/retry`, `/abort`
- `GET /internal/inventory-operations/:key` — proof for WO; Gateway blocks internal paths.
- `GET /inventory-audit`, `POST /stock-transactions/:id/inspect`
- `POST /work-order-parts/:id/confirm-use` — report Technician only
- `POST /usage-confirmations/:id/reverse` — Inventory Staff
- `GET /equipment/:id/service-parts` — equipment-scoped safe service history

Stock/catalog/ledger are TENANT_STAFF only. Shared catalog: inventory:read,
inventory:manage, inventory:issue; no new role/permission. Tenant comes only from
JWT. Customer and platform accounts are denied stock access; the separate service
history projection permits scoped CUSTOMER with equipment:read. Another tenant's
IDs return 404 for resources. Quantities and unitCost
are decimal **strings**, never JSON numbers. Empty PATCH, unknown fields, stock
quantity edits and immutable SKU/unit/warehouse branch/code edits are rejected.

[Inventory OpenAPI](../../docs/api/inventory.yaml),
[reservation/recovery contract](../../docs/api/inventory-reservations.yaml),
[ADR 0014](../../docs/decisions/0014-inventory-m3-transactions-and-reservations.md).

## Configuration and run

Use existing root `.env.example` fields: INVENTORY_DATABASE_URL,
INVENTORY_SHADOW_DATABASE_URL, INVENTORY_TEST_DATABASE_URL, JWT settings,
ORGANIZATION_SERVICE_URL, WORKORDER_SERVICE_URL, optional ASSET_SERVICE_URL (required
for service-parts ownership checks), optional RABBITMQ_URL. No new
unsafe-issue flag exists. Without broker, events stay PENDING durably; with broker,
shared outbox relay retries and records FAILED after its retry budget (ADR 0005).

```powershell
pnpm install --frozen-lockfile
pnpm --filter inventory-service db:migrate
pnpm dev:inventory
```

## Rules and retry

Every receive/adjust/issue/return requires `Idempotency-Key: UUID`; preserve the
same key on timeout/retry. Same canonical request returns the original snapshot;
different request/operation with the same tenant key gives 409. No expiry. An ISSUE
PENDING after timeout may have a WO hold; use recovery rather than starting a new key.

Receive/adjust/issue require active Part+Warehouse; adjust needs an IN/OUT direction
and note. No negative stock/overflow. RETURN is allowed after WO terminal or catalog
INACTIVE, to the exact original warehouse and no more than unreturned issued quantity.
quantityUsed stays issued. Under [ADR 0015](../../docs/decisions/0015-inventory-accountability-and-service-parts.md),
GET usages exposes quantityIssued, quantityOutstanding (issued minus returned),
quantityConfirmedUsed and quantityUnreconciled. quantityConsumed now means confirmed
use only. Clients must not interpret unreturned quantity as installed quantity.

New parts default to whole quantities; explicitly set allowFractional=true for
metres/litres. Existing parts keep their historical fractional policy. SKU/unit/
allowFractional are immutable. Common unit aliases are normalized at creation.
RECEIVE needs documentReference or explanatory note. ADJUST needs reasonCode and
note; CORRECTION additionally links an opposite-direction receipt/adjustment in the
same part/warehouse and cannot exceed its uncorrected quantity.

RETURN requires condition=GOOD/DAMAGED/PENDING_INSPECTION. Only GOOD increases
available stock. Other returns increase quantityQuarantined, never issueable stock.
POST /stock-transactions/:id/inspect releases or scraps a specific return's unresolved
quantity with note and idempotency. Release requires active part/warehouse; scrap
permits inactive. Ledger retains available and quarantine before/after balances.

POST /work-order-parts/:id/confirm-use checks the real completed WO, its completed
assignment history and matching Service Report using the Technician JWT. It records
incremental actual use without changing stock. Completed WO has no current active
assignment: do not authorize against currentAssignment. Returns and confirmations
lock the same usage; confirmed + returned <= issued. Staff may reverse an erroneous
confirmation once through /usage-confirmations/:id/reverse, preserving both records.
The technician supplies customerReason and the disposition of old removed components;
an old component never counts as returning a newly issued part.

GET /inventory-audit exposes catalog/threshold before/after history. New transactions
and usage retain immutable catalog snapshots; legacy missing snapshots stay null.
Internal unitCost and unitCostCurrency are supplied together or both omitted; null
means unknown, not free. They never become a customer's price.

GET /equipment/:id/service-parts is a narrowly selected projection for equipment:read
staff/customers, verified against live Asset tenant/customer scope with the user's
JWT. Asset dossier includes this section and a separate paginated endpoint. Only
confirmed use and correction history appear; effectiveQuantity is zero for reversed
records even across pages. Cost and warranty decisions are explicitly unknown to
Inventory, pending SR/approved estimate integration. recordedAt is when Inventory
recorded confirmation, not a claimed installation date. No internal notes/costs/
warehouses/actors are included. See [API additions](../../docs/api/inventory-accountability.yaml).

ISSUE stores PENDING, reserves WO, then commits stock+ISSUE+usage+outbox+result
atomically. Settlement needs WO to verify the Inventory proof. No auto-expiry. A
successful stock write with failed settlement remains successful and carries
`X-Inventory-Reservation-State: PENDING_FINALIZE`. Inspect
`GET /inventory-operations?reservationPending=true` (inventory:read for oversight), then POST `/:key/retry` (inventory:issue) with a
current authorized token. Explicit abort returns 200 with ABORTED proof; committed
stock cannot be aborted (409), only returned. Retrying an ABORTED original ISSUE
returns its original stored error. PENDING_RELEASE means WO release still needs retry.

LowStock: quantity < minQuantity emits once while latched; quantity >= minQuantity
re-arms. Changing threshold also evaluates this rule. One business occurrence is
one immutable outbox row/eventId; publish/replay does not mint a new event ID. A new
crossing after re-arm creates a new occurrence. Audience/deep link/Notification
dedup is Huy's contract; producer does not invent recipients.
Stock list includes current part/warehouse names, available/quarantined quantity,
isLowStock and shortageQuantity so an old notification is not mistaken for current stock.

## Seed and verification

Run Identity+Organization demo services/seeds first. `IDENTITY_SERVICE_URL` and
`SEED_DEMO_PASSWORD` must be configured. Dev seed logs in as the HCM and DN Inventory accounts,
validates both branches with real tokens, seeds three parts and two warehouses, writes only inventory_db and refuses
production. The seed preserves existing metadata, status, thresholds and quantities;
its initial receipt uses a fixed idempotency key.

```powershell
pnpm --filter inventory-service db:seed:dev
pnpm --filter inventory-service db:seed:dev
pnpm --filter inventory-service lint
pnpm --filter inventory-service typecheck
pnpm --filter inventory-service test
pnpm --filter inventory-service test:e2e
pnpm --filter inventory-service test:db
pnpm --filter inventory-service db:check-drift
pnpm --filter inventory-service build
```

`test:db` strictly requires inventory_test_db and a real RABBITMQ_TEST_URL (falls
back to local RABBITMQ_URL), uses isolated tenant/exchange/queues and never silently
skips broker proof. Seed tests validate the seed function against API fixtures;
they are not a claim that a local Identity login/Organization seed ran end to end.
Broker evidence in ignored `tmp/inventory-low-stock-evidence.json` includes exact
observed envelopes, retry and replay; Notification/Gateway/UI acceptance is separate.

[M3 handoff](../../docs/plans/minh-m3-inventory-handoff.md) describes remaining owner dependencies.

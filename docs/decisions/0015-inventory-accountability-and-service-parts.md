# ADR 0015 — Inventory accountability and confirmed service parts

Date: 2026-11-02. Implements the owner's request to improve the M3 business review.
Amends ADR 0006's shorthand `consumed = issued - returned`; keeps its estimate approval rules.

## Decisions

- `quantityUsed` remains a legacy storage/API alias for issued quantity. Expose
  `quantityIssued`, `quantityOutstanding`, `quantityConfirmedUsed` and
  `quantityUnreconciled`; never infer installation from unreturned stock.
- Confirmation is an immutable incremental record by the
  Technician who completed the report, checked against the real completed WO,
  completed assignment history and Service Report. Inventory
  records when it learned the result, not a fictional installation timestamp.
  Inventory Staff may reverse a mistaken confirmation with an explicit reason;
  history remains. Confirmed + returned cannot exceed issued. No confirmed use on
  CANCELLED work. WO owns technical completion and report. Confirmation follows
  report creation; there must not be a circular gate requiring these post-report
  confirmations before WO can create the report. Any customer final-close check
  is a separate SR reconciliation integration for Huy/Khương to review.
- RETURN requires GOOD / DAMAGED / PENDING_INSPECTION and a note. Only GOOD enters
  available stock. Others enter quarantine, never issueable stock. Inspection can
  release or scrap all/part of a particular return, with provenance, actor and
  reason; no more than that return's unresolved quantity. Old removed components
  are described by the technician in service confirmation/report, never returned
  as newly issued components.
- New parts default to whole quantities. An explicit `allowFractional=true`
  supports metres/litres. Existing parts are preserved with fractional=true;
  historical quantities are not rounded. Unit is trimmed and normalized through
  a small alias catalog; established non-alias custom units remain supported.
  Unit and fractional policy are immutable after creation.
- Receive records a document reference or explanatory note. Adjust requires a
  structured reason and note. CORRECTION links an opposite-direction RECEIVE or
  ADJUST on the same part/warehouse, with cumulative correction bounded by the
  original quantity. ISSUE/RETURN are corrected by return/confirmation reversal,
  never by silently rewriting history.
- Catalog/status/threshold changes write before/after audit in the same local
  transaction. New ledger and usage rows retain part/warehouse snapshots. Legacy
  rows without snapshots explicitly remain incomplete.
- A narrowly selected customer service-parts view checks live Equipment scope
  through Asset using the caller JWT, plus tenant/customer/equipment association
  from WO validated at confirmation. It excludes internal costs, stock, staff
  notes and adjustment history. Only confirmed, non-reversed quantities appear;
  reversals are visible as corrections. Asset composes this view with partial
  availability. No new roles or direct cross-database access.
- `unitCost` with `unitCostCurrency` is optional internal reference cost, not valuation or customer price;
  null means unknown. Customer charges and warranty decisions remain Service
  Request/approved estimate data. The parts view explicitly says these decisions
  are not supplied by Inventory; no fabricated zero-price or warranty renewal.
- Recovery responses explain committed/unknown/aborted stock state, next allowed
  actions, original responsible actor and pending duration. Low-stock reads join
  names and current quantities; the existing one-event-per-episode policy stays.

## Cross-owner acceptance still required

Khương: real durable WO reservation/terminal locks, report reconciliation UX and
old-part disposition. Huy: customer estimate/coverage linkage and notifications.
Hatsady: Inventory/recovery/customer views. Nguyên: gateway/CORS/CI review. Existing
Inventory APIs and additions below are not evidence that these owners' flows run.

Migrations 0004/0005 are additive to Inventory only. No existing migration is rewritten.

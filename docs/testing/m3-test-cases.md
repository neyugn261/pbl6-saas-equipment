# M3 Web acceptance matrix

## Status and execution notes

This matrix covers the Web scope M3-E1–E4. The **Actual status** column records
execution in the current task, not whether the code path exists. Browser
acceptance against a running Gateway and services was not run; the local Web
test environment did not include those applications. Do not mark a scenario
passed from a successful typecheck or production build.

| ID | Role | Data / setup | Steps | Expected result | Actual status |
|---|---|---|---|---|---|
| E1-01 | Service Manager | Tenant with one non-terminal WO; actions returned by the API | Open WO detail, use each displayed action, then reload | Only server `allowedActions` are offered; state and history reflect the API response | NOT RUN — browser/API |
| E1-02 | Technician | WO assigned to this technician; valid report inputs | Accept, travel, start, hold/resume, complete | Only currently permitted transitions are offered; completion requires a service report and customer summary | NOT RUN — browser/API |
| E1-03 | Dispatcher | WO with a conflicting or stale version | Submit an action after another actor changes the WO | HTTP 409 is shown, WO is refreshed, and the UI does not report success | NOT RUN — browser/API |
| E1-04 | Staff / Customer | SR and equipment in the same tenant/customer scope | Open SR detail, dossier, timeline, and history | Loading, empty, 401, 403, 404, and service errors remain distinct; no fixture data appears on failure | NOT RUN — browser/API |
| E1-05 | Service Manager | SR in a state that permits an estimate | Create, edit, send, revise, then resolve as customer | Estimate actions follow parent `allowedActions`; server supplies totals; stale actions surface conflict and refresh | NOT RUN — browser/API |
| E1-06 | Customer Admin | Sent estimate in the customer's scope | Approve or reject; try another tenant's estimate ID | Only customer-safe actions appear; cross-customer access is rejected by the backend | NOT RUN — browser/API |
| E1-07 | Service Manager | Equipment with maintenance history | Create/update a plan and inspect tasks/history | Live Maintenance API data is shown; empty/error states are not presented as zero or mock records | NOT RUN — browser/API |
| E2-01 | Service Manager | Non-terminal WO; valid JPEG/PNG/PDF no larger than 10 MiB | Prepare, PUT using ticket headers, finalize, refresh list | Attachment appears only after finalize; storage PUT carries no API bearer token | NOT RUN — browser/MinIO |
| E2-02 | Technician | Assigned non-terminal WO and an INTERNAL attachment | Upload then try to publish or delete another user's attachment | Technician can upload INTERNAL evidence; server rejects unauthorized publish/delete; UI exposes only authorized actions | NOT RUN — browser/API |
| E2-03 | Service Manager | Completed WO with submitted report | Upload a report attachment | Report upload is allowed only after completion/report submission; report data is not recreated | NOT RUN — browser/API |
| E2-04 | Service Manager | Upload ticket prepared; simulate PUT failure | Fail PUT and inspect cleanup behavior | UI reports PUT failure and attempts DELETE of the upload intent; cleanup failure is shown explicitly | NOT RUN — browser/MinIO |
| E2-05 | Customer User | SR with INTERNAL and CUSTOMER attachments | Open SR result attachments and download each visible file | Only CUSTOMER-visible metadata is listed; download obtains a fresh short-lived URL; staff routes remain inaccessible | NOT RUN — browser/API |
| E2-06 | Staff / Customer | Notifications with unread and read items for separate audiences | Open bell/inbox, filter, page, mark unread item read | Count and inbox match the current user; marking read updates count; customer navigation never exposes a WO link | NOT RUN — browser/API |
| E3-01 | Inventory Staff | Active branch, warehouse, part | Create part and warehouse; view stock | API-backed records appear; decimal quantities are preserved as strings | NOT RUN — browser/API |
| E3-02 | Inventory Staff | Part with active warehouse; receipt document or explanatory note | Receive a fractional quantity where allowed | One ledger transaction is recorded; missing document and note are rejected in the UI | NOT RUN — browser/API |
| E3-03 | Inventory Staff | Active WO and sufficient stock | Issue a part to a WO | The real WO is selected; operation uses an idempotency key and remains recoverable if the result is uncertain | NOT RUN — browser/API |
| E3-04 | Inventory Staff | Two operators competing for the last stock | Submit concurrent issues | The backend serializes stock changes; conflict is surfaced and inventory is reloaded without retrying as a new issue | NOT RUN — browser/API |
| E3-05 | Inventory Staff | WO usage with outstanding quantity | Return some quantity, then inspect ledger | Returned quantity cannot exceed outstanding quantity; condition and return are recorded | NOT RUN — browser/API |
| E3-06 | Inventory Staff | Source ledger transaction for correction | Try CORRECTION without a source, then with matching source | Missing/mismatched source is rejected; correction is linked to its source transaction | NOT RUN — browser/API |
| E3-07 | Tenant Admin | Read-only inventory role | Try creating a part, receiving, issuing, returning, or adjusting | Lists remain readable; mutations are not exposed and backend authorization remains authoritative | NOT RUN — browser/API |
| E3-08 | Service Manager | Work Orders crossing report period boundaries | Query A5 summary with inclusive local dates | Dedicated summary endpoint is used with `+07:00` half-open bounds; no totals are derived from paginated WO lists | NOT RUN — browser/API |
| E4-01 | Service Manager | New customer/site/model and equipment registration | Complete wizard using CREATE warranty and CREATE maintenance | One registration and equipment dossier are created; QR can be viewed/downloaded/printed | NOT RUN — browser/API |
| E4-02 | Service Manager | Existing equipment with warranty and plan | Resume wizard with KEEP for both | Existing warranty/plan IDs and schedule remain unchanged | NOT RUN — browser/API |
| E4-03 | Service Manager | Equipment that should not receive coverage/plan | Choose NONE for warranty and maintenance, enter reasons | Draft/submit validates required reasons; no coverage/plan is created | NOT RUN — browser/API |
| E4-04 | Tenant Admin, then Service Manager | Tenant Admin account and draft registration | Save draft; sign in as Service Manager and confirm/complete | Tenant Admin can save allowed draft fields only; manager performs the restricted confirmation | NOT RUN — browser/API |
| E4-05 | Service Manager | Registration POST commits but response is dropped | Recover using the displayed reconciliation flow and reload | Existing registration is found by idempotency key; no duplicate equipment/registration is created | NOT RUN — browser/API |
| E4-06 | Service Manager | Existing equipment with `registrationId` | Open by equipment ID, refresh or change account during a request | Wizard resumes the existing registration; stale responses do not cross account boundaries | NOT RUN — browser/API |

## Automated checks run for this change

| Command | Result |
|---|---|
| `pnpm --filter web lint` | PASS |
| `pnpm --filter web typecheck` | PASS |
| `node apps/web/test/session.test.mjs` | PASS — 7/7 |
| `Set-Location apps/web; node node_modules/vite/bin/vite.js build` | PASS — Vite reports a 909.69 kB JavaScript chunk warning |
| `pnpm --filter web test` | NOT PASS — pnpm workspace postinstall failed with Windows `EPERM` while another concurrent pnpm invocation was cleaning `packages/testing/dist`; the same Web test file passed when run directly as above |

The existing handover evidence is documented in
[equipment-registration.md](./equipment-registration.md). That is prior
evidence, not a regression run for this task.

## Regression for Notification paths and stock retry — 2026-11-03

Branch: `fix/hatsady-m3-notification-inventory-retry`, based on `develop@6cac11b`.

The Notification component now appends relative collection/query, unread-count
and mark-read paths to the configured Notification base exactly once. Stock
mutations persist the original key/path/body before POST, lock editing while
unresolved, and explicitly retry the saved intent for RECEIVE/ADJUST/ISSUE/RETURN.
Saved intents survive navigation/reload in the same tab, are scoped by tenant/user,
and cannot be replayed by an obsolete session. A late response cannot erase a newer
saved intent. Matching ISSUE recovery/proof resolves the local pending state;
reservation settlement remains under the existing backend recovery workflow.

| Check | Result |
|---|---|
| `cd apps/web && ./node_modules/.bin/eslint .` | PASS |
| `cd apps/web && ./node_modules/.bin/tsc -b` | PASS |
| `node --test apps/web/test/*.test.mjs` | PASS — 27/27 (20 M3 regression + 7 session regression) |
| `cd apps/web && ./node_modules/.bin/tsc -b && ./node_modules/.bin/vite build` | PASS — existing large JavaScript chunk warning |

These commands execute the tools used by the Web package scripts directly.
The pnpm script wrapper attempted an automatic workspace install and stalled on
registry downloads; it was stopped. No dependencies or lockfile were changed.

The new tests execute the real API client, configuration, Notification component
and Inventory component handlers/effects using a small hook host and deterministic
fetch/sessionStorage doubles. They cover filter/pagination, unread refresh after
mark-read, stock commit followed by response loss, exact replay after reload,
duplicate submit, first business rejection versus later authorization failure,
401 renewal, tenant/user isolation, storage failure, ISSUE proof/recovery, and a
late success after navigation. This is automated component/transport evidence;
it does not execute a browser DOM, Gateway process, PostgreSQL or RabbitMQ.

All browser/API acceptance rows above remain **NOT RUN**. Prioritize E2-06 and
E3-02–E3-06 against the real stack, dropping the POST response after backend commit
and confirming that retry/reload leaves one stock transaction. Also confirm
matching ISSUE retry/abort and settlement through the existing recovery panel.

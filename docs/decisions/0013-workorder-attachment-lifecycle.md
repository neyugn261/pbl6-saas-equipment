# ADR 0013 — Work Order attachment lifecycle and persistence

- Date: 2026-11-01.
- Status: **Accepted — Khương xác nhận review đã chốt trong phiên làm việc 01/11/2026.**
- Scope: M3-A1/Q1. Persistence is prepared here; HTTP/storage/worker implementation belongs to A2–A4.
- Contracts: [K8](../api/workorder-attachments.md), [OpenAPI](../api/workorder-attachments.yaml).
- Review: Nguyên (schema/auth/storage), Hatsady (web), Huy (SR projection); Nguyên also consumes the mobile contract.

## Context

Existing `work_order_attachments` and `report_attachments` contain keys and basic
metadata, including INTERNAL/CUSTOMER visibility from migration 0002. They do
not represent upload reservations, verified bytes, request identity, deletion
tombstones or recoverable storage cleanup. A signed PUT alone cannot prove an
attachment is valid, and storage cannot participate in a PostgreSQL transaction.

## Decisions

### 1. Ownership, authorization and scope

Work Order owns intents, attachment metadata, idempotency and cleanup in its own
database. Reuse existing roles/permissions and WO assignment read scope. CUSTOMER
uses SR composition and a narrowly scoped WO internal projection, with the
original token/correlation ID; staff WO/report APIs remain TENANT_STAFF only.

Each request verifies the current access token/catalog and local parent scope.
New finalization additionally checks mutation permission, uploader, assignment
and parent state under the WO lock. Account/role revocation follows ADR 0004's
existing token lifetime (up to 15 minutes); this decision adds no online session
check or machine identity. Consumer/scheduler code never calls another service.

### 2. Storage, limits and verification

- JPEG/PNG/PDF; **1 byte through 10 MiB inclusive**, SHA-256 lowercase hex.
- Ten slots per parent: live attachments plus unexpired INITIATED intents.
  WO and report have separate budgets. Unverified legacy live rows still occupy
  slots. An ATTACHED intent does not consume a second slot.
- PUT to a random staging key, URL TTL 300 seconds from intent creation;
  signed GET TTL 60 seconds. Never persist signed URLs or include them in logs.
- Verify actual bytes, bounded read length, type signature and hash. A claimed
  Content-Type or HEAD response alone is insufficient. Do not re-GET staging
  after verifying it and copy potentially changed bytes: write exactly the
  verified buffer/stream snapshot, or copy a pinned verified object version.
- Each finalize attempt uses its own final key, never signed for PUT. Objects
  are private; filename is metadata, not an object key.

### 3. Persistence and legacy rows

Migration `0005_attachment_lifecycle` is additive. Preserve migrations 0001–0004.

| Table | Decision |
| --- | --- |
| Existing two attachment tables | Add size/hash/verifiedAt, deletion actor/time and last visibility change actor/time. Keep rows and original visibility. |
| `attachment_upload_intents` | Immutable uploader/target/file metadata/staging key/expiry; INITIATED, ATTACHED, EXPIRED or ABORTED. Fenced attempt ID, final key and lease; typed result references and attachedAt. |
| `attachment_idempotency` | Unique tenant + user + operation + UUID key, fingerprint, upload reference. PREPARE is one operation across both target kinds; FINALIZE is another. No raw response or URL. |
| `attachment_cleanup_jobs` | One row per object key; staging/final kind, owning intent/attempt, notBefore, PENDING/CLAIMED/DONE, retry count, claim token/lease, safe error code. |

Every intent has a WO. REPORT also has a composite FK proving the report belongs
to that exact tenant and WO. Typed result FKs prove the attachment belongs to the
intent's parent. Idempotency references the same tenant **and uploader**. Cleanup
references the same tenant/intent. All actor IDs are logical Identity references.
Checks enforce target/status/result/lease shapes; quotas, immutable fields and
cross-row status transitions are service rules under locks, not claims about SQL
CHECK capability. A2 must reject serving rows without verified metadata.

Legacy size/hash/verifiedAt remain NULL together; never fabricate values. Before
deployment, inventory the two tables without logging keys. If nonempty, perform
an owner-led, bounded object verification/backfill before serving those rows.
Missing/invalid objects remain unservable and need an explicit reconciliation
decision. Migration itself does not contact storage or change old visibility.

Audit attach/visibility/delete in the existing internal `work_logs` within the
same transaction, using ATTACHMENT_ATTACHED / ATTACHMENT_VISIBILITY /
ATTACHMENT_DELETED. A compact allowlisted JSON note contains attachmentId,
targetType and old/new visibility only; no URL, key, filename or file content.
Report actions may append this audit after completion; they do not edit the
report, call public add-log or emit WorkOrderCompleted again. Last-change columns
do not replace the history. No extra audit service/table is introduced.

### 4. Request identity and replay

Normalize UUIDs to lowercase, apply visibility's INTERNAL default, and validate
filename without silently renaming it. Fingerprint SHA-256 of UTF-8 JSON with
fixed property order:

```text
PREPARE: ["v1", targetType, workOrderId, serviceReportId|null,
          fileName, mimeType, sizeBytes, checksumSha256, visibility]
FINALIZE: ["v1", uploadId]
```

Authorize the requested target's current staff read scope before inspecting a
matching key; apply mutation checks only to new/in-progress work as below. Then compare
the stored fingerprint before quota/new-transition checks; a mismatch returns
409 IDEMPOTENCY_KEY_REUSED. Do not scope PREPARE keys by parent, or reuse on a
different parent would escape detection. Concurrent key insertion across two
parents is resolved by the unique index: roll back, reread and compare; never
commit another reservation or return a raw unique-constraint error.

| Request/current state | Result after authorization and key comparison |
| --- | --- |
| Prepare replay, INITIATED/unexpired | Require current mutation scope; 201, same uploadId/headers/expiresAt and signing expiry; no new slot/TTL. Re-sign only remaining lifetime. |
| Prepare replay, ATTACHED/live result | 409 UPLOAD_ALREADY_ATTACHED, details.attachmentId; client reads attachment list. |
| Prepare replay, EXPIRED or expiry elapsed | 409 UPLOAD_EXPIRED; use a new key for a new intention. |
| Prepare replay, ABORTED | 409 UPLOAD_ABORTED. |
| Prepare/finalize replay, result deleted | 404 ATTACHMENT_NOT_FOUND; never restore. |
| Finalize, INITIATED | Require current mutation scope, same uploader and valid state/expiry; use the fenced algorithm below. |
| Finalize, ATTACHED/live result | 200 current metadata for the same attachment ID, under current staff **read** scope and same uploader. Mutation state is not reapplied to already committed work. |
| Finalize, EXPIRED/ABORTED | 409 UPLOAD_EXPIRED / UPLOAD_ABORTED. |
| Another unexpired finalize lease | 409 UPLOAD_IN_PROGRESS; retry same key after bounded wait. |

Finalize replay works with the original key or a new FINALIZE key for the same
upload; persist the latter's binding too. Refresh/logout never transfers key
ownership to another user. New finalizations recheck mutation state; replays
still require current read permission and assignment scope, so a former uploader
whose read access was removed cannot recover metadata through an old key.
Original prepare metadata remains immutable even if visibility later changes;
finalize replay serializes the current live row rather than a stale response.

### 5. Locking and finalization

Keep existing lock order: source SR/Maintenance lock → WO row → intent →
idempotency/cleanup rows. Both target budgets serialize on their owning WO row;
count each target separately. Storage I/O is outside DB transactions.

1. **Short transaction:** authorize and lock, bind idempotency, expire stale
   reservations as needed, check quota/state and acquire a fresh attempt UUID
   with a 120-second lease and new final key. Register its cleanup row **before**
   storage writes. Prepare already registered staging cleanup in its transaction.
2. **Outside transaction:** bounded storage calls (30-second timeout per call),
   verify and write the exact verified bytes. Do not silently extend intent TTL.
3. **Short transaction:** reacquire locks, require INITIATED, not expired,
   same unexpired attempt ID and current mutation scope. Create verified
   attachment, audit and ATTACHED/result/attachedAt atomically; clear attempt
   fields, mark the final cleanup record DONE (retained live object). Staging
   cleanup remains durable. Crossing intent expiry before commit fails.
4. On verification/storage failure, release only the matching attempt under
   lock, retain cleanup record, and return the contract error. A stale owner
   never clears another attempt. Crash leaves durable keys/leases for recovery.

An expired lease is recoverable with a **new** attempt/key. Its old final key
can never become a later attempt's key. Only the current fenced attempt may
commit; an uploaded final object is not itself evidence of attachment success.

### 6. Abort, expiry, delete and cleanup recovery

Abort/expiry releases reservation under the parent lock, fences any active
attempt, and preserves cleanup work. Repeated abort is 204 under current read
scope plus manager/original-uploader identity; a first abort requires the
target's current mutation scope. ATTACHED abort is 409 UPLOAD_ALREADY_ATTACHED.
Repeated attachment delete is 204 for an authorized manager/original uploader
with current read scope; first delete still requires K8's mutation state.

Delete atomically writes tombstone/audit and queues final cleanup. No metadata
is served after deletion; already issued links may work for up to 60 seconds.

Workers claim jobs durably with UUID tokens, 120-second leases and SKIP LOCKED;
an expired claim is reclaimable. Updates/acknowledgment require the same claim
token. The short claim transaction commits before acquiring any parent locks;
the subsequent safety check reacquires locks in normal source/WO/intent/job
order and checks the claim token again. Retry starts at 5 seconds, doubles to a 1-hour cap and continues with
safe error code/count recorded. Persistent failures require operator attention;
do not silently discard jobs. Object-not-found is successful deletion.

Before deleting a final key, under normal parent/intent lock order prove it is
not referenced by **any** live attachment and is not owned by an unexpired
attempt. A live reference always wins: mark job DONE without deleting. Fence
an expired attempt before deletion, so a paused finalizer cannot commit it.
No DB transaction spans the subsequent object DELETE. No new attempt reuses
that key. A deletion of a previously retained attachment requeues its DONE job.

STAGING cleanup notBefore = intent expiry + 60 seconds, even after early abort
or finalize. Abandoned FINAL cleanup notBefore = attempt lease expiry + 60
seconds. Valid final files are retained. A periodic 10-minute reconciliation
of the managed staging/final prefixes requeues unreferenced objects older than
10 minutes (including jobs previously DONE): a PUT accepted before expiry may
finish after an earlier deletion. Reconciliation applies the same live-reference
and attempt checks; age alone never authorizes deleting a final object.
Only keys with durable intent/job ownership are automatically reconciled;
unknown objects are reported for owner investigation, not assigned a fabricated
intent or deleted merely because their name resembles a managed key.

Intent, idempotency and tombstone records are retained without automatic purge
for MVP M3. DONE cleanup records are retained for reconciliation. This is not
indefinite retention of orphan file bytes. A later purge policy needs a new
review; no cleanup/purge runtime is implemented in A1.

### 7. Integration boundaries

SR authorizes its own resource then calls WO internal projection. No matching
in-scope WO is source 404; SR may map that **list** result to an empty page.
Missing/hidden/wrong-SR download remains 404. WO unavailable stays unavailable,
never an empty page. Maintenance-only attachments never enter SR composition.

WO completion precedes report upload/publication. Completion notification means
the report result exists, not that files are ready. Clients refresh the SR file
section; no new publication event is introduced by A1.

## Rollout and review gates

- Khương authorized these design choices and confirmed review completion on
  2026-11-01. This records the user confirmation; no PR approval link is invented.
- Shared ADR/ERD and schema changes follow CONTRIBUTING; dependency/env changes
  get a separate coordinated PR. Do not apply 0005 to the business DB until
  shared/schema review and the legacy inventory/backfill decision are recorded.
- Test migration/deploy twice, schema drift and important SQL constraints on
  dedicated workorder_test_db. A1 tests are persistence tests, not upload E2E.
- A2–A4 implement handlers/storage/workers/projection and the full K8 acceptance
  matrix, including races, outages, late PUTs and restart recovery.
- Reporting Q5 is specified in workorder.yaml and the A1 handoff; its read-only
  aggregate API remains A5, with no new schema or permission.

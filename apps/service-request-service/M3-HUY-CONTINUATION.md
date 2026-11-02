# M3 Huy — tiếp tục triển khai và kiểm thử, 01/11/2026

## A. Git và file thay đổi

Branch `feature/huyM3`, HEAD `a437724` được giữ nguyên. Đầu lượt có 12 tracked files
modified và 3 mục untracked (report cũ, thư mục attachments, HTTP E2E). Mọi thay đổi
có sẵn được giữ lại. Không commit/push/PR, reset/clean/stash, checkout/merge/rebase.

Cuối lượt: 15 tracked files modified và 8 mục untracked theo `git status --short`
(gồm cả thư mục chứa nhiều file). `git diff --check` PASS; Git chỉ cảnh báo chuẩn hóa
CRLF/LF cho README Notification, không có whitespace error.

File triển khai/test thay đổi trong lượt này:

- SR `src/attachments/workorder-attachments.client.ts`: chặn ticket đã hết hạn,
  ánh xạ lỗi đọc body thành unavailable an toàn.
- SR `src/attachments/workorder-attachments.client.spec.ts`,
  `test/attachments.e2e-spec.ts`: happy-path ticket dùng thời hạn tương lai theo
  thời gian chạy thay vì ngày cố định đã hết hạn; giữ nguyên assertions.
- SR mới `src/attachments/workorder-attachments.hardening.spec.ts`,
  `src/attachments/workorder-attachments.transport.spec.ts`,
  `test/db/attachments.e2e-spec.ts`.
- Notification `package.json`: chỉ thêm script DB E2E, generate trước typecheck;
  không sửa dependency. `test/jest-e2e.json`: tách DB tests khỏi bootstrap E2E.
- Notification mới `test/db/jest-e2e.json`, `test/db/support/test-env.ts`,
  `global-setup.ts`, `test-env.spec.ts`, `test/db/inbox.e2e-spec.ts`,
  `test/contracts/events.spec.ts`.
- Tài liệu: report này, liên kết cập nhật trong hai README và report lượt trước;
  [Notification readiness](../notification-service/M3-INDEPENDENT-READINESS.md).

Không sửa source ngoài hai service, lockfile, shared packages, ADR/ERD, migration,
root configuration hoặc public path/response schema. Các diff API/config từ lượt
trước vẫn được giữ nguyên, không phải thay đổi mới của lượt này.

## B. Công việc thực hiện

### C4 DB authorization và hardening

19 DB E2E mới dùng **PostgreSQL thật** tại service_request_test_db; chỉ fetch Work Order
được mock. AppModule, guards, request service, Prisma query, attachment client và filter
đều chạy thật. Kiểm tra list/download cho 11 trạng thái SR đang dùng read scope hiện hành,
đúng CUSTOMER, khác customer cùng tenant, khác tenant, request thiếu, staff hợp lệ và thiếu
permission, SR đổi customer qua fixture và token được refresh sang membership khác/null.
404 của missing/out-of-scope có cùng body và không gọi upstream. Kiểm tra token/correlation,
no-store và không lộ storageKey/bucket/internalNotes. Không thêm status gate hoặc API transfer.

Membership test dùng **claim mới**; không tuyên bố thu hồi JWT cũ ngay lập tức. Giữ semantics
ADR 0004, không thêm online Identity lookup. File/count/visibility của WO chưa được chứng minh
bằng các fixture này.

Thêm 30 negative/contract unit cases: malformed JSON, UUID/MIME/type/date/page metadata,
URL sai/credentials/scheme, URL MinIO HTTP và HTTPS hợp lệ, expiry, body-read failure,
401/403/404/409/500/503, thiếu correlation context, redaction và số lần gọi outbound.
Thêm 3 loopback HTTP tests thật: connection refused, timeout 5 giây trước headers,
timeout 5 giây trong body. Không có retry vô hạn hoặc fallback empty.

### C2/C3 preparation

Tạo riêng notification_test_db (đã được khai báo tên trong script hạ tầng hiện có nhưng
chưa tồn tại ở đầu lượt). URL test chỉ đưa vào child process; không ghi secret/config mới.
Harness dùng requireTestDatabaseUrl, kiểm tra current_database trước migrate và trước tests,
chỉ migrate 0001_init hiện hành. Cleanup theo UUID tenant/user/consumer của suite, không truncate.
Sai/missing URL bị từ chối; không fallback sang notification_db.

7 DB tests kiểm tra shared processOnce thật với Prisma/PostgreSQL: commit/dedup, rollback cả
inbox và notification, retry sau rollback, duplicate đồng thời, consumer riêng, uniqueness
(event,user,channel), CHECK read_at và tách read state khỏi delivery state. Migration deploy
được chạy lại nhiều lần; các lần sau không có pending migration.

11 contract readiness tests dùng parser/catalog hiện hành, không tạo runtime helper thừa:
7 event definitions đúng version, legacy WO v1 không bị nhận nhầm v2, 3 malformed envelopes.
6 unit cases bảo vệ test URL. Test-only imports dùng shared dist có sẵn; không đưa relative
imports này vào production để né dependency/lockfile review.

C2 runtime vẫn đóng. OpenAPI là draft; customer context chưa được persist và mapping
resourceType/resourceId/eventType vào schema type/payload chưa được duyệt. Shared runtime
dependencies cũng chưa khai báo ở package Notification. Không mở STAFF-only API tạm,
không tạo repository/controller chưa có contract đủ rõ, không thay bằng fake membership.

### C5 readiness

Đọc Identity activation implementation và catalog: raw token tạo tại Identity, lưu hash,
chỉ expose khi bật IDENTITY_EXPOSE_ACTIVATION_TOKEN; chưa có activation delivery event/command.
Q4 vẫn draft. Đã ghi transport interface proposal và test matrix escaping/redaction/link/
expiry/idempotency trong readiness note. **Không triển khai SMTP/consumer/retry hay gửi email**;
chưa có boundary và dependency được duyệt để tạo adapter có ích.

## C. Bug fixes và triage mới

| ID | Severity/class | Root cause và FAIL trước fix | Fix / bằng chứng sau fix | Owner |
|---|---|---|---|---|
| H-M3-09 | P2 CONFIRMED_BUG_OWNED | expiresAt chỉ kiểm tra cú pháp; test ticket quá hạn resolve thay vì reject | So sánh expiry với Date.now; trả 502 UPSTREAM_ERROR, không trả link vô dụng. Unit PASS | Huy |
| H-M3-10 | P2 CONFIRMED_BUG_OWNED | Shared client catch fetch nhưng response.text ngoài catch; test TimeoutError body cho 500, có thể giữ raw cause | Adapter SR bọc lỗi transport cả hai giai đoạn thành sanitized UpstreamUnavailableError/503. Mock và timeout body thật PASS | Huy; Nguyên đánh giá các caller shared khác |
| H-M3-11 | TEST_GAP | C4 chỉ fake DB; Notification chưa có DB harness | +19 SR DB, +30 unit contract, +3 HTTP loopback, +17 Notification unit/contract, +7 DB | Huy |
| H-M3-12 | CROSS_OWNER_DEPENDENCY / CONTRACT_DECISION_REQUIRED | Public C4 proposed; Q3/Q4 chưa Accepted; Notification thiếu declared shared deps | Readiness/proposal, giữ routes Notification đóng; không sửa lockfile | Huy + Nguyên/owners |

Lượt FAIL trước fix: **2 failed / 76 passed** trong 6 suites. Sau sửa: 78/78,
sau thêm transport thật: **81/81**. Không thay assertions để che bug; chỉ sửa happy-path
expiry fixture sang thời gian tương lai. Các lỗi harness trong lúc phát triển (BOM JSON,
đường dẫn Prisma CLI, overload type HTTP handler) đã sửa và kiểm tra lại. CHECK constraint
được assert theo mã Prisma 7 thực tế P2039 và xác nhận không insert row, thay vì chỉ bắt
mọi exception hoặc giả định mã P2004 của phiên bản khác.

## D. Bằng chứng chạy trong lượt này

Các lệnh `pnpm.cmd --filter <service> <script>` chạy từ root. Không dùng PASS lịch sử thay
cho kết quả mới. Docker PostgreSQL 17 đang Up, pg_isready accepting connections; ban đầu
sandbox không có quyền Docker pipe, kiểm tra chỉ đọc ngoài sandbox thành công. Các test DB
sau đó kết nối trực tiếp localhost:5432 từ phiên hiện tại.

| Kiểm tra | Baseline trong prompt | Kết quả mới | Mức bằng chứng |
|---|---|---|---|
| SR `test --runInBand` | 48/48 | **81 tests / 7 suites PASS** | Unit + 3 HTTP transport loopback thật |
| SR `test:e2e` | 28/28 | **28 / 2 PASS** | Bootstrap/HTTP với fake Prisma/fetch |
| SR `test:e2e:db` | 50/50 | **69 / 3 PASS** | PostgreSQL thật + fake upstream; baseline 50 cũng đã chạy lại trước sửa |
| SR `test:e2e:db --testRegex=work-order-ordering.repro.ts` | 1/1 | **1 / 1 PASS** | P0 trên PostgreSQL thật, chạy trước và sau sửa |
| SR `db:check-drift` | No difference | **No difference detected** | service_request_shadow_db, trước/sau |
| SR `lint`, `typecheck`, `build` | PASS | **PASS** | Typecheck đã rerun sau sửa kiểu handler test |
| Notification `test --runInBand` | 5/5 | **22 / 4 PASS** | 5 scaffold + 6 DB guard + 11 catalog contract |
| Notification `test:e2e --runInBand` | 5/5 | **5 / 1 PASS** | Scaffold/negative route checks, không phải business API |
| Notification `test:e2e:db` | Chưa có | **7 / 1 PASS** | Prisma + PostgreSQL + shared inbox; không broker/recipient thật |
| Notification `lint`, `typecheck`, `build` | PASS | **PASS** | Đã chạy thực tế |
| C4 → WO/Gateway/MinIO thật | Chưa xác minh | **NOT RUN** | Read-only source review; loopback không thay tích hợp thật |
| SMTP | Chưa có | **NOT RUN / BLOCKED Q4** | Proposal/test matrix, không gửi mail |
| `git diff --check` | PASS | **PASS** | Giữ nguyên HEAD/branch và thay đổi có sẵn |

Notification DB URL chưa có trong root .env; khi chạy lại cần cung cấp
NOTIFICATION_TEST_DATABASE_URL riêng theo readiness note. Không dùng URL development làm
fallback của harness. Database mới và migration được giữ lại; fixtures do suite tạo đã dọn.

### Compatibility read-only

WO A4 GET paths và metadata/ticket khớp C4; original caller token, service_request:read,
staff thêm work_order:read; source lọc CUSTOMER/verified/deleted trước count/page và recheck
sau signing. Gateway `/api/service-requests` rewrite thành `/service-requests`, forward
bearer/correlation, chặn internal decoded segment trước proxy. Không phát hiện path/schema
mismatch mới. Public C4 vẫn proposed, review source không phải Accepted hoặc real integration.

Shared HTTP timeout 5000ms, không retry; source generic 401/404/409/500 tiếp tục 502,
403 sanitized, 503/network/body-timeout giữ 503, chỉ list 404 WORK_ORDER_NOT_FOUND được empty.
Không tự áp TTL tối đa/allowlist host mới: chỉ từ chối expiry đã qua và URL sai định dạng,
userinfo hoặc scheme không phải HTTP(S). Việc so expiry dựa đồng hồ SR, cần đồng bộ clock
trong deployment; không tự thêm grace period hoặc gia hạn capability.

## E. Trạng thái M3-C1…C6

| Task | Trạng thái | Căn cứ |
|---|---|---|
| C1 | PARTIAL | Recipient matrix proposal có sẵn; Q3 chưa duyệt |
| C2 | PARTIAL preparation / runtime BLOCKED | DB harness/schema/inbox evidence có; API/auth/customer persistence chưa triển khai |
| C3 | PARTIAL preparation / runtime BLOCKED | Catalog và inbox transaction tests PASS; recipient directory/policy/producer còn thiếu |
| C4 | IMPLEMENTED / NOT INTEGRATED, milestone PARTIAL | 19 DB security + client hardening/transport PASS; public contract còn proposed, chưa end-to-end WO/storage |
| C5 | BLOCKED | Interface proposal + planned test matrix; Q4/SMTP chưa triển khai |
| C6 | PARTIAL | Regression DB/P0/drift mới PASS; real cross-service/UI/SMTP còn thiếu |

Không đánh dấu DONE cho task còn contract hoặc integration chưa hoàn tất.

## F–G. Handoff và việc còn lại

- **Nguyên:** chốt Q3 customer context/directory/replay/bootstrap/missing recipient;
  Q4 secret delivery/idempotency/retry; Q6 public/Gateway/storage integration; review
  Notification shared dependencies/lockfile và shared client body-read catch cho các caller khác.
- **Khương:** phối hợp C4 → A4 → storage thật và visibility/count/download cases; chốt
  event audience/semantics. Projection đã tồn tại, không cần viết lại.
- **Minh:** LowStockDetected.v1 có catalog nhưng chưa thấy producer; cần producer và
  threshold/re-alert policy.
- **Hatsady:** xác nhận public SR deep links/UI; chạy customer list/download/error E2E.
- **Huy:** sau approval mới mở Notification API/recipient/activation implementation;
  chạy real integration trên môi trường test được kiểm soát. Không còn blocker Docker/DB/P0
  của lượt trước trong phiên này; không cần sửa lại M2 lifecycle consumer.

## Addendum — verification in current session, 2026-11-02

- Git remains on `feature/huyM3` at `a437724`. Fetch reported
  `origin/develop@4bd53c6`, seven commits ahead of this HEAD. The incoming diff
  has no Service Request or Notification source changes; it contains inventory,
  asset, and planning/decision updates. The worktree was already dirty, so no
  branch synchronization, merge, or history operation was attempted.
- Added the Huy Q3/Q4 review response at
  [M3-HUY-Q3-REVIEW.md](../notification-service/M3-HUY-Q3-REVIEW.md) and linked
  it from the Notification readiness note and recipient matrix. It remains a
  proposal; no migration, runtime consumer, Notification API, or SMTP code was
  added.
- Current local regression: SR unit **81/81 PASS**, SR application E2E
  **28/28 PASS**, Notification unit **22/22 PASS**, Notification application
  E2E **5/5 PASS**. SR and Notification lint, typecheck, and build all PASS.
- Current DB verification is blocked by environment, not a test assertion:
  SR DB E2E and P0 both stop in Prisma setup with P1001 at `localhost:5432`;
  Notification DB E2E stops before migration because
  `NOTIFICATION_TEST_DATABASE_URL` is unset. Both drift commands also stop
  with P1001. Docker Compose cannot connect to the Docker Desktop named pipe;
  no DB migration or test fixture was applied in this session.
- Gateway → SR → WO → MinIO real integration was **NOT RUN**. Docker was
  unavailable and no local integration service ports were listening. Existing
  C4 local and DB test evidence in the earlier continuation remains historical
  evidence; this session did not revalidate PostgreSQL-backed C4 cases.
- C1 has a concrete review proposal; C2/C3 remain blocked on Q3/schema/event
  approval and declared runtime dependencies. C4 is implemented in the current
  working tree but not real-integrated or owner-accepted. C5 remains blocked
  pending Q4 ownership approval. C6 is partial, with local regressions passing
  and DB/cross-service verification unverified.

## Addendum — develop fast-forward and M3 implementation continuation, 2026-11-02

The preceding addendum records the state before the M3 continuation prompt and
is retained as historical evidence. This update supersedes its Git baseline and
Notification implementation status:

- Safely backed up the existing dirty worktree, then fast-forwarded
  `feature/huyM3` from `a437724` to `53a0a6e` (`origin/develop`); no merge commit.
  The branch now matches `origin/develop` (`0 0` ahead/behind). Existing local
  changes remain uncommitted; no commit, push, or PR was created.
- Implemented the Notification C2 authenticated list, unread-count, and
  idempotent mark-read API. Scope derives from the verified principal and
  active local recipient projection; CUSTOMER customer-context mismatch,
  inactive/missing projection, and PLATFORM_STAFF fail closed. Responses use
  an allowlist and do not expose stored payloads.
- Added Prisma schema and additive `0002_recipient_projection_and_pending`
  migration candidate for customer context, recipient snapshots, distinct
  bootstrap receipts, durable pending events and per-recipient deliveries,
  and conflicts. `prisma validate` passes. The migration has **not** been
  applied, SQL drift has not been checked against PostgreSQL, and owner review
  is still required.
- Updated the C1 matrix and Q3 review to show design-level approval while
  retaining the integration gates. Shared recipient event definitions and the
  Identity producer/bootstrap are still unmerged; no new event binding,
  snapshot consumer, or C3 fan-out was enabled. Q4 activation delivery remains
  owned by Identity; no SMTP or token delivery code was added.
- Added real-DB C2 tests for tenant/customer-context list/count isolation,
  read idempotency, and existing event/user/channel uniqueness. The suite
  compiles but **was not run**: `NOTIFICATION_TEST_DATABASE_URL` is unset.
  The test harness refuses to run without an explicit URL for
  `notification_test_db`; no database was migrated or modified.
- Notification verification: unit tests **33/33 PASS**; HTTP E2E **6/6 PASS**;
  lint, build, typecheck, and `prisma validate` PASS. Service Request
  regression after the fast-forward: unit **81/81 PASS**, app E2E **28/28
  PASS**, lint and typecheck PASS. An initial parallel Service Request E2E
  attempt hit a generated-Prisma file race while another Prisma generation was
  running; rerunning E2E serially passed.
- `pnpm-lock.yaml` remains unchanged as directed; direct workspace dependencies
  are in Notification's package manifest, but the local offline install used
  `--lockfile=false`. Lockfile/frozen-install verification is still required
  before CI or merge.
- The Gateway → Service Request → Work Order → MinIO integration and
  PostgreSQL-backed C4/Notification tests remain unverified in this session.

## Addendum — isolated DB, RabbitMQ, and regression verification, 2026-11-02

This addendum supersedes the earlier "not applied/not run" Notification and
Service Request database status above. The earlier entries are retained as
historical evidence.

- Kept branch/worktree changes uncommitted; no reset, clean, commit, push, or
  branch change was performed. Notification `0002` had already been applied
  only to `notification_test_db`. Drift identified a redundant single-column
  bootstrap FK, so added `0003_remove_duplicate_bootstrap_fk` rather than
  changing the applied migration. Applied `0003` only to that test DB;
  migration drift now reports no difference. Migration from a blank database
  was not separately exercised.
- Notification: typecheck, lint, build, 39/39 unit/contract tests, and 6/6 app
  E2E tests pass. PostgreSQL + real RabbitMQ DB E2E passes 16/16 across 5
  suites, including durable pending state and duplicate broker redelivery.
  Audience-specific assertions verify customer Work Order Created/Completed
  notifications link to the Service Request while staff receive Work Order
  references. Work Order cancellation notices are staff-only; Service Request
  status events remain the customer-facing cancellation source.
- Service Request: 81/81 unit tests, 28/28 app E2E tests, and 69/69 PostgreSQL
  DB E2E tests pass. The DB suite includes the P0 work-order ordering
  regression. Typecheck, lint, and schema drift pass.
- The Notification snapshot/bootstrap core remains unbound because those
  event definitions and the Identity producer are not in the shared catalog.
  The existing business consumer binds only catalogued versions. LowStock
  producer-to-consumer, live Gateway → SR → WO → MinIO, and Identity/Mailpit
  activation flows were not run.
- `pnpm-lock.yaml` remains unchanged as required by the task ownership rules.
  Notification's manifest has direct dependencies not represented in the
  shared lockfile; frozen-install compatibility therefore remains an owner
  follow-up. No package lock changes were retained.

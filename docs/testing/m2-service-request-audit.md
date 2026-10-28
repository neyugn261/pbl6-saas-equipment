# M2 Service Request — audit, hardening và bàn giao

> **Cập nhật 2026-10-28:** Các mục 1–7 là snapshot audit ngày 26/10, giữ lại
> để truy vết và không đại diện cho checkout hiện tại. Xem [mục 8](#8-follow-up-2026-10-28)
> và [tài liệu quyết định lifecycle](m2-work-order-lifecycle-decision.md) cho
> trạng thái review mới nhất. F09 vẫn FAIL; chưa nghiệm thu P0.

Ngày: 2026-10-26, Asia/Saigon. Phạm vi: Member C / Huy, M2-H1–H7 theo
file yêu cầu `writing-block.md`. Đây là báo cáo kết quả thực tế, không phải
phê duyệt ADR/ERD hoặc xác nhận toàn bộ M2 đã nghiệm thu.

## 1. Baseline và nguồn đối chiếu

- Branch: `feature/huyM2`.
- HEAD: `7cc48ba150cd599b6df4afa5c1ff6b6aeb5bb4a3`.
- Workspace đầu lượt đã có thay đổi M2 chưa commit: estimate APIs/service,
  consumer, DTO/module, schema/migration 0004, tests, API và tài liệu. Giữ
  các phần hoạt động; không reset/checkout/merge/rebase/commit/push/tạo PR.
- Local `develop` cũ hơn HEAD. Merge base với remote-tracking
  `origin/develop` là HEAD; ref đó đang ở
  `085e43d6826fa6fe4b3d0c8f2863613b830889c0`. Các commit đã có trên ref này
  gồm Work Order week-one và sửa prefix Web, chưa ở checkout hiện tại.
  Không fetch hoặc tự merge khi workspace còn thay đổi của người dùng.
- Không có thay đổi giữa HEAD và origin/develop trong SR/ADR/state-machine
  được đối chiếu; khác biệt Work Order/Web là dependency của baseline tích hợp.
- Môi trường: Windows PowerShell, Node `v24.15.0`, pnpm `11.26.0`,
  PostgreSQL từ Compose `postgres:17-alpine`, RabbitMQ `4-management`.
- Baseline đã chạy lại trước sửa: **16 unit + 5 app E2E + 19 DB E2E = 40 PASS**.
  Các con số trong file gửi kèm không được dùng thay bằng chứng chạy lại.

Nguồn đã đối chiếu: AGENTS.md, README.md, CONTRIBUTING.md, package scripts,
packages/README.md; API conventions; service-request.yaml, workorder.yaml,
notification.yaml và recipient matrix; state-machines.md, events.md; ADR
0003/0004/0005/0008 và ADR 0007 Accepted (D12); ERD SQL phần Service Request;
Prisma schema/migrations 0001–0004; source/tests/README SR; shared permission
catalog, event catalog/envelope/inbox/outbox/relay/RabbitMQ implementation;
Gateway routing/tests và Work Order source trong checkout.

Không tìm thấy tài liệu phân công M2 riêng trong repository bằng tìm kiếm
M2-H/Huy/milestone/assignment; mapping H1–H7 dưới đây bám file yêu cầu, chưa
phải xác nhận đối chiếu được bảng phân công độc lập của nhóm.

## 2. Phát hiện và xử lý

Paths trong bảng tính từ root, `SR` là `apps/service-request-service`.

| ID | Mức độ | Phân loại | File/hàm | Nguyên nhân/bằng chứng | Cách xử lý | Trạng thái |
| --- | --- | --- | --- | --- | --- | --- |
| F01 | High | BUG_CONFIRMED | SR/src/events/work-order-events.consumer.ts / Created | Created trùng nghiệp vụ, eventId mới, SR PROCESSING: throw thay vì no-op; unit mới từng FAIL | No-op khi đã PROCESSING có active ID; không thêm history/outbox | FIXED, unit + M2-WO-01 PASS |
| F02 | Medium | BUG_CONFIRMED | consumer / Created, Completed | CLOSED/REJECTED chưa được ignore đầy đủ như state machine; unit từng FAIL | Terminal guard chung; inbox vẫn commit | FIXED, unit + M2-SEC-02 PASS |
| F03 | High | BUG_CONFIRMED | consumer / Cancelled | ACCEPTED trước Created: false bị ACK/no-op; true đổi sang CANCELLED trước transition PROCESSING | Chỉ chuyển từ PROCESSING; early event rollback inbox, dùng bounded retry/DLQ | FIXED trong policy hiện hành, M2-WO-03 PASS; durable reorder còn BLOCKED |
| F04 | Medium | BUG_CONFIRMED | consumer / handle | Direct handle chỉ narrow type/version; unknown version có thể resolve; producer/aggregate/origin không được kiểm tra ở boundary này | Dùng parseEnvelope theo catalog; validate producer, aggregate type/id, tenant, XOR origin | FIXED, unit + M2-SEC-03 PASS; broker đã validate structural payload từ trước |
| F05 | High | BUG_CONFIRMED | SR/src/service-requests/service-requests.service.ts / rejectEstimate, reviseEstimate | Expiration kiểm tra ở preflight transaction; qua nửa đêm lúc chờ khóa vẫn reject/revise estimate đã hết hạn | Check sau lock, commit EXPIRED rồi mới throw 409; dùng cùng helper cho approve | FIXED, M2-CE-04 PASS, có clock advance sau lock |
| F06 | Medium | BUG_CONFIRMED | service / detail, review, warrantyCheck | warrantyEndDate trả timestamp trong khi OpenAPI quy định date | Serialize YYYY-MM-DD nhất quán | FIXED, M2-API-01 PASS |
| F07 | Medium | BUG_CONFIRMED | consumer / reference comparisons | UUID hợp lệ viết hoa không bằng chuỗi DB lowercase | So sánh UUID không phụ thuộc case | FIXED, M2-WO-06 PASS |
| F08 | Medium | BUG_CONFIRMED | service / lockEstimate | CUSTOMER_ADMIN gọi approve/reject ID DRAFT có thể nhận details.from=DRAFT qua 409 | Filter DRAFT tại lookup trước/sau khóa; trả 404 không tiết lộ trạng thái | FIXED, M2-SEC-01 PASS |
| F09 | High | BUG_CONFIRMED + DECISION_REQUIRED | consumer / Created sau WO kết thúc | Clear active ID làm mất identity WO đã kết thúc. Replay Created cũ với eventId mới đưa ACCEPTED về PROCESSING | Giữ repro desired behavior, đề xuất durable lifecycle ledger; không tự thay schema/ADR | **BLOCKED, M2-WO-D01 FAIL 1/1** |
| F10 | High | DECISION_REQUIRED | consumer + shared RabbitMQ transport | Retry không bảo đảm Created đến trước completion/cancel; active ID không phải lifecycle history | Proposal ở mục 6, bounded retry/DLQ giữ nguyên | BLOCKED nghiệm thu H4 |
| F11 | High | DECISION_REQUIRED | SR/prisma/migrations/0004_active_work_order_tracking | Không thấy ADR/ERD approval cho active_work_order_id; read-only query thấy đã áp sẵn ngoài DB test | Không apply/rollback/edit migration cũ; ghi deployment gate và reconciliation | BLOCKED approval |
| F12 | Medium | CONTRACT_CONFLICT + DECISION_REQUIRED | state-machines.md vs SR API draft | Estimate có thể tạo từ EXPIRED theo đoạn mô tả, nhưng SR không có recovery transition khỏi AWAITING_CUSTOMER_APPROVAL | Giữ hành vi API hiện có, không tự về REVIEWING; đề xuất decision | BLOCKED recovery |
| F13 | High | EXTERNAL_DEPENDENCY | apps/api-gateway/src/proxy/proxy.middleware.ts | /api/service-requests/estimates/... bị rewrite thành /service-requests/estimates/...; SR action thật ở /estimates/... | Ghi reproduction, yêu cầu Gateway owner chọn route/test | BLOCKED full-stack estimate |
| F14 | High | EXTERNAL_DEPENDENCY | apps/workorder-service/src/app.module.ts | Checkout hiện tại vẫn skeleton; origin/develop đã có week-one nhưng chưa đồng bộ tại feature branch | Owner/baseline review trước khi tích hợp producer; không sửa service khác | BLOCKED real producer |
| F15 | Medium | TEST_GAP | SR/test/db/requests.e2e-spec.ts | Chưa chứng minh mixed races, DB constraints, rollback, metadata scope | Thêm 23 DB cases cùng assertions persistence | FIXED các case liệt kê; full-stack còn thiếu |
| F16 | Low | BUG_CONFIRMED | docs/api/notification.yaml; docs/testing/m2-service-request.md | Notification dùng port Inventory; handoff lặp service-requests prefix và ngầm có estimate Gateway route | Sửa port 3005, tách direct API/Gateway, thêm owner/data source và quyết định M3 | FIXED tài liệu draft |
| F17 | Low | BUG_CONFIRMED | SR/package.json tại đầu lượt | Có hai key typecheck giống nhau | Bỏ key lặp, trả file về nội dung HEAD | FIXED, không còn net diff |

Không thêm status, transition recovery, permission, event version, queue của
SR hoặc dependency mới. Không triển khai invoice/payment, Notification,
Inventory hoặc chỉnh code owner khác.

## 3. Tiến độ M2-H1–H7

| Task | Trạng thái | Đã hoàn thiện và bằng chứng | Phần còn thiếu |
| --- | --- | --- | --- |
| H1 — Estimate API/revisions | PARTIAL | Create/list/update/delete/send/revise đủ endpoints hiện có trong contract. M2-CE-01/02/03, DB suite PASS. Contract không yêu cầu GET detail riêng; detail qua list/liveEstimate. | Final contract/ERD review; recovery EXPIRED cần quyết định |
| H2 — Estimate transitions/customer response | PARTIAL | Approve/reject own customer, hidden DRAFT, response metadata; expiration sau lock; history/outbox cùng transaction. M2-CE-01/04, M2-TX-01, M2-SEC-01 PASS. | Không tự mở recovery transition; Gateway route chưa có |
| H3 — Decimal/concurrency/transactions | DONE trong backend SR | Prisma Decimal; NUMERIC(12,2)/(14,2), generated amount, explicit ROUND_HALF_UP, server total, overflow, DB partial unique/revision unique; locks cùng SR → estimate. M2-CE-01/02/03/05, M2-TX-01/02 PASS. | Full-stack acceptance nằm H6; không phải xác nhận toàn bộ M2 DONE |
| H4 — Work Order consumer | BLOCKED nghiệm thu | Sửa F01–F04/F07; same-eventId dedup; concurrency, rollback inbox/history/outbox, stale completion/cancel khi replacement active, terminal guards và legacy null rejection đã test. | F09 repro FAIL; durable reorder/lifecycle policy; migration approval/reconciliation; producer thật |
| H5 — Customer security | PARTIAL | Cross-tenant/customer 404; counts/pagination theo scope; comments/history INTERNAL và nested draft/attachment metadata không leak; CUSTOMER không được internal API; result summary qua SR; confirm/reopen own scope. M2-SEC-01/02/03 PASS. | Real Gateway + real Identity/Asset/producer combined run chưa có |
| H6 — Regression/integration | PARTIAL | 30 unit + 5 app + 42 DB PASS; giữ 40 baseline tests. Shared RabbitMQ transport 23 PASS; Gateway 7 PASS dùng echo upstream. | Opt-in lifecycle repro FAIL 1; full-stack estimate/WO BLOCKED; reconnect/shutdown với in-flight business delivery chưa được fault-injection test |
| H7 — Notification M3 preparation | DONE phần tài liệu draft | List/count/read, auth/scope/page/errors; matrix event/version/recipient/display/data source/dedup/INTERNAL/owner/open decisions; port và routing caveat đã sửa. YAML parse/round-trip PASS. | Chưa phê duyệt recipient directory, machine auth, activation contract, platform scope/public mapping; implementation M3 ngoài phạm vi |

## 4. Thay đổi và bảo toàn workspace

File được sửa/thêm trong lượt audit này:

1. `apps/service-request-service/README.md`
2. `apps/service-request-service/prisma/README.md`
3. `apps/service-request-service/src/events/work-order-events.consumer.ts`
4. `apps/service-request-service/src/events/work-order-events.consumer.spec.ts` (mới)
5. `apps/service-request-service/src/service-requests/service-requests.service.ts`
6. `apps/service-request-service/test/db/requests.e2e-spec.ts`
7. `apps/service-request-service/test/db/support/test-app.ts`
8. `apps/service-request-service/test/db/work-order-ordering.repro.ts` (mới, diagnostic riêng)
9. `docs/api/service-request.yaml`
10. `docs/api/notification.yaml` (file untracked đã có, cập nhật)
11. `docs/api/notification-recipient-matrix.md` (file untracked đã có, cập nhật)
12. `docs/testing/m2-service-request.md` (file untracked đã có, cập nhật)
13. `docs/testing/m2-service-request-audit.md` (mới)

`apps/service-request-service/package.json` được bỏ key lặp và hiện không có
net diff với HEAD. Các thay đổi M2 đã có từ đầu trong schema.prisma,
service-requests/dto.ts, controller, module, service.spec.ts và migration 0004
được giữ lại; không nhận là code mới của lượt audit. Không sửa SQL migration
nào, `packages/**`, root config/CI/lockfile/.env.example hoặc code service khác.

## 5. Verification thực tế

| Lệnh/kiểm tra | Baseline | Kết quả sau sửa | Phạm vi bằng chứng |
| --- | --- | --- | --- |
| pnpm.cmd --filter service-request-service test --runInBand | 16 PASS | 30 PASS | 3 unit suites, có consumer validation/state |
| pnpm.cmd --filter service-request-service test:e2e | 5 PASS | 5 PASS | Auth/health/bootstrap, fake DB |
| pnpm.cmd --filter service-request-service test:e2e:db | 19 PASS | 42 PASS | service_request_test_db; real PostgreSQL, fake Asset, direct consumer fixtures |
| ... test:e2e:db --testRegex=work-order-ordering.repro.ts | NOT RUN | **FAIL 1/1, F09** | Repro riêng, desired ACCEPTED/null, actual PROCESSING/old WO ID; không đếm trong 42 PASS |
| ... lint | Historical PASS | PASS, 0 errors/warnings | SR src/test |
| ... typecheck | Historical PASS | PASS | Gồm diagnostic repro |
| ... build | Historical PASS | PASS | Prisma generate + nest build |
| ... db:check-drift | Historical PASS | PASS: No difference detected | Migrations ↔ Prisma schema qua configured shadow DB; không phải ADR approval |
| pnpm.cmd --filter @pbl6/event-contracts test --runInBand với RABBITMQ_TEST_URL | NOT RUN | 23 PASS | 3 suites, gồm real broker delivery/retry/DLQ; không chỉnh package |
| pnpm.cmd --filter api-gateway test:e2e --runInBand | NOT RUN | 7 PASS | Echo upstream, routing/auth-header/CORS/rate-limit/internal block; không chỉnh Gateway |
| Prettier --debug-check service-request.yaml + notification.yaml | NOT RUN | PASS | Parse/format round-trip, không phải semantic OpenAPI lint |
| git diff --check | — | PASS | Whitespace |
| M1 SR regression | 40 combined baseline | PASS | Toàn bộ test cũ được giữ và chạy trong các suite trên |
| Real CUSTOMER → Identity/Asset → estimate → Gateway → WO producer → RabbitMQ → SR | NOT RUN | BLOCKED | F13/F14; không lấy fixture/echo thay cho producer |

Có các lượt đầu thất bại vì PostgreSQL chưa chạy; đã khởi động chỉ Postgres
và RabbitMQ theo Compose. Hai lượt DB suite từng bị Node dừng với exit code
3221226505, không có Jest assertion output; các lượt sau và final full suite
chạy thành công, chưa xác định được nguyên nhân native exit. Không xem lượt
bị dừng là PASS. Lỗi typecheck của helper injection đã được sửa rồi chạy lại.
DB diagnostic F09 là lỗi nghiệp vụ còn tồn tại, khác với các lỗi môi trường.

### Bằng chứng transaction/data

- M2-TX-01/02 thực thi SQL thật rồi inject lỗi trước commit: request, estimate,
  items, comment, history và outbox đều rollback; không chỉ mock repository.
- M2-WO-02 rollback cả inbox + business/history/outbox; retry cùng eventId
  sau đó commit đúng một lần.
- M2-WO-01 concurrent same-ID/different-ID Created và resolved Completed:
  chỉ một history entry mỗi transition; inbox dedup cho cùng eventId.
- M2-CE-03 truy cập PostgreSQL trực tiếp trên DB test để chứng minh partial
  unique live revision và revision number unique; xóa DRAFT cascade items.
- M2-CE-04 clock đổi ngày sau `lockEstimate`; EXPIRED commit, SR không tự đổi
  status, không có respondedBy; create recovery bị 409 theo API hiện hành.
- M2-SEC-01 thử tenant B/customer B trên detail/history/comments/estimates,
  list total/items, draft response actions, forbidden/no-token/internal API.
  Assertions không có INTERNAL/storageKey/activeWorkOrderId/_count.

Không lưu token/password/secret hoặc login response trong tài liệu này.

## 6. Quyết định còn mở và proposal cho owner review

### Migration 0004 và dữ liệu cũ — Huy + shared ADR/ERD reviewer + WO owner

Read-only `_prisma_migrations` query trên URL SR development được cấu hình và
URL test ghi nhận 0001–0004 finished, không rolled back. Vì vậy không thể mô
tả 0004 là chỉ mới áp ở test. Không thấy approval trong ADR hiện có; cần nhóm
xác nhận nguồn approval hoặc xử lý sai lệch deployment. Lượt audit này không
apply migration development/production, không rollback hay sửa checksum.

Proposal: inventory read-only số SR PROCESSING có active ID null; duyệt
API WO lookup theo SR và tenant (hoặc procedure do owner chủ động export qua
API được phép); đối soát đúng tenant/customer/equipment và duy nhất live WO.
Không có hoặc nhiều WO: giữ exception list để owner xử lý, không đoán ID.
Backfill chỉ sau approval, update có điều kiện status/ID hiện tại và audit
record; không truy vấn trực tiếp workorder_db. Không tự cho consumer legacy
null nhận Completed/Cancelled rồi sửa dữ liệu chưa xác minh. API lookup và
credential cho reconciliation background chưa được chốt theo ADR 0004.

### Expiration recovery — Service Request / state-machine owners

Hiện EXPIRED là estimate terminal, SR giữ AWAITING_CUSTOMER_APPROVAL theo API
draft. Accepted state machine cho phép revision mới từ EXPIRED về mặt estimate
nhưng thiếu transition tương ứng của SR. Hai hướng cần chọn: (A) manager
action tạo revision và đưa SR về REVIEWING; (B) revision replacement ngay khi
SR đang chờ, giữ trạng thái SR, send revision mới theo rule riêng. Cả hai cần
amend Accepted state machine và API, phân quyền, history/outbox và tests
concurrent expired/approve/revise. Không tự triển khai hướng nào trong audit.

### Durable ordering/lifecycle — SR + WO + event-contract owner

Repro F09: Created(A,e1) → Cancelled(A,false,e2) → Created(A,e3), e3 khác e1.
Expected ACCEPTED/null; actual PROCESSING/A. Inbox eventId không đủ dedup
nghiệp vụ sau khi active ID bị clear. `workOrderNo` không đủ identity.

Các giới hạn khác: Completed UNRESOLVED hoặc Cancelled false phát lại với
eventId mới sau khi SR về ACCEPTED không thể phân biệt duplicate với event
đến sớm; hiện retry/DLQ thay vì giả định thành công. Created của WO kế tiếp
đến khi WO trước vẫn active có thể bị coi là stale và ignore; vì vậy không
khẳng định out-of-order đầy đủ hoặc không mất causal update. Các event
completion/cancellation thuộc một WO khác current active chỉ được bảo vệ
trạng thái hiện hành; chưa có ledger để phân loại mọi lifecycle.

Proposal ưu tiên: SR-owned lifecycle ledger keyed `(tenantId, workOrderId)`
với request/equipment/customer identity, lifecycle/source metadata và trạng
thái đã áp; pending terminal deliveries được giữ bền vững và replay sau
Created. Thực hiện ledger/inbox/business/history/outbox trong transaction,
khóa request để serialize. Cần ADR/ERD/migration mới, retention/replay và
source-order/conflicting-event policy; không sửa migration đã applied.
Source sequence/version do producer cung cấp giúp phân loại stale đáng tin
cậy hơn timestamp; nếu thêm phải review event contract/version. Không tự
thêm event version hoặc pending infrastructure.

Hướng tối thiểu tạm thời: bounded retry + DLQ/operator replay giữ eventId và
evidence sau reconciliation; không bảo đảm automatic recovery, không đánh
dấu H4 DONE. Test matrix review cần thêm: every permutation Created/terminal,
replacement Created sớm, duplicate khác eventId sau terminal/unresolved,
hai WO liên tiếp, concurrent conflicting events, crash/reconnect và pending
replay idempotency. Diagnostic đã để riêng để không che lỗi bằng expected sai.

### Gateway, Work Order và Notification — external owners

- Gateway: chọn prefix action estimate rồi bổ sung proxy/rewrite và test.
  Repro và direct-service workaround ở [manual guide](m2-service-request.md).
  Không thêm alias vòng vèo vào SR để bù route của owner khác.
- Baseline/WO: origin/develop đã có week-one; owner đồng bộ vào feature branch
  sau khi bảo toàn thay đổi M2 và kiểm tra producer Completed.v2/Cancelled.v2.
  Chạy lại real full flow sau đó; không giả định implementation mới đã sẵn sàng.
- Notification: draft matrix đã ghi nguồn recipient/owner. Identity directory
  cho background consumer/machine auth, customer-wide membership read model,
  activation delivery contract D8, platform scope, public path, status-specific
  dedup và LowStock threshold còn cần chốt. Không dùng raw reason/internal notes
  cho CUSTOMER; link CUSTOMER chỉ tới SR, không toàn bộ WO/report.

## 7. Hướng dẫn kiểm thử thủ công và nghiệm thu

Xem [m2-service-request.md](m2-service-request.md) cho PowerShell login/token
variables, direct SR estimate approve/reject/revise, expiration, Gateway
reproduction và WO/broker assertions. Các bước chưa chạy thật được ghi rõ
BLOCKED/NOT RUN; không có request/response full-stack giả làm bằng chứng.

Code hardening thuộc ownership đã được thực hiện và kiểm thử. **Chưa nghiệm
thu toàn bộ M2**: F09 còn tái hiện FAIL; F10–F14 cần quyết định/dependency.
H3 và H7 chỉ DONE theo phạm vi backend/tài liệu ghi rõ trong bảng, không thay
cho approval thiết kế hoặc kiểm thử tích hợp thật. Không commit/push/PR/merge.

## 8. Follow-up 2026-10-28

`feature/huyM2` đã fast-forward tới `origin/develop` tại HEAD `76c179b`.
Thay đổi P0 trước đó được khôi phục bằng `git stash apply` và vẫn là thay đổi
chưa commit: Service Request consumer, unit test và README. Tài liệu quyết
định lifecycle là file mới; audit này cũng đang sửa. Không sửa code hoặc
diagnostic trong lượt cập nhật tài liệu.

| Kiểm tra | Bằng chứng sau fast-forward | Diễn giải |
| --- | --- | --- |
| Service Request unit | 31/31 PASS | Gồm test retry Created(B) khi A còn active. |
| Application E2E | 5/5 PASS | Không chứng minh producer/broker thật. |
| DB E2E | 42/42 PASS trên `service_request_test_db` | PostgreSQL hoạt động, migration 0001–0004 đã áp dụng trên test DB. Không gồm diagnostic riêng. |
| `work-order-ordering.repro.ts` | **1/1 FAIL** | Expected `ACCEPTED/null`, actual `PROCESSING/A` sau Created(A,e1) → Cancelled(A,false,e2) → Created(A,e3). F09 còn tái hiện. |
| Work Order/Gateway source | Có trên checkout hiện tại | Producer phát Created.v1/Completed.v2/Cancelled.v2; Gateway có `EstimateProxyMiddleware`. Chưa xác minh full-stack real broker trong follow-up này. |

Các kết quả trên là bằng chứng người thực hiện cung cấp sau fast-forward;
follow-up chỉ đối chiếu code/tài liệu, không chạy lại suite hay truy vấn DB.
Lần thử `docker compose ps` trong phiên tài liệu này bị từ chối quyền Docker
API, nên không coi đó là bằng chứng PostgreSQL ngừng chạy. Bảng kiểm thử ở
mục 5 là kết quả lịch sử ngày 26/10, không ghi đè kết quả mới.

F13 (Gateway thiếu mapping) và F14 (Work Order scaffold) trong bảng mục 2 là
phát hiện **lịch sử của checkout cũ**, đã hết đúng sau fast-forward. Không còn
coi chúng là dependency implementation chưa tồn tại; luồng CUSTOMER → Gateway
→ WO producer → RabbitMQ → SR vẫn **NOT VERIFIED** bằng integration run thật.
F09/F10 vẫn **BLOCKED** chờ quyết định ledger, reordering và retention;
F11 chờ xác nhận approval 0004/ERD và reconciliation dữ liệu cũ; F12 chờ
Accepted state-machine/OpenAPI decision cho EXPIRED recovery. Chi tiết lựa
chọn, owner và cổng nghiệm thu ở
[tài liệu quyết định](m2-work-order-lifecycle-decision.md).

# M2-H4 implementation update (2026-10-28)

Service Request now has a proposed migration `0005_work_order_lifecycle` and
durable Created/terminal receipts, pending reconciliation, semantic duplicate
checks and private conflict evidence. Migration review by the ADR/ERD owner is
still required before development or production deployment. The diagnostic
assertion in `work-order-ordering.repro.ts` remains unchanged. The former
"P0 BLOCKED" statements above describe the pre-implementation baseline.
At this checkout, the local Docker daemon is unavailable, so P0 and DB E2E
remain **NOT VERIFIED after implementation**. Unit 31/31, application E2E
5/5, lint, typecheck and build passed. Legacy `PROCESSING` rows lacking an
active Work Order ID still require verified owner-led reconciliation.

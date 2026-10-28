# M2 — quyết định lifecycle Work Order cho Service Request

Ngày rà soát: 2026-10-28. Trạng thái: **DECISION_REQUIRED** (F09/F10/F11/F12);
P0 **BLOCKED**, chưa sửa và chưa nghiệm thu. Tài liệu này chuẩn bị review giữa Huy
(Service Request), Khương (Work Order) và Nguyên (ADR/ERD, event contracts).
Các cấu trúc database và chính sách bên dưới chỉ là đề xuất, chưa phải migration hay
quyết định Accepted.

## 1. Baseline và bằng chứng

- Checkout: `feature/huyM2`, HEAD `76c179b` sau fast-forward lên
  `origin/develop`. Các sửa đổi P0 trước đó đã trở lại working tree bằng
  `git stash apply`; không ghi đè chúng trong lượt rà soát tài liệu này.
- Bằng chứng kiểm thử được người thực hiện cung cấp sau fast-forward: Service
  Request unit **31/31 PASS**, application E2E **5/5 PASS**, DB E2E
  **42/42 PASS** trên `service_request_test_db`; PostgreSQL hoạt động và migration
  0001–0004 đã áp dụng trên test DB. Các suite này không chứng minh F09 đã sửa.
- Diagnostic riêng `test/db/work-order-ordering.repro.ts`: **1/1 FAIL**.
  `Created(A,e1) → Cancelled(A,false,e2) → Created(A,e3)` (`e3 != e1`):
  expected `ACCEPTED` / `activeWorkOrderId=null`, actual `PROCESSING` /
  `activeWorkOrderId=A`. Giữ nguyên assertion và tách diagnostic khỏi 42 test.
- Code hiện tại đã có Work Order runtime và `EstimateProxyMiddleware` của
  Gateway (`/api/service-requests/estimates/*` → `/estimates/*`). Chưa có
  bằng chứng chạy luồng CUSTOMER → WO producer → RabbitMQ → SR end-to-end.

Nguồn đối chiếu: [ADR 0003](../decisions/0003-customer-scope.md),
[0004](../decisions/0004-service-auth-and-authorization.md),
[0005](../decisions/0005-event-transport.md),
[0008](../decisions/0008-m1-review-decisions.md),
[state machine Accepted](../architecture/state-machines.md),
[event catalog](../architecture/events.md),
[OpenAPI SR](../api/service-request.yaml),
[OpenAPI WO](../api/workorder.yaml), Prisma schema/migration 0001–0004,
`packages/event-contracts/src/{catalog,inbox,rabbitmq}.ts`, consumer SR và
producer WO hiện tại. ADR 0009/0010 vẫn ghi local proposal/implementation và
không quyết định F09/F10. Xem thêm [audit M2](m2-service-request-audit.md).

## 2. Ràng buộc nghiệp vụ và nguyên nhân

ADR 0008 D4a cho `Cancelled.v2(false)` đưa SR `PROCESSING → ACCEPTED`, còn
`true` đưa tới `CANCELLED`. D6a yêu cầu kết quả Completed.v2 giữ
`customerSummary` an toàn cho khách. State machine cho phép WO B mới từ SR
`ACCEPTED` sau A bị hủy hoặc hoàn thành `UNRESOLVED`; SR terminal không được
sống lại. `active_work_order_id` là logical reference, không có FK xuyên DB.

Producer hiện tạo WO row và `WorkOrderCreated.v1` trong cùng transaction;
`workOrderId` là UUID của row, ổn định qua outbox retry. Completion phát
`WorkOrderCompleted.v2`, cancellation phát `WorkOrderCancelled.v2`, đều cùng
transaction với chuyển trạng thái WO. Một WO mới hợp lệ có UUID mới; producer
chặn WO thứ hai đang non-terminal của cùng SR. Event catalog không chứa
source sequence/version của lifecycle. Retry của một outbox row giữ eventId;
replay/ngữ nghĩa trùng với eventId mới vẫn phải được consumer tự nhận diện.

`processOnce` chỉ unique `(event_id, consumer)`. Sau terminal, consumer xóa
`active_work_order_id` và không lưu identity WO đã kết thúc. Vì vậy e3 đi qua
inbox và nhánh Created thấy SR `ACCEPTED`, rồi kích hoạt lại A. Status hiện tại
không phân biệt A cũ với B mới. Sửa đổi code chưa commit hiện tại đã đổi
`Created(B)` khi A còn active từ ACK/no-op sang throw để retry/DLQ; nó giảm
nguy cơ mất B nhưng không giải quyết F09 hay đảm bảo B tự hồi phục trước khi
hết 5 lần delivery theo ADR 0005.

## 3. Đề xuất ledger do Service Request sở hữu

Sau khi ADR/ERD được duyệt, thêm migration **mới** sau 0004. Không sửa migration
đã áp dụng. Một bản ghi đại diện cho `(tenant_id, work_order_id)` với:

| Nhóm dữ liệu | Đề xuất | Lý do / điều cần chốt |
| --- | --- | --- |
| Identity | `tenant_id`, `work_order_id`, `request_id`, `equipment_id`, `customer_id` | `customer_id` có trong Created/Completed nhưng **không có trong Cancelled.v2**; pending cancellation chưa thể xác thực customer cho tới khi Created tới. Không suy diễn giá trị này là đã xác minh. |
| Lifecycle | `state` = `PENDING_COMPLETED`, `PENDING_CANCELLED`, `ACTIVE`, `COMPLETED`, `CANCELLED` | Phân biệt pending với terminal đã áp dụng; chặn Created của WO terminal sống lại. Tên trạng thái cần review. |
| Nguồn event | Created eventId; terminal eventId, type/version, occurredAt và correlationId | Truy vết replay; eventId không thay thế business identity. |
| Kết quả terminal | Completed: result, reportId, workOrderNo, completedAt, customerSummary; Cancelled: reason, cancelledAt, cancelServiceRequest | Đủ để áp dụng pending event sau Created mà không đọc `workorder_db`; tránh lưu cả envelope JSON không giới hạn hoặc internal notes. |
| Audit | createdAt, updatedAt; tùy chọn appliedAt | Phát hiện pending quá hạn và đối soát. Không công khai ledger qua CUSTOMER API. |

Ràng buộc đề xuất: PK/unique `(tenant_id, work_order_id)`; composite FK
`(tenant_id, request_id)` → `service_requests(tenant_id, id)` với `RESTRICT`;
partial unique `(tenant_id, request_id) WHERE state = 'ACTIVE'` để không có
hai WO active trong SR. Có index `(tenant_id, request_id)` cho đối soát.
CHECK phải khớp bộ cột terminal theo loại/state và chỉ cho `customer_id=NULL`
ở pending cancellation chưa được xác minh. `equipment_id`, `customer_id` và
`work_order_id` là logical references tới service khác: **không có cross-DB
FK**. Khương/Nguyên cần xác nhận partial unique này không làm kẹt replacement
đến sớm hoặc quá trình chuyển pending → active → terminal trong một transaction.

Transaction SR đề xuất: `processOnce` mở transaction và ghi inbox; khóa SR
theo `(tenant_id,id) FOR UPDATE` trước khi đọc/sửa ledger; kiểm tra immutable
identity và trạng thái ledger; ghi ledger, SR, history và outbox trong cùng
transaction. Mọi handler cho cùng SR lấy khóa theo cùng thứ tự, rồi mới upsert
ledger; PK và partial unique là hàng rào cuối cho concurrent Created(A/B).
Nếu có unique conflict/serialization failure, rollback cả inbox rồi retry;
không ACK một event hợp lệ khi chưa có trạng thái bền vững hoặc đường phục hồi
được duyệt. Kiểm tra aggregateId, producer, tenant, origin XOR và tham chiếu
equipment/customer vẫn bắt buộc như consumer hiện tại.

**Retention:** Tombstone terminal phải tồn tại ít nhất lâu bằng khả năng
replay của outbox, DLQ và thao tác operator; hiện ADR 0005 giữ outbox không
cleanup trong MVP, nên xóa ledger theo TTL đơn giản sẽ mở lại F09. Cần chốt
giữ vô thời hạn cho MVP hoặc archive + watermark/khóa replay + quy trình khôi
phục có thể chứng minh không cho Created cũ sống lại. Đặt monitoring cho
pending và kích thước ledger; chính sách purge cần quyết định riêng.

**Backfill/F11:** 0004 đã có trên test DB; audit trước ghi nhận cả dev DB nhưng
chưa xác nhận approval ADR/ERD. Trước rollout, read-only inventory các SR
`PROCESSING AND active_work_order_id IS NULL` ở từng môi trường. Đối chiếu
WO qua API/list theo `serviceRequestId` và tenant bằng tài khoản được phép,
hoặc export do owner WO cung cấp; ADR 0004 không cho background consumer tự
chế token hay truy vấn `workorder_db`. Chỉ backfill khi duy nhất một WO hợp lệ
và tenant/customer/equipment khớp; trường hợp 0/nhiều WO vào exception list.
Update có điều kiện theo status/ID hiện hành, lưu audit; lịch sử WO terminal
cũ cũng cần nguồn đối soát để tạo tombstone. Không đoán ID từ `workOrderNo`
hoặc timestamp, không áp dụng migration/UPDATE dữ liệu trong lượt này.

## 4. Ma trận event và cạnh tranh

| Chuỗi / tình huống | Hành vi cần đạt sau khi duyệt | Điểm cần quyết định |
| --- | --- | --- |
| Created(A,e1) lặp cùng eventId | Inbox no-op; một transition/history/outbox | Đã có; giữ regression. |
| Created(A,e3) khi A ACTIVE | Ledger no-op dù eventId mới; không thêm history/outbox | Kiểm tra immutable request/equipment/customer trước no-op. |
| Created(A) → Cancelled(A,false) → Created(A,e3) | A `CANCELLED` tombstone; SR giữ `ACCEPTED/null` | F09 diagnostic phải PASS. |
| Created(A) → Completed(A) → Created(A,e3) | A `COMPLETED` tombstone; SR giữ kết quả RESOLVED hoặc ACCEPTED nếu UNRESOLVED | Không xóa customer summary đã ghi. |
| Terminal(A,e2) lặp cùng/mới eventId | Cùng eventId: inbox no-op. Khác ID, cùng kết quả: semantic no-op. Payload mâu thuẫn: lỗi điều tra | Định nghĩa thế nào là payload tương đương. |
| A terminal → Created(B) | B có UUID mới; `ACCEPTED → PROCESSING` nếu SR chưa terminal | Partial unique chỉ giữ một ACTIVE. |
| A terminal → Created(B) → event A đến muộn | Event A không đổi trạng thái/kết quả của B | Ledger phân biệt A với B, kể cả khi A đã terminal. |
| Completed/Cancelled(A) trước Created(A) | Không ACK mất event; hoặc lưu pending bền vững rồi áp dụng đúng một lần khi Created tới, hoặc retry/DLQ có operator replay | F10: chọn policy, timeout và hành vi khi Created không bao giờ tới. |
| Created(B) trước terminal(A) | Không ACK bỏ B. Retry/DLQ hoặc pending Created có căn cứ, sau A terminal mới kích hoạt B | Broker retry hữu hạn; không khẳng định tự động thành công. |
| Concurrent Created(A)/terminal(A), Created(A)/Created(B), terminal trùng song song | Row lock SR + PK/unique ledger; kết quả tương đương một thứ tự hợp lệ, không tạo side effect trùng | Test PostgreSQL transaction thật, rollback inbox/ledger/history/outbox. |
| Mismatch tenant/request/equipment/customer | Reject trước khi thay SR; không ghi lifecycle của WO sai | Cancelled thiếu customerId: chỉ kiểm tra với ledger đã liên kết hoặc chờ Created/nguồn xác minh được duyệt. |

Với terminal-before-Created, nếu chọn pending và sau đó Created tới khi SR
`ACCEPTED`, có thể áp dụng Created rồi terminal trong **một transaction**, ghi
hai bước history/outbox theo state machine; cần xác nhận thứ tự publish và
ảnh hưởng consumer downstream. Không tự đổi thành transition tắt. Nếu Created
không tới, pending phải được cảnh báo và xử lý, không tự coi terminal đã áp
dụng. Với `Cancelled(true)` khi SR đã terminal do D4, cần quyết định ledger
ghi tombstone nhưng không phát sinh SR transition mới.

## 5. Bảng quyết định để nhóm chốt

| ID | Lựa chọn và trade-off | Đề xuất để review | Owner / điều kiện nghiệm thu |
| --- | --- | --- | --- |
| D-WO-01: identity bền vững | Chỉ `active_work_order_id`/status: ít schema nhưng F09 vẫn lỗi. Ledger/tombstone: thêm migration và retention, phân biệt A/B qua restart. | **Ledger SR-owned** theo WO UUID, không dùng `workOrderNo`. | Huy + Nguyên duyệt schema/ADR/ERD; F09, Completed replay, replacement PASS trên PostgreSQL. |
| D-WO-02: terminal đến sớm | Retry/DLQ: đơn giản nhưng cần operator và có thể hết retry. Pending terminal: tự phục hồi nhưng cần lưu payload tối thiểu, matching và monitoring. | **Pending terminal** cho mục tiêu F10 đầy đủ; rollout chỉ sau khi policy áp dụng và case Created không tới được chốt. | Huy + Khương + Nguyên; kiểm thử mọi thứ tự, retry/restart và rollback; không ACK mất event. |
| D-WO-03: replacement đến sớm | Retry/DLQ hiện có giữ event nhưng có thể hết 5 lần; pending Created cần thêm state/buffer và policy thứ tự. | Giữ retry/DLQ tạm thời; quyết định có cần durable pending Created trước nghiệm thu F10. | Khương + Huy; test broker thật và operator replay, thống nhất SLA. |
| D-WO-04: thứ tự nguồn | Dựa vào thời gian/workOrderNo không đủ tin cậy; source sequence mới đòi version contract và producer thay đổi. | Trước tiên dùng UUID + ledger + khóa SR; chỉ thêm sequence nếu ma trận cạnh tranh chứng minh cần. | Khương + Nguyên + các consumer owner duyệt contract/version nếu thay. |
| D-WO-05: conflict và retention | First-wins âm thầm che dữ liệu sai; reject đưa DLQ cần vận hành. TTL tombstone làm replay A sống lại. | Reject payload terminal mâu thuẫn; giữ tombstone cho MVP cho tới khi có archive/replay policy. | Huy + Khương + Nguyên; cảnh báo DLQ, retention được ghi ADR và test replay sau restart. |
| D-WO-06: dữ liệu cũ/0004 | Backfill tự đoán nhanh nhưng sai tenant/WO; owner export/API có kiểm chứng tốn công. | Read-only inventory, API/export được phép, conditional audited backfill sau approval. | Nguyên + Khương + Huy; xác nhận 0004/ERD và exception list từng môi trường. |
| D-CE-01: F12 EXPIRED | Đưa SR về REVIEWING bằng action staff: dùng luồng send sẵn có, cần transition mới. Giữ AWAITING và gửi revision tại chỗ: ít đổi UI nhưng cần self-transition/rule mới. | Review phương án **staff recovery → REVIEWING**, chưa triển khai. | Huy + state-machine/API owners; Accepted amendment, OpenAPI, RBAC, history/outbox và race tests trước code. |

Trong ownership hiện tại, Huy có thể triển khai consumer/ledger trong
`apps/service-request-service/**` **sau** khi D-WO-01/02/05/06 được duyệt;
viết regression tests trong service của mình và giữ API không breaking. Khương
quyết định semantics producer, dữ liệu WO dùng để đối soát và mọi thay đổi WO.
Nguyên review ADR/ERD, shared event contract và thay đổi transport nếu cần.
Không tự sửa Work Order, Gateway, shared packages hoặc Accepted docs.

## 6. F12 — Estimate EXPIRED recovery (quyết định riêng)

Current code lazy-expire SENT sau `validUntil` (ngày Asia/Ho_Chi_Minh), commit
`EXPIRED` rồi trả 409 khi approve/reject/revise; SR vẫn
`AWAITING_CUSTOMER_APPROVAL`. State machine Accepted có
`AWAITING_CUSTOMER_APPROVAL → REVIEWING` khi **revise SENT**, nhưng không định
nghĩa action đó cho EXPIRED. OpenAPI cũng ghi replacement workflow pending.
`EXPIRED` không nằm trong partial unique live index (`DRAFT`, `SENT`,
`APPROVED`); revision mới có thể dùng `revision_no+1` mà không đè revision cũ.
Điều này chỉ chứng minh khả năng DB, không cấp quyền chuyển trạng thái SR.

Nếu chọn staff recovery → REVIEWING, cần chốt action/permission, xử lý song
song với customer response và lazy expiration, transition history/outbox,
quy tắc sao chép items/validUntil và send revision mới. Giữ nguyên các
revision `APPROVED`, `REJECTED`, `SUPERSEDED` và `respondedBy/At`; không tự
thêm state hoặc sửa state machine trong lượt này.

## 7. Cổng nghiệm thu sau quyết định

1. ADR/ERD và migration mới được owner review; kiểm tra drift trên test DB,
   không chỉnh 0004 đã áp dụng. Có reconciliation plan cho legacy NULL và
   terminal WO cũ trước rollout.
2. Diagnostic F09 **PASS thật**; DB suite cũ giữ 42/42 và bổ sung duplicate
   khác eventId, Completed/Cancelled replay, terminal-before-Created,
   replacement và concurrent deliveries. Assert số lượng inbox, ledger,
   history, outbox và rollback.
3. Test producer Work Order + RabbitMQ thật cho reorder/retry/DLQ, restart và
   customer-safe summary; phân biệt với direct consumer fixtures.
4. F12 chỉ code sau Accepted amendment; test concurrent expired/approve/revise
   và partial live index.

Không commit/push/merge, không sửa code hay diagnostic test trong lượt cập
nhật tài liệu này.

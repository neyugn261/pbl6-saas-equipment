# M3 — Ghép Inventory reservation phía Work Order

Ngày 02/11/2026. Owner WO: Khương; Inventory: Minh. Base `develop@4bd53c6`
(Inventory PR #54), nhánh `feature/khuong-m3-inventory-reservations`.
Implementation được Khương yêu cầu trong phiên; peer review/schema/auth của
Minh/Nguyên vẫn thực hiện qua PR, không tự ghi nhận đã có approval.

## Đầu ra

Hai API nội bộ đã triển khai, đều trả **200** cho lần đầu và replay, no-store:

| Route trong WO | Request | Response |
| --- | --- | --- |
| `POST /internal/work-orders/{id}/inventory-reservations` | `{requestId, fingerprint}` | `{requestId, fingerprint, workOrderId, state}` |
| `POST /internal/work-orders/{id}/inventory-reservations/settle` | `{requestId, fingerprint, outcome: COMMITTED \| ABORTED}` | Cùng identity; state COMMITTED hoặc RELEASED |

Chỉ TENANT_STAFF có `inventory:issue` **và** `work_order:read`. Inventory dùng
original caller JWT/correlation ID gọi trực tiếp WO; Gateway tiếp tục chặn
internal routes. Không thêm permission, token máy hoặc cross-DB query.

WO lấy operation proof từ Inventory qua HTTP **trước** transaction WO. Xác minh
tenant/key/WO, operation ISSUE, actor gốc, request canonical SHA-256 và phase.
COMMITTED cần usage/transaction UUIDs, tenant/WO/part/warehouse/quantity/recordedBy
khớp. Body outcome hoặc một lần GET status WO không thay thế được proof/hold.

`workorder_db.work_order_inventory_reservations` lưu HELD/COMMITTED/RELEASED,
request/actor gốc và logical Inventory references. Tenant+request là identity
bền vững; dùng cùng key cho retry/recovery. Một WO có thể có nhiều hold.

| Trạng thái | Điều kiện và tác động |
| --- | --- |
| Chưa có → HELD | Proof PENDING, WO chưa terminal, lấy WO row lock |
| HELD → COMMITTED | Proof COMMITTED, identity/result hợp lệ; mở gate terminal cho operation này |
| HELD → RELEASED | Proof ABORTED bền vững |
| Chưa có → RELEASED | Proof ABORTED; tombstone chặn acquire đến muộn, kể cả stale PENDING đã fetch trước đó |
| COMMITTED / RELEASED | Replay trạng thái cũ; không đảo outcome/identity hoặc thay usage/ledger IDs |

HELD không tự hết hạn. Mọi complete/cancel cùng khóa WO và trả
409 `INVENTORY_RESERVATION_HELD` khi còn bất kỳ hold nào. Guard cancel dùng chung
cho HTTP và SR cancellation consumer; complete kiểm tra trước khi ghi report,
assignment, audit và outbox.

SR consumer bị HELD sẽ rollback inbox, không coi event đã xử lý thành công.
Nếu event đã hết bounded retry và vào DLQ trong lúc chờ recovery, sau settlement
cần replay **event gốc**; không đổi eventId hoặc tạo token giả cho consumer.

Thiếu URL/nguồn lỗi/missing route → 503 `INVENTORY_PROOF_UNAVAILABLE`.
Thiếu WO/sai scope → 404. DTO/query lạ → 400. Proof/key/phase/identity mâu thuẫn
→ 409 `INVENTORY_RESERVATION_CONFLICT`. Source 401/403 giữ nguyên HTTP status.
Mọi lỗi giữ hold; không giả ABORTED hoặc tự mở khóa.

Thiết kế/schema: [ADR 0016](../decisions/0016-workorder-inventory-reservations.md),
[ADR 0014](../decisions/0014-inventory-m3-transactions-and-reservations.md).
Contract: [WO](../api/workorder.yaml) và [reservation/recovery](../api/inventory-reservations.yaml).

## Deploy và vận hành cho Minh/Nguyên

1. Review migration WO **0006_inventory_reservations** và ERD additive. Không sửa
   migration cũ. Chỉ có FK tenant+WO trong cùng DB, không FK Inventory.
2. Trên môi trường đích, áp đủ migration của Inventory (qua 0005) và WO:

   ```bash
   pnpm --filter inventory-service db:migrate
   pnpm --filter workorder-service db:migrate
   ```

3. Cấu hình `INVENTORY_SERVICE_URL` trực tiếp tới Inventory và
   `WORKORDER_SERVICE_URL` trực tiếp tới WO. Hai biến đã có trong env/Compose
   chung. WO validate Inventory URL dạng optional; thiếu URL không làm hỏng
   startup WO cũ, nhưng API reservation trả unavailable.
4. Restart/rebuild hai service sau migration. Chạy ISSUE qua Inventory/Gateway;
   UI không gọi internal WO reservation và không tự tạo fingerprint.
5. Các operation PENDING do WO chưa có API từ trước: GET/retry cùng key bằng
   tài khoản hiện còn quyền. Nếu quyết định bỏ một operation chưa commit thì
   dùng abort; khi đã COMMITTED phải RETURN, không abort.

Trong lượt này chỉ áp migration lên DB test riêng. Chưa áp migration DB dev/demo
của nhóm, chưa deploy hoặc restart application stack đang dùng chung.

## Quy tắc UI cho Hatsady

- `201 + SETTLED`: stock đã xuất và WO đã đồng bộ. `201 + PENDING_FINALIZE` vẫn
  là **đã xuất**, chưa được báo thất bại hoặc gửi lại với UUID mới.
- Timeout/503: giữ key, đọc `/api/inventory/inventory-operations/{key}` rồi
  retry/abort theo proof; không suy ra stock chưa thay đổi.
- `PENDING_RELEASE`: operation đã abort nhưng vẫn cần đối soát hold. WO có thể
  còn chặn complete/cancel cho tới khi settle được xác minh.
- Manager/Technician gặp `INVENTORY_RESERVATION_HELD`: hiển thị cần xử lý operation
  kho còn chờ, không báo đã hoàn thành/hủy và không tự retry vô hạn.
- RETURN sau terminal vẫn là API Inventory hiện hành. Giá vốn, confirmed-use,
  quarantine và customer-safe history tiếp tục theo ADR 0015, không nhân bản ở WO.

Các tài liệu của Minh ghi WO chưa có API là snapshot trước lượt ghép này; source
Inventory không cần sửa để gọi hai route mới. Huy C4/Notification và UI/Android
acceptance là các đầu việc riêng; lượt này không đóng M3 toàn nhóm.

## Kiểm thử đã chạy

Linux, Node 24.20.0, pnpm 11.26.0. PostgreSQL 17/MinIO trong container tạm riêng,
credentials sinh cho lượt chạy; đúng `workorder_test_db`, `inventory_test_db` và
`workorder_shadow_test_db`. Không reset DB/volume chung. Fixture theo tenant/run
riêng, app dùng port tạm. Kết quả máy đọc được:
[reservation results](m3-khuong-inventory-reservations-results.json).

| Kiểm tra | Kết quả |
| --- | --- |
| `test:m3` toàn bộ 17 bước | PASS |
| WO lint/typecheck/build, shared packages build | PASS |
| WO unit | 44 PASS, gồm 9 proof-client cases và 1 env case mới |
| WO bootstrap E2E | 2 PASS |
| WO PostgreSQL regression | 231 PASS = 210 cũ + 21 reservation |
| Migration deploy ×2, migrations/schema và DB/schema drift | PASS, no difference |
| Attachment + projection MinIO thật | 45 PASS, cùng cases chạy thêm với storage thật |
| Gateway E2E/build | 25 PASS / PASS |
| Attachment/report Gateway smoke, cleanup process crash/restart | PASS |
| Gateway → Inventory → WO, HTTP proof + PostgreSQL thật | 10 kịch bản PASS |

DB reservation suite dùng proof fixture được khai báo; live integration dùng
HTTP client/proof và stock/ledger thật. Các boundary hooks chỉ trì hoãn hoặc
làm mất response, không trả fake reservation/stock result. Live integration có:

1. ISSUE → settle → replay cùng usage → complete → RETURN sau terminal.
2. HELD chặn complete/cancel; WO bị **SIGKILL** rồi tiến trình mới vẫn giữ hold;
   Inventory tiếp tục commit/settle được.
3. Lỗi sau hold làm local transaction rollback về PENDING; restart toàn Inventory
   Nest application rồi retry cùng key, chỉ xuất một lần.
4. Stock COMMITTED nhưng settle chưa tới WO: giữ HELD/PENDING_FINALIZE; restart
   Inventory application và retry không trừ tồn lần hai.
5. WO đã settle nhưng response mất: replay chỉ đối soát, không tạo usage/ledger mới.
6. Thiếu tồn rollback → proof ABORTED → RELEASED; WO hủy được.
7. Abort trước reserve tạo tombstone; delayed reserve không tạo hold lại.
8. WO terminal chặn ISSUE mới, không đổi stock.
9. Hai ISSUE tranh cùng tồn: một thành công, một abort, không tồn âm/hold sót.
10. Gateway chặn internal, tenant khác không truy cập WO reservation.

Sau các kịch bản, script đối chiếu stock **3.00**, đúng **6 ISSUE ledger/usage**,
10 ISSUE operation đã settle và không còn HELD. Cleanup fixture/process là một
phần điều kiện thành công; chỉ in PASS sau cleanup hoàn tất.

Inventory restart ở đây là close/recreate toàn Nest application và Prisma pool
trong cùng test process; SIGKILL chỉ áp cho WO. JWT là fixture ký/verify thật,
reference Organization/Asset được seed cục bộ để test riêng giao thức. Không
gọi đây là live Identity/broker, deploy container, browser hoặc Android acceptance.
Warning/503 khi inject outage và DEP0060/MaxListeners từ Gateway là đã biết.

Chạy lại sau khi cấu hình URL đúng các DB test riêng:

```bash
pnpm --filter workorder-service test:inventory:integration
# Regression rộng, cần thêm shadow DB và cấu hình MinIO test như hướng dẫn A6:
pnpm --filter workorder-service test:m3
```

Suite DB hiện có truncate nên không chạy đồng thời với integration trên cùng DB.
`test:inventory:integration` tự build Inventory/Gateway/WO và áp migration chỉ trên
hai DB test đã được helper kiểm tra. Không cần broker/MinIO cho riêng suite này.

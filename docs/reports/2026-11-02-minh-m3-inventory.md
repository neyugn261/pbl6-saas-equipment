# Minh M3 — Inventory và LowStock, ngày 02/11/2026

> Cập nhật sau review nghiệp vụ: [báo cáo cải tiến M3](2026-11-02-minh-m3-business-improvements.md)
> và [bàn giao bổ sung](../plans/minh-m3-business-review-handoff.md). Số 54 tests và
> phạm vi file bên dưới là kết quả đợt triển khai ban đầu; báo cáo mới ghi 75 ca
> đã chạy, phần Asset bổ sung và các thay đổi contract theo ADR 0015.

## Kết quả và phạm vi

Đã kiểm tra local sạch trên develop `79a4568`, fetch GitHub đầu và cuối lượt;
origin/develop không có commit mới. Triển khai trên nhánh riêng
`codex/minh-m3-inventory`, cùng nền commit đó. **Thay đổi M3 hiện ở local, chưa
commit/push/merge; chưa có CI run hoặc approval của các owner.**

Đã triển khai phần backend Inventory của Minh và kiểm chứng local. **Chưa nghiệm
thu ISSUE toàn hệ thống**: chủ dự án chọn reservation bắt buộc; Work Order hiện
chưa có runtime reservation tương ứng. Không dùng phương án GET trạng thái để
lách yêu cầu này. B1 review và tích hợp B3/C3/UI còn phụ thuộc nhóm.

| Task | Phần đã làm | Trạng thái / phần còn lại |
| --- | --- | --- |
| M3-B1 | ADR 0014, OpenAPI runtime và reservation/recovery đề xuất; quy tắc decimal, idempotency, terminal/INACTIVE, latch và lỗi | Chủ dự án đã chọn rule; Khương/Huy/Nguyên cần review contract liên quan, chưa giả lập peer approval |
| M3-B2 | Auth/config/Prisma/DB health; Part/Warehouse create/read/list/update/status; stock/threshold; global và filtered ledger | Implemented, unit/HTTP/DB local đạt; scope tenant, CUSTOMER/PLATFORM bị từ chối; không xóa cứng/đổi quantity trực tiếp |
| M3-B3 | Receive/adjust/issue/return; khóa row; stock/ledger/usage/returned/outbox/result nguyên tử; exact balances; operation PENDING/COMMITTED/ABORTED; retry/abort/proof và settlement | Inventory half đạt với PostgreSQL + WO contract fixture. WO runtime reservation/terminal locking chưa có; actual ISSUE trả 503 an toàn khi capability thiếu |
| M3-B4 | LowStockDetected.v1 thật từ transaction, latch/re-arm/threshold change; shared outbox relay, publish retry và RabbitMQ retry/replay | Producer đạt. Notification audience/recipient/inbox/API/UI chưa nghiệm thu, thuộc Huy/Nguyên/Hatsady |
| M3-B5 | Migration mới 0003, raw SQL constraints, ERD/Prisma, dev seed không reset, tests concurrency/rollback/restart, README/API/CI hooks và bàn giao | Kiểm tra local đạt; cần review/CI/merge và ghép runtime owner khác sau đó |

## Những thay đổi chính

- Bỏ endpoint Hello World; nối NestJS pipeline dùng service-kit/auth hiện hành.
  Tenant chỉ lấy từ JWT; không thêm role/permission hoặc hệ thống branch scope mới.
- Part SKU/unit và warehouse code/branch bất biến; metadata/status có PATCH. Tạo/
  activate kho kiểm tra Branch ACTIVE qua Organization, forward JWT/correlation.
- Tất cả quantity/cost là decimal strings, tính bằng Prisma Decimal. Movement >0,
  không tồn âm/overflow, adjust có lý do; input/unknown fields và paging được validate.
- RECEIVE/ADJUST cần Part/Warehouse ACTIVE. RETURN về đúng kho xuất, cho phép sau
  terminal/INACTIVE và không vượt lượng chưa trả. Ledger không sửa ngược ISSUE;
  usage GET có net consumed và từng RETURN liên kết trực tiếp.
- Unique tenant/key, canonical fingerprint và response snapshot bền vững; retry
  vẫn kiểm auth hiện tại. Nhận `1`/`1.0`/`1.00` như cùng lượng, không tính bằng float.
- ISSUE chuẩn bị operation trước network, chỉ ghi khi có HELD reservation đúng
  danh tính; successful commit không bị coi là fail chỉ vì settle outage. Có GET
  operation list/proof, POST retry/abort; abort không thể release một ISSUE đã commit
  trong race. Không token thật lưu DB, token giả hoặc timer-expiry để giải phóng hold.
- Outbox event và latch trong transaction stock. Strict `<`, equality `>=` re-arm,
  sửa threshold đánh giá lại. Business occurrence là outbox UUID giữ nguyên qua
  publish/retry/replay; re-arm rồi crossing tạo UUID mới, không đổi payload/version v1.
- Migration 0003 chỉ thêm operation records, balances và RETURN usage FK/checks;
  không sửa 0001/0002. Legacy nullable history không được bịa balance hoặc linkage.
- Dev seed dùng Identity login/Organization lookup thật ở script, fixture ID chuẩn,
  initial receipt key cố định, preserve metadata/status/threshold/quantity khi rerun.
  Seed function đã được kiểm bằng DB + API fixture, chưa chạy script login thật ở local.
- CI được nối bootstrap Inventory và broker URL cho test DB loop đã có. Lockfile chỉ
  thêm 18 dòng dependency/link của Inventory, không nâng phiên bản package khác.

## Kiểm tra thực tế

| Kiểm tra | Kết quả |
| --- | --- |
| Inventory unit tests | **23/23 PASS**: config, decimal/range/precision, canonical hash, strict latch/re-arm, forwarded reference, missing/mismatched reservation |
| Inventory HTTP e2e (DB fake) | **8/8 PASS**: health failure/recovery, auth, CUSTOMER/PLATFORM/role denial, tenant injection/whitespace validation |
| PostgreSQL business suite | **20/20 PASS**: catalog, scope/unique/immutable, Branch fail, concurrent receipts/issues/returns/retries, exact balances, overflow, INACTIVE, latch, rollback, timeout, abort/commit race và Inventory restart |
| PostgreSQL seed suite | **2/2 PASS**: chạy lại giữ metadata/stock/threshold, một initial receipt; từ chối production/missing Branch |
| PostgreSQL + RabbitMQ producer suite | **1/1 PASS**: hai crossings, simulated publish failure giữ PENDING/retry, broker retry và replay giữ eventId |
| Tổng số ca | **54 PASS** (23 unit + 8 HTTP + 23 integration); không cộng số lần rerun |
| Inventory lint / typecheck / build | **PASS** |
| Migrate inventory_test_db | **PASS**, 0001/0002/0003; lần chạy lại không còn pending |
| Migration ↔ Prisma drift | **PASS**, no difference |
| inventory_test_db ↔ Prisma drift | **PASS**, no difference |
| Hai OpenAPI | **PASS**, parse và resolve **123** reference |
| CI YAML / ERD additive SQL / git diff check | **PASS**, ERD chứa đúng nguyên bản SQL runtime 0003 |

Đã phát hiện/sửa lỗi deserialize `void` của advisory lock bằng cast `::text` theo
pattern repo và tên FK map để drift sạch. Kết quả cuối phía trên được chạy sau sửa.
Không tuyên bố root full suite, GitHub CI, WO reservation runtime hoặc Notification
UI đã pass dựa trên các test này.

### Môi trường và evidence broker

Docker PostgreSQL/RabbitMQ của dự án được bật, không reset hoặc down volumes.
Local chưa có inventory_test_db và thiếu INVENTORY_TEST_DATABASE_URL: tạo DB test
riêng; process test dùng cấu hình kết nối hiện có với basename inventory_test_db.
Credential không in ra log, không sửa `.env`, không migrate inventory_db phát triển.
Generated client/dist/output và helper tạm nằm ngoài git.

Từ producer/repository thật → PostgreSQL outbox → shared relay → RabbitMQ thật →
test subscriber: 10.00, min 5.00; giảm 6.00 → occurrence tại 4.00; giảm tiếp 1.00
không thêm event; nhập 2.00 đạt 5.00 để re-arm; giảm 0.01 → occurrence 4.99.
Có **2 eventId khác nhau và 4 deliveries** qua retry/replay. Event có thể đến sai
thứ tự (4.99 trước 4.00), nên consumer không được giả định order theo delivery.

Envelopes thực tế: [JSON evidence](../testing/2026-11-02-inventory-low-stock-evidence.json).
Đây là test probe, không phải Notification inbox hoặc audience production.

## File/đầu mối bàn giao

- Runtime, DTO, persistence, seed và suites: `apps/inventory-service/**`.
- API: [inventory.yaml](../api/inventory.yaml),
  [inventory-reservations.yaml](../api/inventory-reservations.yaml).
- Quyết định/giới hạn: [ADR 0014](../decisions/0014-inventory-m3-transactions-and-reservations.md).
- Phân công chi tiết và tiêu chí ghép: [M3 Inventory handoff](../plans/minh-m3-inventory-handoff.md).
- Đồng bộ docs SQL, fixtures, event producer status, README và CI; không đổi source
  Work Order, Notification, Gateway, Web, Mobile, Asset/Maintenance hoặc shared event catalog.

| Người phụ trách | Việc cần tiếp nhận | Điều kiện nghiệm thu |
| --- | --- | --- |
| Khương | Durable reservation + proof verification; cùng WO lock ở reserve/complete/cancel, tombstone/recovery | Race/restart hai service thật; không complete/cancel vượt HELD; ISSUE qua Gateway |
| Huy | Audience/recipient source, low-stock consumer/inbox/dedup, Notification API; không suppression mất đợt re-arm | Hai occurrence mới, retry/replay, out-of-order; đối chiếu inbox và API/UI thật |
| Nguyên | Review shared/schema/CI, route/CORS headers, credential/recipient decisions; môi trường integration | Không giả JWT/machine credential; internal proof không public; CI thật xanh sau review |
| Hatsady | Inventory UI, operation pending/retry/abort UX, deep link và ma trận UAT | Decimal, quyền, lỗi, stock/ledger/usage đúng; không gọi mock là end-to-end |
| Minh | Phối hợp ghép lại sau khi owner có runtime; kiểm chứng race và C3 với source thật | Chưa đóng acceptance B1/B3/C3 chỉ dựa vào fixture hoặc producer probe |

Mọi bàn giao mới ở dạng file trong repo; chưa gửi message/issue bên ngoài và chưa
tự chốt phần phụ trách của người khác. Muốn chạy backend local cần apply migration
Inventory riêng theo README; muốn demo ISSUE phải hoàn thành reservation bên WO trước.

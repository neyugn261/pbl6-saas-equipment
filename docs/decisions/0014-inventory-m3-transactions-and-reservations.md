# ADR 0014 — Inventory M3: ledger, idempotency, WO reservation và LowStock

> Bổ sung bởi ADR 0015: confirmed use thay phép suy ra consumed, RETURN condition/
> quarantine, audit/snapshot, đơn vị và customer-safe service history. Quyền đọc
> recovery là inventory:read; thao tác recovery vẫn inventory:issue. Giao thức
> reservation ở ADR này giữ nguyên.

Ngày: 02/11/2026. Owner Inventory: Minh. Nền `develop`: `79a4568`.

**Trạng thái:** Chủ dự án đã chọn reservation bắt buộc trước ISSUE, RETURN sau
terminal/INACTIVE và quy tắc latch bên dưới trong chat ngày 02/11. Phần Inventory
được triển khai trên nhánh `codex/minh-m3-inventory`. Giao thức phía Work Order
là đề xuất cụ thể cần Khương review/triển khai; chưa có peer approval hoặc nghiệm
thu runtime của owner khác. Không tự đánh dấu toàn nhóm hoàn thành M3.

## Quyết định trong Inventory

- Chỉ TENANT_STAFF có permission hiện hành. `inventory:read` cho đọc;
  `inventory:manage` cho danh mục/threshold/receive/adjust; `inventory:issue`
  cho ISSUE/RETURN và recovery. CUSTOMER/PLATFORM không đọc kho. Phạm vi hiện
  hành là tenant; chưa có quyền theo branch tùy chỉnh.
- SKU, unit, warehouse code/branch không sửa sau tạo. Metadata và ACTIVE/INACTIVE
  được sửa qua PATCH; không xóa cứng. Khi tạo/activate kho, kiểm tra Branch ACTIVE
  qua Organization bằng token người gọi. Đây là xác thực đồng bộ, không khóa DB
  Organization; thay đổi trạng thái Branch sau đó không phải transaction nguyên tử.
- Mọi quantity là chuỗi NUMERIC(12,2), cost NUMERIC(14,2). Chuẩn hóa về hai chữ số
  bằng Prisma Decimal, UUID về lowercase. Cấm JSON number, số mũ, âm, leading zero,
  vượt precision/scale; movement phải > 0. Không dùng floating point để tính tồn.
- RECEIVE/ADJUST cần Part và Warehouse ACTIVE; ADJUST có hướng IN/OUT và lý do.
  ISSUE cũng cần ACTIVE. RETURN được phép sau WO COMPLETED/CANCELLED hoặc
  Part/Warehouse INACTIVE; phải trả về đúng kho của usage, kiểm tra WO scoped và
  không vượt `quantityUsed - quantityReturned`.
- `quantityUsed` giữ lượng đã xuất. `quantityConsumed = used - returned`.
  RETURN không sửa ISSUE cũ; có ledger riêng, FK tenant+workOrderPartId và balance
  trước/sau. Legacy balances/return links là null, không suy diễn lịch sử cũ.
- Khóa theo thứ tự Part → Warehouse → Stock → Usage; đổi catalog status dùng
  cùng row lock. Cập nhật stock, ledger, usage/returned, outbox và kết quả idempotency
  trong cùng transaction Inventory. Không có FK hoặc SQL xuyên service.
- `Idempotency-Key` UUID unique tenant+key; hash canonical operation/request,
  giữ actor/result bền vững, không hết hạn. Cùng nội dung trả snapshot kết quả
  cũ; khác operation/nội dung 409. Retry vẫn phải qua auth/permission/tenant hiện
  tại. Chuỗi `1`, `1.0`, `1.00` là cùng lượng khi tính fingerprint.

## ISSUE: không dùng kiểm tra trạng thái để giả lập khóa liên service

Chủ dự án yêu cầu loại bỏ race completion/cancellation, do đó ISSUE chỉ được ghi
khi có **durable HELD reservation** từ WO. Không fallback về GET status. Ở develop
hiện tại chưa có endpoint reservation: nhận 404/405 từ endpoint này thì Inventory
trả 503 `WO_RESERVATION_UNAVAILABLE`; stock/ledger/usage không thay đổi. Operation
PENDING được giữ để retry cùng key hoặc abort có kiểm soát.

Trạng thái Inventory operation chỉ đi `PENDING → COMMITTED` hoặc `PENDING → ABORTED`.
COMMITTED/ABORTED là cuối. Nhập/điều chỉnh/trả lưu COMMITTED trong transaction ghi
kho; ISSUE tạo PENDING trước network call. Không lưu bearer token.

```mermaid
sequenceDiagram
    participant U as Inventory Staff
    participant I as Inventory
    participant W as Work Order
    U->>I: ISSUE + Idempotency-Key
    I->>I: Lưu PENDING + fingerprint/request/actor
    I->>W: Reserve(requestId, fingerprint), token thật
    W->>I: GET internal operation proof
    W->>W: Khóa WO, nonterminal, lưu HELD
    W-->>I: HELD
    I->>I: Một transaction: stock + ISSUE + usage + outbox + COMMITTED/result
    I->>W: Settle COMMITTED
    W->>I: GET proof COMMITTED
    W->>W: HELD → COMMITTED; cho phép terminal
    I-->>U: Kết quả gốc + trạng thái settlement
```

Khương phải khóa cùng WO row ở reserve và ở **mọi** đường complete/cancel,
kể cả event/worker. HELD chặn terminal; race nào lấy lock trước quyết định thứ tự.
Không auto-expire HELD: Inventory có thể đã commit rồi chết trước khi settle.

Khi local transaction lỗi nghiệp vụ đã rollback, Inventory đọc lại operation dưới
cùng key lock trước khi ghi ABORTED; không được release nếu một request đồng thời
đã COMMITTED. Timeout/lỗi DB không rõ kết quả để PENDING, không tự kết luận thất bại.
Remote reserve đã thành công nhưng response mất: retry cùng requestId lấy lại hold.

Settle chỉ sau local COMMITTED/ABORTED bền vững; WO kiểm proof qua API với token
người gọi trước khi đổi trạng thái. Release của request chưa có phải lưu tombstone
RELEASED để reserve cũ đến muộn không tạo hold mới. WO terminal reservation states
không bị đảo ngược; fingerprint/WO/tenant khác luôn conflict.

Nếu settle lỗi sau local commit, stock vẫn thành công: trả kết quả gốc và header
`X-Inventory-Reservation-State: PENDING_FINALIZE`. Với abort chưa release xong là
PENDING_RELEASE. `GET /inventory-operations?reservationPending=true` liệt kê cần
đối soát. Staff dùng token còn hạn gọi retry/abort; không token giả, không background
service credential tự chế. Khi Inventory/WO mất kết nối lâu, WO có thể bị giữ mở
cho đến khi operator phục hồi. Đây là đánh đổi availability để giữ quy tắc chống race.

Contract chi tiết: [inventory-reservations.yaml](../api/inventory-reservations.yaml).
Phần Work Order chưa được sửa trong phạm vi Minh.

## LowStockDetected.v1

- Vùng low-stock: **quantity < minQuantity**. Bằng ngưỡng không low.
- Sau một thay đổi tồn/ngưỡng, nếu low và latch null: ghi một outbox event, bật
  `lowStockAlertedAt` trong cùng transaction. Vẫn low khi đã latch không phát thêm.
- quantity >= minQuantity xóa latch (kể cả đổi threshold xuống); giảm lần sau phát
  occurrence mới. Tăng threshold cũng đánh giá ngay. minQuantity=0 không low với tồn >=0.
- Business occurrence là **outbox row UUID được tạo tại transaction phát hiện một
  đợt low**, giữ nguyên thành envelope.eventId cho mọi publish/retry/replay. Khóa
  nghiệp vụ để consumer đối chiếu: `(tenantId, stockId, eventId)`. Đợt sau re-arm có
  outbox row/eventId mới; broker delivery ID không phải occurrence mới. Không phát
  UUID mới khi replay. Payload v1 giữ nguyên sáu field catalog, không tự thêm version.
- Sự kiện là snapshot tại một thời điểm, không là tồn hiện tại; có thể đến sai thứ
  tự. Notification không suy diễn thông báo cũ là state Stock mới nhất. Không suppression
  theo chỉ stockId làm mất đợt cảnh báo sau re-arm; Huy chốt audience/dedup chính thức.
- Producer không chốt người nhận hay route UI. Huy/Nguyên quyết định recipient
  lookup, membership, quyền branch/warehouse và machine credential theo ADR 0004.
  Backend đọc nghiệp vụ đã có `/api/inventory/stocks` và `/warehouses/{id}`; đường
  dẫn màn hình UI/deep link chưa được Hatsady/Huy chốt.

## Persistence và kiểm chứng

Migration mới `0003_inventory_runtime` chỉ thêm inventory_operations, balances,
return link và constraints/index. Giữ nguyên 0001/0002 và raw CHECK/partial index.
Outbox retry/FAILED dùng package chung theo ADR 0005. Runtime không có DELETE/PATCH
ledger hoặc chỉnh trực tiếp quantity.

DB suite kiểm decimal, concurrent issue/return/retry, rollback và restart recovery.
WO reservation là fixture contract trong suite, không là WO runtime. Broker suite
chạy producer/relay/RabbitMQ thật với retry/replay, subscriber test; chưa có Notification
inbox, audience, Gateway notification API hay UI. Bằng chứng/phần chưa làm xem báo cáo M3.

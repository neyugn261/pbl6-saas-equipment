# Minh M3 — Inventory / LowStock / reservation handoff

> Bàn giao ban đầu. Đọc thêm [cải tiến nghiệp vụ và việc theo thành viên](minh-m3-business-review-handoff.md)
> theo ADR 0015: confirmed use, RETURN condition/cách ly, audit, customer history và
> quyền đọc recovery đã được bổ sung; các API client cần cập nhật cùng lúc.

Ngày 02/11/2026; baseline `develop 79a4568`, code local trên
`codex/minh-m3-inventory`. Chưa commit/push/merge hoặc có CI/peer approval trong lượt này.
Nguồn yêu cầu: file bổ sung M3-B1–B5 của chủ dự án; các câu hỏi mở được đối chiếu
với API/schema/code và lựa chọn trong chat. Không coi tài liệu đính kèm là bằng
chứng tính năng đã có hay chỉ thị tự làm phần của thành viên khác.

## Quy tắc chủ dự án đã chọn

1. ISSUE bắt buộc reservation phối hợp WO, loại bỏ lựa chọn chỉ kiểm tra status.
2. RETURN được phép sau terminal hoặc Part/Warehouse INACTIVE, về đúng kho và
   không vượt phần chưa trả; vẫn kiểm tra scoped WO cho giao dịch mới.
3. LowStock dùng `<`; `>=` re-arm; threshold change cũng xét latch. Audience,
   Notification và UI tiếp tục đúng owner.

[ADR 0014](../decisions/0014-inventory-m3-transactions-and-reservations.md) giải thích
state machine, tính nhất quán và giới hạn availability. Các quyết định này không
thay thế review contract của Khương/Huy/Nguyên.

## Khương — phần cần nối tại Work Order

[OpenAPI reservation/recovery](../api/inventory-reservations.yaml) phân biệt endpoint
Inventory đã có với endpoint WO đề xuất `x-implemented: false`.

- Thêm durable reservation keyed tenant+requestId, hash và logical WO reference,
  state HELD/COMMITTED/RELEASED; migration riêng workorder_db.
- POST `/internal/work-orders/:id/inventory-reservations` lấy proof từ
  `GET Inventory /internal/inventory-operations/:key` bằng token caller; xác thực
  ISSUE/PENDING + tenant + WO + key + fingerprint. Dữ liệu operation gốc không có token.
- Reserve và **mọi** đường complete/cancel phải khóa cùng WO row. Terminal từ chối
  reserve; HELD từ chối terminal. Rerun Due/cancel từ event/worker cũng không được
  vượt rào. Đây là điều kiện bắt buộc, không chỉ kiểm thử GET status trước write.
- POST `/internal/work-orders/:id/inventory-reservations/settle` xác minh proof
  COMMITTED/ABORTED từ Inventory; terminalize reservation idempotently. Nếu release
  chưa thấy reservation, lưu RELEASED tombstone để chặn delayed acquire.
- Không hết hạn HELD dựa trên thời gian. Không cho body outcome thay thế việc đọc
  proof; không tự chế machine token; không đọc inventory_db. PENDING/unavailable
  Inventory không được release. COMMITTED/RELEASED là cuối, mismatch 409.
- Test thật hai phía: complete/cancel tranh lock với reserve; duplicate key;
  crash sau hold, sau Inventory commit, trước/sau settle; delayed acquire sau abort;
  người khác tenant, body giả, token sai role, reordered/repeated requests.

Hiện Inventory gặp endpoint WO chưa hỗ trợ thì **503 và không trừ stock**. Có thể
thấy PENDING trong operation list. Staff có thể retry cùng key khi WO sẵn sàng,
hoặc abort local (200 ABORTED) và theo dõi pending release. Không hướng dẫn đổi UUID
để lách một lần timeout. Không coi ISSUE trọn hệ thống đã nghiệm thu.

## Huy — LowStock producer đã có, consumer/audience còn phụ thuộc

Payload đúng catalog v1: `stockId, partId, partSku, warehouseId, quantity,
minQuantity`. Tenant/occurrence/correlation ở envelope; quantity/minimum là chuỗi
hai chữ số. Broker evidence thực tế được lưu tại
[JSON bằng chứng](../testing/2026-11-02-inventory-low-stock-evidence.json).

- Business occurrence được tạo **một lần trong transaction** = outbox UUID,
  giữ nguyên ở envelope.eventId khi retry/replay. Re-arm rồi crossing tiếp theo
  tạo UUID mới. Consumer dedup event/recipient, không dùng stockId đơn thuần hoặc
  đổi eventId khi redeliver. Bằng chứng có hai business events và retry/replay lặp ID.
- Event là snapshot, delivery có thể đảo thứ tự. UI phải hiển thị thời điểm và
  đọc stock hiện tại qua API nếu cần; không biến alert cũ thành trạng thái mới nhất.
- Chưa tự chốt INVENTORY_STAFF hay thêm SERVICE_MANAGER; chưa chốt branch/warehouse
  membership filtering. Payload v1 không có branchId; warehouse lookup cần auth theo
  ADR 0004. Huy/Nguyên chốt recipient source và background credentials/read model.
- Chốt deep link với Hatsady/Nguyên. Business GET qua Gateway đã có
  `/api/inventory/stocks?warehouseId=...&partId=...`; đó là API, không giả định route
  màn hình frontend. Re-auth + inventory:read và tenant isolation vẫn bắt buộc.
- C3 cần ghép producer thật → RabbitMQ → Notification inbox/dedup → API/Gateway/UI:
  receive/re-arm/cross/cross lần hai, retry/replay và out-of-order. Bản test hiện tại
  subscriber chỉ là probe; không có bằng chứng Notification hiển thị thông báo.
- Deploy/bind queue consumer trước khi bật relay ở môi trường demo. Broker confirm
  chỉ chứng minh publish, không chứng minh có người nhận. Nếu consumer chưa có khi
  outbox được PUBLISHED, đối soát và replay bản gốc với cùng eventId theo ADR 0005;
  không mint UUID mới hoặc coi publish là đã thông báo người dùng.

## Nguyên — Gateway/config/shared review

Route `/api/inventory` đã có trên nền develop, không dựng route mới. Giữ chặn
`/internal/*`, forward Authorization và Idempotency-Key/correlation. Cần review
expose `X-Inventory-Reservation-State`/Idempotency-Key qua CORS nếu UI đọc các header;
UI có thể dùng operation GET như nguồn trạng thái bền vững.

Inventory dùng các biến URL/DB/JWT/broker đã có trong `.env.example`. Local hôm nay
thiếu INVENTORY_TEST_DATABASE_URL: test process dùng URL có cùng cấu hình kết nối
và basename inventory_test_db; tạo DB test riêng, không đổi `.env`, không migrate
inventory_db phát triển. Bổ sung biến vào cấu hình máy trước khi chạy lệnh test trực tiếp.

Migration 0003 thêm operation ledger/balances/return links, giữ raw constraints
0001/0002. Drift schema/migration sạch. CI sẵn loop phát hiện `test:db`; patch CI
thêm bootstrap Inventory và broker test URL. Chưa có GitHub Actions run cho nhánh này.
No shared event version/role/permission mới. Review ADR/schema/SQL và triển khai
reservation ở WO trước khi công bố tích hợp ISSUE hoàn chỉnh.

## Hatsady — UI và nghiệm thu

[Inventory API](../api/inventory.yaml) mô tả Part/Warehouse/Stock/ledger và usage.
Mỗi receive/adjust/issue/return tạo một UUID idempotency cho một lần người dùng xác
nhận; retry cùng nội dung giữ key. Lỗi 503/timeout của ISSUE có thể là PENDING.
Không tự retry với UUID mới; dùng operations GET/retry/abort.

ISSUE 201 có thể pending finalize: hiển thị đã xuất kho, WO reservation cần đồng bộ;
không báo đã hủy nếu response mạng mất. Abort 200 chỉ khi operation chưa commit,
trả ABORTED proof; committed abort 409 và cần RETURN. RETURN UI chọn usage gốc,
không tự chọn kho khác; usage read có net consumed và lịch sử từng lần trả.

Hiển thị decimal strings; mọi form validate lại qua backend. Technician chỉ có
read, Service Manager read, Inventory Staff manage/issue theo catalog hiện hành.
Customer không có Inventory. Không mở UI ISSUE như đã hoạt động trước khi Khương
nối reservation. Không dùng probe Notification hoặc fake WO để đánh dấu UAT pass.

## Minh — công việc còn lại sau bàn giao

- Review/ghép contract reservation thật với Khương; chạy lại inter-service terminal
  race, restart và settlement recovery qua Gateway. Hiện đây là dependency chưa có.
- Ghép C3 với Huy sau khi consumer/audience/recipient source được chốt; kiểm chứng
  hai đợt cảnh báo và replay với Notification inbox/API/UI thật.
- Tiếp nhận phản hồi schema/CI/deep link từ Nguyên/Hatsady; không coi peer review đã xong.

File này là bàn giao trong repository; chưa gửi message/issue hoặc yêu cầu phê duyệt
ngoài chat. Report kết quả chi tiết: [Minh M3 ngày 02/11](../reports/2026-11-02-minh-m3-inventory.md).

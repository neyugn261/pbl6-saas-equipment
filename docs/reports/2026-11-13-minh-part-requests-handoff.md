# Bàn giao Minh — PartRequest, giao nhận và đề nghị trả

Ngày: 13/11/2026. Baseline: `develop` tại `aaafaa4`, sau PR #73–75.
Nhánh triển khai local: `codex/minh-part-requests-20261113`.
Nguồn: task 1.4 của review 12/11 và bàn giao Khương do người dùng chuyển.

## 1. Kết quả và ý nghĩa nghiệp vụ

| Nội dung | Đã triển khai phía Inventory | Lợi ích/giới hạn |
| --- | --- | --- |
| Xin phụ tùng | Technician đang nhận WO hoặc SM lập thay; 1–50 dòng, part khác nhau, số lượng chuẩn đơn vị, lý do và snapshot. | Kho có đầu vào rõ ràng; tạo phiếu không đổi/giữ tồn. |
| Điều kiện WO | Chỉ ACCEPTED/TRAVELLING/IN_PROGRESS/ON_HOLD. | Đúng enum code; không thêm TRAVELING/DRAFT/RESOLVED/CLOSED vào WO. |
| Cấp một phần/đủ | Một dòng/kho/lần; khóa phiếu, version và hạn mức; lưu operation trước gọi WO. | Hai người kho không xuất vượt nhu cầu; đủ lượng tự đóng phiếu. |
| ISSUE/reservation | Dùng InventoryService.issue và protocol ADR 0014/0016 hiện có. | Không thay cơ chế terminal lock bằng GET status. |
| Proof tương thích | `request`/fingerprint giữ nguyên; thông tin phiếu/người nhận/version nằm trong businessContext local. | Hàm verifyInventoryProof hiện hành của Khương chấp nhận, không sửa Work Order. |
| Trách nhiệm nhận | Mỗi fulfill bắt buộc custodianUserId của KTV hiện tại đã ACCEPTED và handoverReference không trắng. | Phân biệt người nhận, thủ kho khởi tạo và người thực hiện recovery. Đây là tham chiếu biên nhận ký ngoài đời, chưa là chữ ký điện tử KTV. |
| Đổi KTV | Không đổi custodian; KTV mới có thể xác nhận dùng sau báo cáo của mình. | Phần chưa dùng/chưa trả vẫn thuộc người nhận cũ; không tạo bàn giao tay đôi trong hệ thống. |
| Đề nghị trả | Người nhận gốc hoặc SM lập thay, gắn WorkOrderPart/kho xuất gốc. | Được đề nghị sau đổi KTV hoặc WO terminal; không tự tăng tồn. |
| Nhận trả | Kho xác nhận thực nhận, cho phép nhận thiếu; RETURN và receipt cùng transaction. | GOOD vào khả dụng; DAMAGED/PENDING_INSPECTION vào cách ly; không nhận quá đề nghị hoặc quá lượng còn được trả. |
| Xung đột dùng/trả | Receipt và confirm-use dùng cùng primitive khóa Part → Warehouse → Stock → Usage. | Tổng đã trả + đã xác nhận dùng không vượt đã xuất. Đề nghị trả không khóa cứng lượng cần xác nhận dùng. |
| Hủy/đóng/từ chối | Version + lý do; không hủy/từ chối phần đã cấp/nhận; đóng phần còn lại giữ nghĩa vụ. | Không xóa lịch sử hoặc giả tạo hàng đã về kho. |
| Timeout/phục hồi | Giữ PENDING; dùng retry/abort/settlement hiện có, không timer tự hủy. | PENDING tính hạn mức; COMMITTED chờ finalize vẫn tính đã cấp. ABORTED chưa release chặn tạo lần cấp thay thế và quyết định phiếu. |
| Lịch sử | API /history có phân trang; audit create/prepare/outcome/settlement/decision/receipt. | Có actor, thời gian, lý do, số lượng, operation key; recovery lưu người thao tác thực và người khởi tạo gốc riêng. |
| Quyền/phạm vi | Staff-only, tenant và branch scope; Technician chỉ xem phiếu mình/WO hiện đang nhận, phiếu trả của mình/người giữ. | Không mở hàng chờ toàn tenant cho Technician, không cấp inventory:issue cho họ; khách không thấy phiếu nội bộ. |

Quy tắc dùng phụ tùng không đổi: **hoàn tất báo cáo → confirm-use**. Không thêm
điều kiện buộc confirm-use trước khi tạo report. Không coi hàng chưa trả là đã lắp
lên máy. Lịch sử khách tiếp tục chỉ công bố confirmed-use/correction qua API cũ.

## 2. API để tích hợp

Prefix Gateway: `/api/inventory`. Schema và payload đầy đủ ở
[OpenAPI](../api/inventory-part-requests.yaml); endpoint đã được liên kết từ
[Inventory API chính](../api/inventory.yaml).

| API | Người dùng |
| --- | --- |
| POST /work-orders/{id}/part-requests | KTV hiện tại đã nhận việc hoặc SM |
| GET /part-requests, GET /part-requests/{id} | Theo tenant/branch/WO/người tạo và quyền đọc |
| GET /part-requests/{id}/history | Cùng phạm vi chi tiết, phân trang đầy đủ |
| POST /part-requests/{id}/fulfillments | Kho có inventory:issue |
| POST /part-requests/{id}/reject, /cancel, /close | Theo hành động/người tạo/quyền SM/kho |
| POST /work-order-parts/{id}/return-requests | Người nhận gốc hoặc SM lập thay |
| GET /return-requests, GET /return-requests/{id}, /history | Kho/SM hoặc phạm vi phiếu trả của KTV |
| POST /return-requests/{id}/receipts | Kho có inventory:issue |
| POST /return-requests/{id}/cancel, /close | Hủy trước nhận hoặc đóng phần chờ có lý do |

Tạo phiếu/cấp/receipt dùng `Idempotency-Key` UUID. Cùng key khác nội dung bị 409.
Creation-command và stock-operation có namespace riêng. Không tái sử dụng key
giữa các thao tác nghiệp vụ khác nhau. Creation replay là snapshot ban đầu; GET
chi tiết để lấy tiến độ mới. Fulfill/receipt replay dùng **nguyên payload/version**;
đừng đổi expectedVersion rồi gửi lại cùng key. Với ISSUE treo dùng operation recovery.

Sau khi đóng phần còn lại, lượng có thể cấp/nhận ngay trả về 0. API vẫn giữ riêng
`quantityClosedWithoutIssue` / `quantityClosedWithoutReceipt` để thấy phần đã đóng
mà chưa cấp/nhận. Nghĩa vụ thực tế còn lại xem ở WorkOrderPart, không suy từ việc
phiếu đã đóng.

Ví dụ tạo phiếu (ID thay bằng dữ liệu thật trong phạm vi tài khoản):

```json
{
  "reason": "Kiểm tra xác định cần thay board điều khiển",
  "lines": [{ "partId": "<uuid-part>", "quantity": "2" }]
}
```

Ví dụ kho cấp một dòng:

```json
{
  "expectedVersion": 1,
  "lineId": "<uuid-line>",
  "warehouseId": "<uuid-warehouse>",
  "quantity": "1",
  "custodianUserId": "<uuid-current-accepted-technician-user>",
  "handoverReference": "BIEN-NHAN-2026-001"
}
```

`requestedBy` không mặc định là người nhận (SM có thể lập thay). Không dùng
`recordedBy` làm người chịu trách nhiệm trả (đó là thủ kho tạo giao dịch).
`allowedActions` chỉ là gợi ý theo trạng thái local; fulfillment vẫn kiểm tra WO,
người nhận, kho, version và reservation tại server. Version có thể tăng ở bước
prepare và outcome; sau thao tác cần tải lại, không tự cộng 1 ở UI.

## 3. Kiểm chứng và các nhận xét đã áp dụng

Đã kiểm thử HTTP Nest + PostgreSQL thật cho Inventory; tham chiếu WO/assignment
và transport reservation là fixture rõ ràng, trong đó gọi **hàm kiểm tra proof thật
của owner Work Order**. Đây chưa là nghiệm thu Web/Mobile hoặc toàn bộ stack qua
Gateway/Identity/Organization/WO chạy thật.

Các nhóm tình huống đã bao phủ:

- Bốn trạng thái cho phép, các trạng thái cấm và enum không đúng hợp đồng.
- Role/assignment/tenant/chi nhánh; list, count, detail, history không lộ dữ liệu;
  khách bị chặn và Tenant Admin không tự có quyền xuất kho.
- Idempotency tạo/cấp/đề nghị trả/receipt; khác payload, giả người nhận, biên nhận
  trắng, field thừa, null line, trùng part và số lẻ với phụ tùng tính chiếc.
- Hai fulfill cùng lúc; PENDING chiếm hạn mức; kho thiếu tồn/reservation từ chối;
  timeout/lost hold response/retry/abort/finalize không lặp xuất.
- KTV đổi người trong lúc ISSUE còn PENDING; ca cũ bị abort và release trước thay thế.
- KTV mới xác nhận dùng hàng người cũ nhận; người cũ đề nghị trả phần còn lại;
  nhận thiếu, nhận cách ly, WO terminal và Part/Warehouse INACTIVE.
- Hai đề nghị/receipt đồng thời; receipt cạnh tranh confirm-use; đóng phiếu không
  xóa lượng còn phải giải trình; dữ liệu legacy không bị suy diễn người nhận.
- Recovery do thủ kho khác thực hiện giữ riêng actor thực và actor khởi tạo.
- Migration áp dụng trên PostgreSQL tạm sạch, chạy lại và drift-check.

Kết quả lệnh kiểm tra cuối và số test được ghi ở
[bằng chứng kiểm tra](2026-11-13-minh-part-requests-evidence.txt).

Lượt đầu chạy toàn bộ test trên inventory_test_db sẵn có vướng fixture seed cũ
trùng warehouse primary key. Sau đó chạy toàn bộ trên PostgreSQL tạm mới, cùng
tên database được guard chấp nhận, tránh chỉnh/xóa dữ liệu cũ để làm test xanh.
Container tạm được dọn sau kiểm tra. Broker test dùng exchange/queue riêng và tự dọn.

## 4. Bàn giao cho các đầu mối

| Đầu mối | Việc cần làm/nghiệm thu |
| --- | --- |
| Nguyên/Web | Màn xin phụ tùng cho SM; hàng chờ kho, bộ lọc WO/status, chi tiết từng dòng và lịch sử; form người nhận/biên nhận; cấp một phần, từ chối/đóng, nhận trả thiếu/cách ly và lỗi có hướng xử lý. |
| Người phụ trách Mobile | Tạo/theo dõi phiếu xin; đề nghị trả bằng tài khoản người nhận gốc; nối confirm-use API cũ sau report; không gọi RETURN trực tiếp hoặc tự tăng tồn. Lượt này không sửa Mobile. |
| Khương | Review enum/assignment, thử luồng thật với WO; terminal race khi ISSUE HELD, đổi KTV khi PENDING và sau COMMITTED; verifyInventoryProof/protocol hiện tại không cần sửa. |
| Huy/Notification | Nếu nhóm cần thông báo phiếu, chốt event/audience/retry/outbox trước triển khai. Hiện chưa có event mới; dùng hàng chờ API để vận hành. |
| Owner file dùng chung | Review ADR 0023, ERD SQL, API/schema và yêu cầu tách PR contract trước code theo CONTRIBUTING khi đưa lên Git. |
| Nhóm nghiệm thu | Chạy Web/Mobile thật qua Gateway và đối chiếu biên nhận ngoài đời; thống nhất ai ghi handoverReference và cách lưu bản ký thực tế. |

Không yêu cầu thêm API WO chỉ để hoàn thành backend Inventory này. Điểm cần các
owner hoàn thiện tiếp chủ yếu là UI/tích hợp/nhận thông báo và nghiệm thu xuyên service.

## 5. Giới hạn và việc chưa chốt

- Kiểm tra assignment và ký biên nhận ngoài đời không là transaction xuyên DB.
  Không có chuyển giao trách nhiệm tay đôi tự động; đây là lựa chọn của bàn giao.
- API ISSUE trực tiếp cũ vẫn phục vụ thao tác có quyền. Các lần xuất thiếu thông tin
  người nhận (bao gồm legacy/direct) chưa cho KTV tự đề nghị trả; kho đối soát qua
  RETURN cũ. Không bịa người nhận từ người xuất để làm đầy lịch sử.
- Chưa có chữ ký điện tử KTV nhận hàng; trường handoverReference là căn cứ do kho ghi.
- PartRequest mở không tự chặn hoàn tất WO hoặc đồng nghĩa được khách duyệt phát
  sinh chi phí. Chấp thuận dự toán/phạm vi công việc thuộc luồng SR/WO hiện hành.
- Task 1.3 về ngày dự kiến bàn giao vẫn cần chốt nhu cầu riêng. Không thay đổi
  ngày thực tế hoặc hiệu lực bảo hành trong đợt phụ tùng này.
- Các phát hiện audit toàn hệ thống như activation khi tenant bị khóa, topology
  RabbitMQ, vòng đời thiết bị RETIRED hoặc xác nhận thay khách không được coi là đã
  xử lý chỉ vì hoàn thành PartRequest. Cần owner và đợt sửa riêng.
- Contract và code được đóng gói thành PR riêng; trạng thái review/CI/merge xem
  trên GitHub. Chưa triển khai lên môi trường chung; database demo chưa áp dụng
  migration mới trong lượt này. 12 file local từ trước được giữ nguyên.

## 6. Chạy sau khi review

```powershell
pnpm build:packages
pnpm --filter inventory-service db:migrate
pnpm --filter inventory-service build
```

`pnpm dev:backend` của baseline hiện tại đã tự build packages và chạy migrations.
Môi trường test cần INVENTORY_TEST_DATABASE_URL đúng database inventory_test_db;
test broker cần RABBITMQ_TEST_URL hoặc cấu hình local tương ứng. Không chạy db push,
không sửa migration 0001–0005 và không reset/seed lại dữ liệu demo để cập nhật schema.

File chính: [schema](../../apps/inventory-service/prisma/schema.prisma),
[migration](../../apps/inventory-service/prisma/migrations/0006_inventory_requests/migration.sql),
[controller](../../apps/inventory-service/src/part-requests/requests.controller.ts),
[service](../../apps/inventory-service/src/part-requests/requests.service.ts),
[repository](../../apps/inventory-service/src/part-requests/requests.repository.ts),
[transaction hooks](../../apps/inventory-service/src/part-requests/requests.transactions.ts),
[integration tests](../../apps/inventory-service/test/part-requests.integration.ts).

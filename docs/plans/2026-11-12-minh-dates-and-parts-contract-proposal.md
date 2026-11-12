# Minh — đề xuất contract ngày dự kiến và yêu cầu phụ tùng

Ngày: 12/11/2026. Liên quan task 1.3 và 1.4 trong bản review làm việc local `2026-11-12-review-loi-va-phan-cong.md`. Tài liệu nguồn này được giữ ngoài nhóm commit triển khai; proposal dưới đây tự mô tả phạm vi và các quyết định còn mở.

**Trạng thái: ĐỀ XUẤT ĐỂ CHỐT CONTRACT, CHƯA TRIỂN KHAI.** Những API/model/trạng thái mới trong tài liệu này chưa tồn tại trên server. Task 1.3 yêu cầu xác định nhu cầu trước khi sửa schema; task 1.4 yêu cầu thiết kế và phối hợp Work Order trước khi triển khai. Tài liệu là đầu ra thiết kế cho hai task này, không phải xác nhận backend đã phục vụ các luồng mới.

Giữ nguyên giới hạn dự án: phụ tùng phục vụ dịch vụ sau bán hàng, không có procurement, hóa đơn/thanh toán hoặc điều động liên chi nhánh. Mobile thuộc đầu mối riêng.

## 1. Task 1.3 — ngày dự kiến và ngày thực tế

### 1.1. Hiện trạng đã xác minh

- `RegistrationService.checkDates()` chỉ bắt buộc `handoverDate` khi hoàn tất đăng ký. `installationDate` và `commissionedDate` có thể thiếu.
- Các trường trên đang mang nghĩa ngày thực tế; không cho tương lai là phù hợp.
- STORE không áp dụng ngày lắp đặt/vận hành. CUSTOMER_SITE có quy trình khách xác nhận nội dung bàn giao.
- Các ngày thực tế và chính sách có thể bị đóng băng sau khi gửi xác nhận/hoàn tất. Không cập nhật trực tiếp để bỏ qua snapshot đã gửi khách.
- Đã bổ sung kiểm thử hồi quy bằng API/DB cho trường hợp chỉ nhập ngày bàn giao, thiếu ngày bàn giao và từng ngày thực tế ở tương lai. Xem kết quả trong [bàn giao](../reports/2026-11-12-minh-review-implementation-handoff.md).

### 1.2. Nhu cầu và thiết kế tối thiểu đề xuất

| Trường/nhóm dữ liệu | Ý nghĩa | Quy tắc đề xuất |
| --- | --- | --- |
| `plannedHandoverDate` mới | Ngày doanh nghiệp dự định bàn giao, dạng date-only | Có thể tương lai, tùy chọn, không tự đặt bất kỳ ngày thực tế nào. |
| `handoverDate` hiện có | Ngày bàn giao đã xảy ra | Bắt buộc khi hoàn tất theo quy trình hiện hành, không tương lai. |
| `installationDate`, `commissionedDate` hiện có | Ngày lắp đặt/vận hành đã xảy ra nếu có | Tùy chọn; không tự sao chép từ ngày bàn giao; STORE vẫn không áp dụng. |
| Ghi chú kế hoạch | Hướng dẫn sắp xếp công việc | Tách khỏi điều khoản/biên bản đã gửi khách; không tạo quyền truy cập mới. |

Chỉ đề xuất ngày bàn giao dự kiến trước. Ngày lắp đặt/vận hành dự kiến hoặc lịch hẹn có giờ, đội lắp đặt, nhắc lịch là nhu cầu mở rộng, chưa đưa vào bản tối thiểu.

### 1.3. API/schema dự kiến sau khi chốt

- Asset sở hữu `plannedHandoverDate` trên EquipmentRegistration; không tạo ngày này trên Warranty/Maintenance Plan.
- Có thể thêm vào DTO tạo/sửa draft cùng `expectedVersion` cho sửa; trả trong projection nhân viên, ghi before/after trong audit local.
- Migration additive, nullable; hồ sơ cũ để null, không suy ngược ngày dự kiến từ ngày thực tế.
- Chỉ chỉnh kế hoạch ở DRAFT trong bản tối thiểu. Nếu cần dời lịch sau khi gửi biên bản, cần thiết kế điều chỉnh/thu hồi phiên bản riêng, không sửa nội dung khách đang chờ xác nhận.
- UI hiển thị riêng “Dự kiến bàn giao” và “Đã bàn giao ngày”; chưa nhập ngày thực tế thì hiển thị chưa ghi nhận.
- Ngày dự kiến không kích hoạt bảo hành, sinh Maintenance Task hoặc xác nhận thiết bị đã hoạt động. Hiệu lực chính sách vẫn theo quy trình Model/Registration hiện hành.

### 1.4. Các điểm cần chủ nghiệp vụ/Nguyên chốt trước code

1. Nhóm có cần trường ngày dự kiến trong đợt hiện tại không? Đề xuất có nếu cần lập hồ sơ cho tuần sau.
2. Bản tối thiểu chỉ sửa DRAFT có đáp ứng vận hành không? Nếu cần dời lịch sau gửi, phải bổ sung quy trình version trước.
3. Khách có cần thấy lịch dự kiến ngay khi draft hay chỉ khi doanh nghiệp công bố? Đề xuất draft là dữ liệu nhân viên; phần công bố cần contract rõ.

Chưa chốt thì giữ nguyên schema và kiểm tra ngày thực tế. Không bỏ điều kiện `d > today`.

## 2. Task 1.4 — sở hữu và nguyên tắc phụ tùng

Inventory sở hữu Part Request, dòng nhu cầu, liên kết cấp phát, đề nghị trả, xác nhận nhập trả và lịch sử của các đối tượng này. Work Order sở hữu quyền kỹ thuật viên, trạng thái công việc, báo cáo và reservation chặn ISSUE khi WO đóng/hủy. Các ID là logical reference; mỗi service dùng DB riêng, không FK hoặc truy vấn chéo DB.

| Vai trò | Trách nhiệm đề xuất |
| --- | --- |
| Technician | Xin phụ tùng cho WO đang được giao; đọc tình trạng yêu cầu, xác nhận dùng theo báo cáo và đề nghị trả lượng còn giữ. |
| Service Manager | Lập nhu cầu thay đội kỹ thuật nếu có quyền WO phù hợp; xem tiến độ trong phạm vi chi nhánh. |
| Inventory Staff | Xử lý hàng chờ, cấp một phần/đủ, từ chối có lý do, nhận hàng trả và phân loại tình trạng. |
| Tenant Admin | Không tự được quyền ghi kho hoặc thực hiện thay kỹ thuật viên chỉ vì có quyền quản trị tenant. |
| Customer | Chỉ xem lịch sử phụ tùng được công bố sau xác nhận sử dụng qua projection hiện hành; không xem hàng chờ kho/nội dung nội bộ. |

Tái sử dụng catalog quyền cố định: tạo nhu cầu dùng `work_order:execute` và ràng buộc người được giao, hoặc `work_order:manage` cho Service Manager theo quyền hiện có; xử lý kho dùng `inventory:issue`; đọc dữ liệu dùng quyền hiện hành kết hợp phạm vi. Cần kiểm tra catalog và thống nhất chính xác điều kiện OR ở controller/service trước khi code, không thêm role tùy chỉnh.

Technician hiện đã có `inventory:read`; không cấp thêm quyền ghi kho để thực hiện đề nghị trả. Nếu thay đổi quyền đọc catalog sau này, cung cấp projection mã/tên/đơn vị phù hợp, không buộc Mobile truy cập API quản trị.

## 3. Contract Part Request đề xuất

### 3.1. Dữ liệu

Header: `id`, `requestNo` dễ đọc, `tenantId`, `branchId`, `workOrderId`, `equipmentId`, `customerId`, `requestedBy`, `reason`, `version`, `createdAt`, `closedAt`, trạng thái đóng và lý do. Liên kết Equipment/Customer/Branch lấy từ WO đã xác minh, không tin giá trị client gửi.

Dòng: `id`, `partId`, snapshot mã/tên/đơn vị, `quantityRequested`, tổng cấp đã COMMITTED, lượng đang chờ xử lý, lịch sử quyết định. Một yêu cầu không có hai dòng trùng partId. Số lượng tuân thủ đơn vị và `allowFractional` hiện hành; không làm tròn âm thầm.

Phân biệt hai trục:

- Vòng đời header: `OPEN`, `CLOSED`, `CANCELLED`, `REJECTED`; CLOSED có thể là đã cấp đủ hoặc đóng phần còn lại với lý do.
- Tình hình cấp phát suy ra: `NOT_ISSUED`, `PARTIALLY_ISSUED`, `FULLY_ISSUED`. Không thêm các trường trạng thái cập nhật tay gây lệch tổng.

Khi yêu cầu đã có cấp phát, không cho REJECTED/CANCELLED xóa nghĩa vụ phần đã cấp. Dùng đóng phần chưa cấp có lý do. Dòng nhu cầu đã gửi không sửa đè số lượng/part; thay đổi bằng yêu cầu bổ sung hoặc đóng phần còn lại, giữ lịch sử.

Trả lại hàng không tự giảm tổng đã cấp hoặc mở lại nhu cầu cũ. Nếu cần thay thế hàng đã trả/hỏng bằng một lần cấp mới, tạo nhu cầu bổ sung có liên kết nguồn và lý do để không đếm sai tiến độ.

### 3.2. API dự kiến — chưa được implement

| Phương thức/đường dẫn tương đối Inventory | Mục đích | Điều kiện chính |
| --- | --- | --- |
| `POST /work-orders/{id}/part-requests` | Tạo nhu cầu | Idempotency-Key UUID; WO thuộc tenant/chi nhánh, đang mở, quyền người yêu cầu hợp lệ. |
| `GET /part-requests?workOrderId=&status=&page=&pageSize=` | Hàng chờ kho hoặc danh sách theo WO | Phân trang; luôn lọc ở server theo quyền/phạm vi. |
| `GET /part-requests/{id}` | Chi tiết và tiến độ từng dòng | Không lộ hồ sơ khác tenant/chi nhánh, có các hành động được phép. |
| `POST /part-requests/{id}/fulfillments` | Kho cấp hàng cho một dòng | `lineId`, `warehouseId`, `quantity`, ghi chú; tái sử dụng operation ISSUE/reservation. |
| `POST /part-requests/{id}/reject` | Từ chối nhu cầu chưa cấp | `expectedVersion`, lý do; không được có lượng đã cấp hoặc ISSUE còn chưa xác định. |
| `POST /part-requests/{id}/cancel` | Người yêu cầu hủy nhu cầu chưa cấp | `expectedVersion`, lý do, chỉ trước cấp và không có ISSUE treo. |
| `POST /part-requests/{id}/close` | Đóng phần nhu cầu còn lại | `expectedVersion`, lý do, giữ toàn bộ giao dịch đã cấp và nghĩa vụ đối soát. |

Ví dụ tạo nhu cầu:

```json
{
  "reason": "Kiểm tra xác định cần thay board điều khiển",
  "lines": [{ "partId": "<uuid-part>", "quantity": "1" }]
}
```

Đề xuất giới hạn 1–50 dòng, reason không trắng và tối đa 2000 ký tự; sử dụng DTO/parser số lượng hiện hành. Client không gửi tenantId, branchId, actorId hoặc quantityIssued.

### 3.3. Cấp phát và cạnh tranh ghi

1. Khóa dòng yêu cầu và phần đang giữ cho ISSUE; kiểm tra số xin cấp còn có thể đáp ứng.
2. Tạo liên kết dòng với InventoryOperation trước gọi WO; quantity đang xử lý phải tính vào giới hạn chưa cấp để hai thủ kho không xuất vượt nhu cầu.
3. Dùng cơ chế reservation hiện hành. Việc gửi yêu cầu chỉ là kiểm tra tham chiếu tại thời điểm đó; **ISSUE vẫn phải reserve WO** để chặn race với hoàn tất/hủy.
4. Ghi stock ledger, WorkOrderPart và liên kết fulfillment trong transaction Inventory khi COMMITTED. Tính tổng cấp từ liên kết đã commit, không tăng số cấp khi chỉ nhận HTTP 202/503 hoặc timeout.
5. Retry/abort sử dụng cùng operation key; giải phóng phần đang chờ chỉ khi trạng thái đã xác định ABORTED. COMMITTED chờ finalize vẫn là hàng đã xuất, không xuất lại.
6. Đóng/hủy request khi ISSUE đang chưa xác định phải trả lỗi có hướng dẫn đối soát; không tự đoán rollback.
7. Mỗi lệnh cấp xử lý một dòng/kho; một pick-list nhiều dòng có thể thành công một phần và UI phải thể hiện từng kết quả. Không giả định transaction nguyên tử giữa Inventory và Work Order.

Nhu cầu mở không giữ số lượng tồn kho. `quantityPendingIssue` của yêu cầu và reservation chống đóng WO khác với “đặt giữ hàng trong kho”. Không trình bày số này là tồn đã được giữ cho khách.

## 4. Contract đề nghị trả và xác nhận nhận hàng

### 4.1. Dữ liệu và API đề xuất — chưa được implement

Một đề nghị trả gắn **WorkOrderPart** cụ thể, không chỉ gắn partId: `id`, `returnRequestNo`, `workOrderPartId`, `workOrderId`, kho xuất gốc, người đề nghị, số lượng đề nghị, ghi chú, version, tổng nhận và lịch sử kho.

| Phương thức/đường dẫn tương đối Inventory | Mục đích | Điều kiện chính |
| --- | --- | --- |
| `POST /work-order-parts/{id}/return-requests` | Người đang chịu trách nhiệm đề nghị trả | Idempotency-Key, quantity/note; chưa tăng tồn. |
| `GET /return-requests?workOrderId=&status=&page=&pageSize=` | Theo dõi/nhận hàng trả | Đúng tenant, chi nhánh và phạm vi WO; không mở cho khách. |
| `GET /return-requests/{id}` | Chi tiết đề nghị và các lần nhận | Hiển thị kho nhận gốc, lượng còn chờ và người phụ trách. |
| `POST /return-requests/{id}/receipts` | Kho xác nhận một lần thực nhận | Idempotency-Key, expectedVersion, quantity, condition, note; tạo RETURN bằng primitive hiện có. |
| `POST /return-requests/{id}/cancel` | Hủy đề nghị chưa nhận | Chỉ khi chưa có receipt; có version/lý do. |
| `POST /return-requests/{id}/close` | Đóng phần đề nghị chưa nhận | Có lý do, giữ phần chưa giải trình của WorkOrderPart; không giả tạo hàng đã nhận. |

Trạng thái mở/đóng tách khỏi tình hình nhận suy ra `NOT_RECEIVED`, `PARTIALLY_RECEIVED`, `RECEIVED`. Nhận 2/3 vẫn phải thấy còn 1 chờ nhận; ghi chú lý do nhận thiếu. Đóng đề nghị không xóa trách nhiệm đối soát lượng chưa trả/chưa dùng.

### 4.2. Quy tắc bắt buộc

- Tổng nhận không vượt lượng đã đề nghị còn mở và lượng còn được RETURN theo WorkOrderPart; tổng đề nghị đang mở cũng phải được giới hạn, không xin trả cùng một lượng ở nhiều phiếu.
- Đề nghị trả là tín hiệu dự kiến, không làm giảm lượng có thể confirm-use. Nếu sau đó có xác nhận dùng, lúc nhận hàng kho phải kiểm tra lại số còn được trả và giải thích xung đột thay vì tăng tồn quá mức.
- Người đề nghị phải được xác minh với WO/assignment và trách nhiệm giao nhận. Chốt trường hợp WO đã kết thúc, kỹ thuật viên đổi người hoặc không còn assignment hiện tại với Khương; không dùng mỗi ID trên client.
- Kho nhận về đúng kho đã xuất. Cho phép nhận sau khi WO đóng hoặc Part/Warehouse INACTIVE theo quy tắc RETURN hiện hành.
- `GOOD` vào tồn khả dụng; `DAMAGED`/`PENDING_INSPECTION` vào cách ly. Kiểm tra RELEASE/SCRAP tái sử dụng API hiện hành, không xây lại ledger khác.
- Một receipt tạo một RETURN trong cùng transaction Inventory, có unique link để retry không nhận trùng. Client không gửi số tồn trước/sau, người nhận hoặc kho đích tùy ý.
- Phụ tùng cũ tháo từ máy được mô tả trong xác nhận dùng/báo cáo, không nhập trả như linh kiện mới đã xuất.

## 5. API hiện có cần tái sử dụng

| API đang tồn tại | Chủ thể và mục đích | Điều cần giữ |
| --- | --- | --- |
| `POST /work-orders/{id}/parts` | Inventory Staff xuất phụ tùng | `inventory:issue`, idempotency, durable WO reservation, ledger hiện hành. |
| `POST /work-order-parts/{id}/confirm-use` | Technician của báo cáo đã hoàn tất xác nhận dùng | `work_order:execute` và `service_report:submit`; report/assignment thực; không thay API bằng endpoint trùng. |
| `POST /work-order-parts/{id}/return` | Kho ghi nhận thực trả | `inventory:issue`; không gọi trực tiếp từ nút đề nghị trả của Technician. |
| `POST /usage-confirmations/{id}/reverse` | Kho sửa xác nhận dùng sai có lý do | Giữ nguyên bản ghi và lịch sử; không xóa giao dịch. |
| `POST /stock-transactions/{id}/inspect` | Kho xử lý hàng cách ly | Giới hạn theo return gốc, không double-release/scrap. |

Confirm-use hiện yêu cầu `serviceReportId`, số lượng, lý do công bố cho khách và xử lý linh kiện cũ theo DTO hiện hành. Luồng hoàn tất báo cáo → confirm-use phải được giữ để tránh vòng chờ.

## 6. Quyền, lỗi và phục hồi

- Xác minh tenant/chi nhánh/WO trước trả dữ liệu; ID ngoài phạm vi trả 404 hoặc 403 theo convention hiện hành, không làm lộ tồn tại tài nguyên khác phạm vi.
- Tham chiếu liên service dùng JWT người gọi, correlation id và endpoint đã có; không truy vấn DB khác hoặc tự tạo token toàn quyền.
- Cùng idempotency key + payload trả lại kết quả, payload khác trả 409; optimistic version cho quyết định đóng/từ chối/nhận. Retry vẫn kiểm tra quyền hiện tại.
- Phân biệt `REQUEST_NOT_OPEN`, `REQUEST_VERSION_CONFLICT`, `REQUEST_PENDING_ISSUE`, `QUANTITY_EXCEEDED` và lỗi dependency với thông báo có hành động tiếp theo. Tên code mới là đề xuất, cần chốt contract.
- Khi dependency lỗi phải fail closed cho thao tác cần xác minh. Không báo đã cấp/đã nhận chỉ vì client mất kết nối; tra operation/receipt theo key.
- Không tạo state `UNCERTAIN` thay cho PENDING/COMMITTED/ABORTED hiện có. UI có thể ghi chưa xác định kết quả và hướng dẫn đối soát.
- Mọi thay đổi ghi audit actor/thời gian/lý do/số lượng/link nguồn trong transaction local. Nội dung request/phiếu trả nội bộ không đi vào projection lịch sử khách.

## 7. Đầu mối và điều kiện bắt đầu triển khai

| Đầu mối | Nội dung cần chốt/đầu ra |
| --- | --- |
| Minh | Schema additive Inventory, state machine, idempotency/fulfillment/receipt atomicity, OpenAPI sau khi thống nhất. |
| Khương | Quyền tạo nhu cầu theo assignment/WO, trách nhiệm phụ tùng sau đổi người/WO terminal, khả năng đọc tham chiếu; giữ reservation hiện hành. |
| Nguyên/người phụ trách Web | Hàng chờ kho, tiến độ cấp một phần, nhận thiếu, phục hồi thao tác, dữ liệu và nhãn UI. |
| Người phụ trách Mobile | Gửi nhu cầu, xác nhận dùng qua API cũ, đề nghị trả; không được cấp inventory:issue để tăng tồn. |
| Huy | Nếu cần notification: người nhận, chống trùng, chỉ gửi sau commit; hàng chờ vẫn hoạt động khi notification chậm. |

Cần thống nhất các quyết định cụ thể trước triển khai: quyền Service Manager tạo nhu cầu, đối tượng chịu trách nhiệm phụ tùng khi đổi kỹ thuật viên, bằng chứng giao nhận ở mức tối thiểu, và hợp đồng fulfillment/receipt nêu trên. Đây là thay đổi schema/API nhiều service nên tuân thủ yêu cầu báo cáo phương án trước của AGENTS.md; chưa có migration hoặc route mới nào cho phần proposal trong lượt này.

## 8. Checklist nghiệm thu sau triển khai

1. Gửi trùng yêu cầu không sinh hai phiếu; cùng key khác payload bị từ chối.
2. Không gửi yêu cầu cho WO ngoài quyền/chi nhánh/tenant; WO terminal không phát sinh ISSUE mới.
3. Tạo nhu cầu không đổi tồn; cấp một phần hiển thị đúng phần chờ, chưa tự coi đã nhận/dùng.
4. Hai người kho cấp cùng dòng không vượt nhu cầu; thiếu tồn không ghi ledger một phần ngoài ý muốn.
5. Timeout ISSUE rồi retry/abort không trùng xuất hoặc giải phóng phần đang xử lý sai thời điểm.
6. Hoàn tất/hủy WO trong lúc ISSUE tuân thủ reservation; Part Request mở không tự làm WO bị khóa vô hạn.
7. Báo cáo hoàn tất rồi confirm-use thành công theo API cũ; không thêm vòng chờ.
8. Đề nghị trả không tăng tồn; kho nhận 2/3 chỉ ghi 2 và giữ 1 chờ/giải trình.
9. Nhận hàng hỏng vào cách ly; trả sai kho hoặc quá lượng còn lại bị từ chối.
10. Hai receipt đồng thời hoặc receipt cạnh tranh confirm-use vẫn giữ giới hạn dùng + trả không vượt đã xuất.
11. Hủy/đóng phần chờ không xóa cấp phát, receipt hoặc nghĩa vụ phần đã nhận giữ.
12. Đổi kỹ thuật viên, WO terminal hoặc tài khoản hết quyền xử lý đúng chính sách đã chốt.
13. List/detail/count và các liên kết nguồn không lộ dữ liệu ngoài phạm vi; khách chỉ thấy lịch sử đã công bố.
14. Nếu có thông báo, retry event không gửi trùng và không phát thông báo trước khi giao dịch commit.

## 9. Tài liệu nền

- [ADR 0014 — giao dịch và reservation Inventory](../decisions/0014-inventory-m3-transactions-and-reservations.md).
- [ADR 0015 — đối soát và xác nhận dùng](../decisions/0015-inventory-accountability-and-service-parts.md).
- [ADR 0016 — reservation phía WO](../decisions/0016-workorder-inventory-reservations.md).
- [Inventory API](../api/inventory.yaml), [accountability](../api/inventory-accountability.yaml), [reservation](../api/inventory-reservations.yaml).
- [Registration API hiện hành](../api/equipment-registration.yaml).

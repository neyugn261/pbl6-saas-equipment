# ADR 0023 — Phiếu xin phụ tùng, trách nhiệm nhận và đề nghị trả

Ngày: 13/11/2026. Phạm vi: Inventory của Minh. Người dùng chuyển bàn giao của
Khương và yêu cầu tiếp tục triển khai proposal ngày 12/11. Giữ ADR 0014–0016.

## Quyết định

- Tạo PartRequest chỉ khi WO `ACCEPTED`, `TRAVELLING`, `IN_PROGRESS`, `ON_HOLD`.
  `TRAVELLING` là enum hiện có tương ứng “TRAVELING” trong bàn giao. WO mới là
  `CREATED`; không thêm DRAFT/RESOLVED/CLOSED vào enum WO. Dùng allowlist để chặn
  cả trạng thái kết thúc và trạng thái chưa biết.
- Technician tạo khi đang là người được phân công và đã nhận việc. Service Manager
  có `work_order:manage` có thể tạo thay; Inventory Staff không tự tạo nhu cầu
  kỹ thuật chỉ nhờ có quyền ghi kho. Các ID tenant/chi nhánh/máy/khách lấy từ WO.
- Phiếu chỉ ghi nhu cầu, không giữ tồn và không khóa hoàn tất WO. Dòng bất biến,
  không trùng partId, 1–50 dòng. Đổi nhu cầu bằng phiếu mới/đóng phần chưa cấp.
- Fulfill một dòng/kho/lần bằng ISSUE hiện có, gồm durable reservation trước ghi
  stock. Liên kết operation với dòng được lưu trước gọi WO. PENDING tính vào hạn
  mức; chỉ COMMITTED tính đã cấp. Retry/abort dùng cùng operation key, không timeout
  tự giải phóng. COMMITTED chờ finalize vẫn là đã cấp.
- Liên kết phiếu, version và người nhận nằm trong `businessContext` local của
  InventoryOperation. `request` và fingerprint proof gửi WO giữ đúng allowlist
  hiện hành. Idempotency Inventory so sánh cả proof identity và businessContext;
  đổi người nhận/biên nhận/phiếu khi dùng lại key bị từ chối.
- Mỗi lần cấp qua phiếu ghi `custodianUserId` là KTV hiện tại đã ACCEPTED và
  `handoverReference` là mã/căn cứ biên nhận thực tế do kho ghi. Đây là ghi nhận
  biên nhận ngoài đời, không phải chữ ký số hay chữ ký khách trong ServiceReport.
  Người nhận ban đầu chịu trách nhiệm số chưa trả/chưa xác nhận dùng. Đổi KTV
  không chuyển trách nhiệm trong hệ thống. KTV mới có thể dùng đồ được bàn giao
  ngoài đời và xác nhận dùng theo báo cáo của mình, hoặc tạo phiếu xin mới.
- Không suy người nhận từ `recordedBy` (đó là thủ kho). Dữ liệu cũ có thể chưa rõ
  người nhận; vẫn trả bằng API RETURN hiện có với kho, không bịa trách nhiệm cũ.
- Người nhận ban đầu có thể đề nghị trả sau đổi KTV/WO kết thúc; vẫn phải là staff
  đang có quyền và trong chi nhánh. SM có thể lập thay, không đổi người chịu trách
  nhiệm. Đề nghị không tăng tồn. Chỉ kho xác nhận thực nhận mới gọi RETURN trong
  cùng transaction với liên kết receipt. GOOD khả dụng, hàng hỏng/chờ kiểm cách ly.
- Tổng đề nghị mở không vượt lượng còn có thể trả tại lúc tạo. Confirm-use vẫn
  được thực hiện sau báo cáo; receipt kiểm tra lại lượng thực có thể trả. Nhận
  thiếu giữ phần chờ; đóng phiếu không xóa nghĩa vụ của WorkOrderPart.
- Vòng đời phiếu OPEN/CLOSED/CANCELLED/REJECTED tách tiến độ cấp/nhận suy ra.
  Đủ lượng tự CLOSED. Hủy/từ chối chỉ trước cấp/nhận; CLOSE phần còn lại có lý do.
  Có optimistic version. PENDING ISSUE hoặc ABORTED chưa settle chặn quyết định
  đóng/hủy/từ chối; hướng dẫn kho xử lý operation trước.
- Mọi quyết định, chuẩn bị cấp, kết quả cấp/abort và receipt có audit trong DB
  Inventory. Khách không đọc phiếu nội bộ; chỉ đọc confirmed-use theo ADR 0015.
  List/detail luôn lọc tenant/branch; Technician chỉ đọc phiếu của mình hoặc WO
  hiện được giao, không được đọc hàng chờ toàn chi nhánh.

## Tích hợp và giới hạn

Không đổi protocol reservation, quyền/role, Mobile, Web hoặc event dùng chung.
API mới đi qua prefix Gateway `/api/inventory` hiện có. API tham chiếu WO dùng JWT
người gọi; không SQL xuyên DB. Kiểm tra assignment lúc xin/cấp không là transaction
nguyên tử với đổi assignment ở service WO; reservation giữ bảo đảm terminal/ISSUE
hiện hành. Kho cần kiểm tra người nhận thực tế khi ký biên nhận. Xác nhận điện tử
của KTV và chuyển giao trách nhiệm tay đôi chưa được triển khai theo bàn giao.

Ngày bàn giao dự kiến (task 1.3) còn là proposal riêng; không bỏ validate ngày thực
tế hoặc tự triển khai lịch hẹn. Thông báo phiếu là phần bàn giao Huy; hàng chờ hoạt
động bằng API ngay cả khi chưa có notification.

Contract: [Inventory part requests](../api/inventory-part-requests.yaml).

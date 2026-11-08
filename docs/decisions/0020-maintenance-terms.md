# ADR 0020 — Thời hạn bảo trì theo từng lịch Model

Ngày: 08/11/2026. Triển khai theo yêu cầu người dùng; chờ review của owner.
Bổ sung ADR 0018, giữ ownership database và RBAC hiện tại.

Mỗi Schedule Rule có `term`: `YEARS` (1–100 năm), `UNLIMITED`, hoặc
`WARRANTY_END`. Thời hạn độc lập với chu kỳ và kỳ đầu. Các lịch cùng Model có
thể dùng thời hạn khác nhau. Không tạo hợp đồng, hóa đơn hay luồng thu phí.

- YEARS lấy ngày bàn giao cộng số năm, clamp cuối tháng/năm nhuận. Ngày kết
  thúc là inclusive, gồm kỳ đúng ngày kỷ niệm: lịch hàng năm trong 2 năm có
  thể thực hiện cả kỳ năm thứ nhất và thứ hai.
- WARRANTY_END lấy đúng endDate inclusive của bảo hành đã chọn và điều chỉnh
  khi bàn giao. Không có bảo hành APPLY thì từ chối preview. Đổi/gia hạn/VOID
  bảo hành sau này không ngầm đổi thời hạn bảo trì đã xác nhận.
- UNLIMITED không có ngày kết thúc; Service Manager có thể pause/ngừng theo
  API hiện có. Đây không phải cam kết mọi công việc đều miễn phí.
- Kỳ đầu sau ngày kết thúc bị từ chối ngay khi preview, trước khi tạo Warranty
  hoặc nhóm Plan. Cần sửa chu kỳ/thời hạn hoặc điều chỉnh kỳ đầu hợp lệ.

Asset lưu term và các ngày đã tính trong policyPreview bất biến. Maintenance
kiểm tra source/hash và tự tính lại từ snapshot nguồn, lưu `term_mode`,
`term_years`, `end_date` trên Plan. Chọn default mới không đổi máy cũ. Override
thời hạn bảo hành khi bàn giao tự tính lại lịch WARRANTY_END trong preview.
Retry nhóm Plan vẫn dùng đúng registration identity/hash/receipt cũ.

Scheduler chỉ sinh kỳ trong thời hạn, kể cả ngày cuối. Khi ngày Việt Nam đã
qua end_date, chuyển Plan ACTIVE thành INACTIVE và ghi PLAN_TERM_ENDED một
lần; không tạo bù task mới của gói đã hết hạn sau downtime. Plan PAUSED vẫn
dừng và không được resume sau hạn. Sửa chu kỳ/resume không kéo dài end_date.
Task, WO và các kết quả đã sinh giữ nguyên, vẫn có thể tiếp tục xử lý hoặc
yêu cầu WO thay thế theo quyền/trạng thái hiện hành.

API trả `hasNextOccurrence` để phân biệt next_due_date kỹ thuật đã vượt hạn.
Summary không chọn các kỳ ngoài hạn hoặc thuộc gói đã hết hạn làm lịch sắp tới;
các task cũ cần xử lý vẫn được đếm. Không thêm trạng thái EXPIRED ngoài catalog.

Tương thích: term vắng trên policy/snapshot cũ có nghĩa lịch không giới hạn.
Migration chỉ bổ sung cột, default UNLIMITED cho Plan đang có. Không sửa JSON
published, không đổi hash của setup PENDING, không backfill ngày hết bảo trì
từ ngày hết bảo hành. Muốn áp dụng hữu hạn cho máy cũ phải chốt thay đổi riêng;
đợt này không tự thay cam kết của các hồ sơ đã bàn giao.

Không đổi payload event TaskDue/WO, không tạo FK hay truy vấn DB xuyên service.
Deploy chung package, Asset và Maintenance trước khi công bố policy có term mới.
Áp migration Maintenance trước khi khởi động phiên bản mới.

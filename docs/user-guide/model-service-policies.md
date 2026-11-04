# Chính sách bảo hành và bảo trì theo Model

## Cấu hình Model

Mở **Thiết bị → Model → tên Model**. Service Manager thiết lập cả bảo hành và
bảo trì; Tenant Admin có thể quản lý phần bảo hành theo quyền hiện hành.

- Tạo bản nháp bảo hành: thời hạn tháng, nguyên nhân được bảo hành, các điều khoản
  loại trừ và điều khoản khách hàng. Không khai báo cùng nguyên nhân vừa được bảo
  hành vừa bị loại trừ. Chọn **Không áp dụng** phải ghi lý do.
- Thêm các lịch bảo trì độc lập, ví dụ mỗi 3 tháng kiểm tra và mỗi năm thay vật tư.
  Mỗi lịch có kỳ đầu tính theo số chu kỳ, checklist, hướng dẫn và yêu cầu bắt buộc.
  Các lịch có thể cùng đến hạn; tránh khai báo trùng công việc. REPLACE không tự
  xuất kho; kỹ thuật viên vẫn dùng quy trình phụ tùng thực tế.
- Lưu bản nháp, kiểm tra rồi công bố riêng từng phần. Phần nào đã lưu/công bố sẽ
  có thông báo riêng. Chỉ phiên bản công bố mới được áp dụng khi bàn giao.
- Muốn sửa bản công bố, chọn **Sao chép thành bản mới**, chỉnh sửa rồi công bố.
  Máy đã bàn giao giữ nguyên phiên bản cũ. Ngừng áp dụng chỉ ảnh hưởng lựa chọn mới.

## Bàn giao thiết bị

Nhập Model, khách hàng, địa điểm và ngày bàn giao thực tế; lưu nháp. Trong mục
**Áp dụng chính sách theo Model**, lấy và xem trước chương trình. Hệ thống tự tính
ngày hết bảo hành, ngày đầu của từng lịch và hiển thị các hạng mục.

Service Manager có thể thay thời hạn, chu kỳ hoặc kỳ đầu riêng cho máy này, kèm
lý do. Ngoại lệ không sửa bản Model. Kiểm tra lại preview rồi xác nhận bàn giao.
Chưa cấu hình chính sách không được hiểu là không áp dụng: hãy công bố đủ hai
phần, kể cả phiên bản Không áp dụng có lý do.

Nếu hồ sơ đang **PENDING_MAINTENANCE**, chọn **Đối soát và tiếp tục cùng hồ sơ**.
Không tạo máy/hồ sơ mới. Khi có nhiều lịch, hệ thống tạo đủ các Plan rồi mới báo
hoàn tất. Hồ sơ thiết bị hiển thị chính sách và phiên bản thực tế đã nhận.
Hồ sơ thủ công cũ vẫn đọc và tiếp tục theo quy trình trước đây. Nếu hệ thống ngừng
hoặc dữ liệu được ghi nhận muộn, scheduler giữ lịch gốc và xử lý kỳ gần nhất đã
đến hạn, theo quy tắc hiện hành; không tạo dồn mọi kỳ đã bỏ lỡ.

## Tiếp nhận sự cố bảo hành

Còn thời hạn chưa đồng nghĩa sự cố được miễn phí. Service Manager xem điều khoản
đã áp dụng, xác định nguyên nhân và lưu kết luận kèm bằng chứng/lý do. Chưa biết
nguyên nhân thì tiếp tục xem xét hoặc yêu cầu bổ sung thông tin.

- Nguyên nhân được bảo hành, còn hạn: kết luận Được bảo hành rồi tiếp nhận.
- Nguyên nhân bị loại trừ, ví dụ vào nước: kết luận Không thuộc phạm vi bảo hành,
  tạo/gửi báo giá và chờ khách phê duyệt theo luồng hiện hành.
- Khi có báo giá đang xử lý, không sửa kết luận bảo hành để vượt qua phê duyệt.

Từ chối bảo hành một sự cố không hủy bảo hành của cả thiết bị.

## Kỹ thuật viên và Customer Portal

Trong WO trên Web hoặc tab **Checklist** của ứng dụng Android, đọc hướng dẫn,
đánh dấu từng mục và lưu. Chỉ kỹ thuật viên đang nhận phân công được sửa kết quả.
Mục bắt buộc phải hoàn tất; chỉ chọn Không áp dụng khi mục đó cho phép và có lý do.
Sau đó gửi Service Report. Máy chủ chặn hoàn tất nếu checklist chưa hợp lệ.

Khi lưu lỗi/mất mạng, tải lại để kiểm tra kết quả trên máy chủ trước khi gửi lại.
Kết quả chưa lưu không phải kết quả đã hoàn thành. Khách chỉ thấy điều khoản đã áp
dụng và tóm tắt/kết quả được công bố; ghi chú nội bộ checklist không xuất hiện trên
portal.

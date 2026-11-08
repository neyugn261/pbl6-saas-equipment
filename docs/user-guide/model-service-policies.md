# Chính sách bảo hành và bảo trì theo Model

## Cấu hình Model

Mở **Thiết bị → Model → tên Model**. Service Manager thiết lập cả bảo hành và
bảo trì; Tenant Admin có thể quản lý phần bảo hành theo quyền hiện hành.

- Tạo bản nháp bảo hành: thời hạn tháng, nguyên nhân được bảo hành, các điều khoản
  loại trừ và điều khoản khách hàng. Không khai báo cùng nguyên nhân vừa được bảo
  hành vừa bị loại trừ. Chọn **Không áp dụng** phải ghi lý do.
- Thêm các lịch bảo trì độc lập, ví dụ mỗi 3 tháng kiểm tra và mỗi năm thay vật tư.
  Mỗi lịch có kỳ đầu tính theo số chu kỳ, checklist, hướng dẫn và yêu cầu bắt buộc.
  Chọn **Thời hạn bảo trì** riêng cho từng lịch: **Trong số năm xác định**
  (nhập 1–100 năm từ ngày bàn giao), **Vĩnh viễn**, hoặc **Hết cùng với bảo hành**.
  Số năm gồm kỳ đến hạn đúng ngày kỷ niệm cuối; ngày 29/02 được chuyển về
  ngày cuối tháng nếu năm kết thúc không nhuận. Vĩnh viễn vẫn có thể chủ động
  tạm dừng hoặc ngừng kế hoạch. Bản chính sách cũ chưa có mục này giữ lịch vô hạn.
  Các lịch có thể cùng đến hạn; tránh khai báo trùng công việc. REPLACE không tự
  xuất kho; kỹ thuật viên vẫn dùng quy trình phụ tùng thực tế.
- Lưu bản nháp, kiểm tra rồi công bố riêng từng phần. Phần nào đã lưu/công bố sẽ
  có thông báo riêng. Chỉ phiên bản công bố mới được áp dụng khi bàn giao.
- Muốn sửa bản công bố, chọn **Sao chép thành bản mới**, chỉnh sửa rồi công bố.
  Máy đã bàn giao giữ nguyên phiên bản cũ. Ngừng áp dụng chỉ ảnh hưởng lựa chọn mới.

## Bàn giao thiết bị

Luồng bàn giao gồm bốn bước: **Khách hàng → Thiết bị → Chính sách Model → Xác nhận**.
Chọn khách hàng/địa điểm, nhập Model, mã máy, serial và ngày bàn giao thực tế.
Khi chuyển sang Chính sách Model, Service Manager được hệ thống lưu nháp và lấy
các phiên bản đã công bố, tự tính ngày hết bảo hành và kỳ đầu của từng lịch.
Không còn bước nhập lại bảo hành hoặc tự tạo Plan bằng tay trong màn hình này.

Kiểm tra điều khoản, phiên bản, các lịch và checklist đã hiển thị. Nếu cần thay
đổi riêng cho máy, mở **Điều chỉnh ngoại lệ cho thiết bị này**, nhập lý do rồi tính
lại. Ngoại lệ giữ phiên bản đã chọn, không sửa chính sách nguồn và không làm mất
ngoại lệ đã lưu ở phần còn lại. Muốn chọn default mới, dùng **Lấy lại chính sách
hiện hành từ Model**. Quay lại/xem tiếp các bước không tự đổi phiên bản đã chọn.
Khi đổi ngày bàn giao, phải lấy lại preview để tính đúng lịch trước khi xác nhận.
Preview hiển thị thời hạn và ngày kết thúc của từng lịch. **Hết cùng với bảo
hành** lấy ngày của bản bảo hành thực tế áp dụng, gồm ngoại lệ riêng cho máy;
chọn không bảo hành sẽ bị chặn. Nếu kỳ đầu nằm sau ngày kết thúc, hãy sửa
chu kỳ, kỳ đầu hoặc thời hạn. Sửa Model/gia hạn bảo hành sau khi bàn giao không
tự thay cam kết bảo trì của máy đã xác nhận.

Model chưa đủ cấu hình sẽ chặn hoàn tất. **Xem / cấu hình chính sách Model** mở
trình chỉnh sửa trong cùng tab. Hồ sơ bàn giao đã được lưu; dùng **Quay lại hồ sơ
bàn giao** để trở về đúng bước Chính sách Model. Việc xem hoặc chỉnh Model không
tự thay preview đã chọn; dùng nút lấy lại chính sách để chủ động cập nhật.
Công bố cả bảo hành và bảo trì, kể cả phiên bản Không áp dụng có lý do, rồi tải
lại. Tenant Admin có thể lưu nháp để Service Manager tiếp tục; không có cách nhập
tay để vượt quyền bảo trì.

Ở bước Xác nhận, chọn **Hoàn tất ghi nhận**. Nếu kết quả lưu chưa rõ, dùng
**Tải lại kết quả đã lưu** để đối soát trước khi gửi tiếp, không tạo máy khác.
Nếu hồ sơ **PENDING_MAINTENANCE**, chọn **Kiểm tra và tiếp tục** trên thông báo
trạng thái. Chỉ khi nhận đủ Plan, hệ thống mới báo hoàn tất.

Hồ sơ đã hoàn tất hoặc đang chờ từ luồng cũ giữ nguyên điều khoản và cách đối
soát cũ; chúng hiển thị để xem, không được tự đổi sang chính sách Model mới.
Nếu hệ thống ngừng hoặc dữ liệu được ghi nhận muộn, scheduler giữ lịch gốc và
xử lý kỳ gần nhất đã đến hạn, không tạo dồn mọi kỳ đã bỏ lỡ.
Với Plan hữu hạn, ngày kết thúc là ngày cuối còn được sinh kỳ. Sau hạn hệ thống
ngừng sinh mới, chuyển Plan đang hoạt động sang Ngừng hoạt động và ghi lịch sử.
Gói đã hết hạn không sinh task bù khi hệ thống chạy lại. Task/WO đã tạo vẫn
được giữ để xử lý và tra cứu; pause/resume hay sửa chu kỳ không kéo dài thời hạn.

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

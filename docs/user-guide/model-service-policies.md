# Chính sách bảo hành và bảo trì theo Model

## Cấu hình Model

Mở **Khách hàng & thiết bị → Model & chính sách → Thông tin và chính sách**.
Tab **Thông tin** hiển thị số thiết bị đã ghi nhận theo model, bao gồm thiết bị
đã ngừng sử dụng. Thông tin model chỉ đọc sau khi tạo. Service Manager cấu hình
cả hai tab **Bảo hành** và **Bảo trì**.
Tenant Admin có thể quản lý phần bảo hành theo quyền hiện hành.

Khi **Ngừng dùng** một model, danh sách chọn cho thiết bị mới sẽ ẩn model đó.
Hồ sơ nháp dùng chính sách model có thể tiếp tục sau khi **Kích hoạt** lại.
Thiết bị đã ghi nhận và hồ sơ đã gửi vẫn được giữ lại.

- Nhập chính sách bảo hành gồm thời hạn tháng, nguyên nhân được bảo hành, điều khoản
  loại trừ và điều khoản khách hàng. Không khai báo cùng nguyên nhân vừa được bảo
  hành vừa bị loại trừ. Nếu model không có bảo hành, chọn **Không kèm bảo hành**
  và ghi lý do.
- Thêm các lịch bảo trì độc lập, ví dụ mỗi 3 tháng kiểm tra và mỗi năm thay vật tư.
  Mỗi lịch có kỳ đầu tính theo số chu kỳ, checklist, hướng dẫn và yêu cầu bắt buộc.
  Chọn **Thời hạn bảo trì** riêng cho từng lịch: **Trong số năm xác định**
  (nhập 1–100 năm từ ngày bàn giao), **Vĩnh viễn**, hoặc **Hết cùng với bảo hành**.
  Số năm gồm kỳ đến hạn đúng ngày kỷ niệm cuối; ngày 29/02 được chuyển về
  ngày cuối tháng nếu năm kết thúc không nhuận. Vĩnh viễn vẫn có thể chủ động
  tạm dừng hoặc ngừng kế hoạch. Bản chính sách cũ chưa có mục này giữ lịch vô hạn.
  Các lịch có thể cùng đến hạn; tránh khai báo trùng công việc. REPLACE không tự
  xuất kho; kỹ thuật viên vẫn dùng quy trình phụ tùng thực tế.
  Nếu model không có chương trình bảo trì, chọn **Không kèm bảo trì** và ghi lý do.
- Chọn **Lưu và sử dụng** khi tạo hoặc chỉnh sửa chính sách. Mục **Phiên bản**
  đánh dấu chính sách đang áp dụng là **Đang sử dụng**. Bản nháp và bản đã thay
  thế hiển thị theo số phiên bản. Hồ sơ đã chọn phiên bản và thiết bị đã được
  áp dụng giữ nguyên điều khoản đã ghi nhận.
- Chọn **Sử dụng lại** trên phiên bản đã ngừng hoặc đã thay thế để dùng phiên bản đó
  cho các lần bàn giao tiếp theo.

## Bàn giao thiết bị

Mở **Đăng ký thiết bị** để theo dõi tiến độ hồ sơ, trạng thái thiết bị và kết quả
bàn giao. Bảng có bộ lọc cho cả ba loại trạng thái. Các thẻ số lượng đếm thiết bị
trên tất cả các trang của kết quả lọc theo hồ sơ và bàn giao. Bấm trạng thái bàn
giao trong bảng để mở nội dung đã gửi và lịch sử xác nhận.

Luồng bàn giao gồm bốn bước **Khách hàng → Thiết bị → Chính sách Model → Kiểm tra
và gửi**. Chọn khách hàng, địa điểm và nhập model, mã máy, serial, ngày bàn giao
thực tế. Với hồ sơ tạo thiết bị mới chưa gửi, mở lại bản nháp và vào bước
**Khách hàng** hoặc **Thiết bị** để sửa khách hàng, địa điểm, model, mã máy,
serial, ngày thực tế và hình thức bàn giao. Chọn **Lưu bản nháp** để ghi nhận
thay đổi. Đổi model hoặc ngày bàn giao sẽ yêu cầu áp dụng lại chính sách.

Ở bước **Chính sách Model**, Service Manager mở **Chọn phiên bản chính sách
Model**, chọn riêng phiên bản bảo hành và bảo trì, xem điều khoản và lịch tương
ứng rồi bấm **Áp dụng**. Chọn phiên bản đã phát hành hoặc **Không áp dụng** cho
từng dịch vụ. Nếu thiết bị không kèm cả hai dịch vụ, vẫn bấm **Áp dụng** để ghi
nhận lựa chọn đó. Hệ thống chỉ tạo bảo hành và lịch bảo trì cho dịch vụ đã chọn.

Mở **Điều chỉnh ngoại lệ** để sửa thời hạn bảo hành, chu kỳ hoặc kỳ đầu bảo trì
riêng cho thiết bị. Nhập lý do rồi bấm **Áp dụng**. Hệ thống giữ nguyên phiên bản
nguồn và các giá trị ngoại lệ đã lưu ở phần chưa chỉnh sửa. Chọn phiên bản khác
sẽ đặt lại ngoại lệ của hồ sơ. Khi đổi ngày bàn giao, áp dụng lại chính sách để
tính lại ngày bảo hành và lịch bảo trì.
Preview hiển thị thời hạn và ngày kết thúc của từng lịch. **Hết cùng với bảo
hành** lấy ngày của bản bảo hành thực tế áp dụng, gồm ngoại lệ riêng cho máy;
chọn không bảo hành sẽ bị chặn. Nếu kỳ đầu nằm sau ngày kết thúc, hãy sửa
chu kỳ, kỳ đầu hoặc thời hạn. Sửa Model/gia hạn bảo hành sau khi bàn giao không
tự thay cam kết bảo trì của máy đã xác nhận.

Nếu hồ sơ cần một dịch vụ mà model chưa có phiên bản phù hợp, cấu hình phiên bản
trong danh mục **Model & chính sách**. Tenant Admin có thể lưu bản nháp để Service
Manager tiếp tục.

Ở bước **Kiểm tra và gửi**, rà soát thông tin đã chốt và chọn **Hoàn tất ghi nhận**
hoặc **Gửi khách xác nhận** theo hình thức bàn giao. Muốn chỉnh sửa, quay lại bước
tương ứng. Nếu kết quả lưu chưa rõ, dùng **Tải lại kết quả đã lưu** để đối soát.
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

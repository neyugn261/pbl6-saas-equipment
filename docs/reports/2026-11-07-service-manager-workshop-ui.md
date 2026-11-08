# Service Manager — Workshop UI

Ngày: 07/11/2026. Nhánh: `codex/service-manager-field-desk`.

## Thiết kế đã chốt

Workshop là phong cách chủ đạo: nền xám ấm, bề mặt sáng, cam đất cho thao tác và lựa chọn, đường viền rõ, góc bo nhỏ. Field Desk tổ chức việc cần xử lý; Casebook tổ chức hồ sơ nhận dạng và lịch sử. Dùng một bộ màu và typography xuyên suốt Service Manager.

## Thay đổi đã thực hiện

### Điều hướng và giao diện chung

- `ServiceManagerShell.tsx`: shell riêng khi tài khoản có vai trò SERVICE_MANAGER, thay sidebar bằng điều hướng ngang hai cấp. Các nhóm và đường dẫn vẫn lấy từ `navigationFor`; vai trò kết hợp vẫn giữ các link được cấp.
- Có tra cứu thiết bị, Notification Bell hiện có, tài khoản, đăng xuất, breadcrumb và liên kết bỏ qua điều hướng bằng bàn phím.
- `workshop.css`: token màu, typography, bảng, biểu mẫu, thông báo, trạng thái, tab, modal, tiến trình và timeline được giới hạn trong shell này. Các vai trò khác không chuyển giao diện trong đợt này.
- Đồng bộ các route chính và trang con Service Manager qua các component dùng chung: yêu cầu dịch vụ, khách hàng, thiết bị, model/chính sách, đăng ký/bàn giao, Work Order, kỹ thuật viên, bảo trì/lịch sử, phụ tùng/tồn kho, báo cáo, thông báo và tài khoản.

### Bàn dịch vụ

- `ServiceManagerDashboard.tsx`: bốn nhóm gồm yêu cầu NEW, REVIEWING và Work Order CREATED, ON_HOLD.
- Mỗi nhóm lấy tối đa 6 bản ghi qua API hiện hành; tổng số dùng response server. Mỗi nhóm có trạng thái loading/error riêng, lỗi hiển thị “—”.
- Chọn một hồ sơ để xem mô tả, thiết bị/khách hàng, mức ưu tiên, thời điểm/lịch dự kiến, người thực hiện hoặc lưu ý bảo hành, bước tiếp theo và link xử lý.
- Lựa chọn hồ sơ chỉ được giải từ response hiện tại; không lưu bản sao hồ sơ cũ vào state để hiển thị sau khi đổi phiên.
- Chưa tải được thông tin bảo hành không được suy thành đã được bảo hành. Lịch dự kiến không được trình bày là lịch khách đã xác nhận.

### Bảng công việc

- `WorkOrderBoard.tsx`: mặc định bốn cột CREATED, ASSIGNED, ACCEPTED/TRAVELLING/IN_PROGRESS và ON_HOLD. Mỗi cột gọi API độc lập, tối đa 4 hồ sơ, tổng theo bộ lọc do server trả.
- Có mã, tiêu đề, ưu tiên, tên thiết bị/khách hàng, lịch dự kiến, người thực hiện, trạng thái và bước tiếp theo. Link mở đúng trang chi tiết đang có.
- Bộ lọc tìm kiếm, ưu tiên và loại được giữ cho từng cột; chọn trạng thái cụ thể sẽ hiển thị nhóm đó, kể cả COMPLETED/CANCELLED.
- Chuyển bảng/danh sách bằng query `view`; link danh sách đầy đủ giữ bộ lọc, reset phân trang và sử dụng bảng/phân trang hiện có.
- Không thêm thao tác kéo thả đổi trạng thái hoặc thao tác ghi từ thẻ công việc.

### Hồ sơ Casebook

- Trang thiết bị có khối nhận dạng phía trên các mục hồ sơ: mã, serial, khách hàng, địa điểm, ngày bàn giao, bảo hành theo lịch, tình trạng vận hành đã ghi nhận.
- Các mục thông tin/bảo hành, chính sách, dịch vụ/bảo trì và toàn bộ lịch sử tiếp tục dùng dữ liệu và component hiện có.
- Các trang chi tiết Work Order, bàn giao, Maintenance, Service Request và hồ sơ liên quan cùng dùng style Workshop cho summary, tab, biểu mẫu, timeline, cảnh báo và dữ liệu liên quan.

## Kiểm tra

- `pnpm --filter web lint`: đạt.
- `pnpm --filter web test`: 73/73 đạt, gồm 3 test mới về bộ lọc và link đầy đủ của từng cột, lựa chọn nhóm/hồ sơ và trạng thái không tải được, điều hướng theo vai trò/route con.
- Kiểm thử hiện có tiếp tục kiểm tra chống gửi lặp, kết quả ghi chưa rõ, tenant/session isolation, tên hiển thị, bảo trì, bàn giao và giao dịch kho.
- `pnpm --filter web build`: đạt, bao gồm TypeScript. Bundle JS vẫn có cảnh báo lớn hơn 500 kB (khoảng 663 kB trước gzip); chưa thực hiện chia bundle trong đợt thiết kế này.
- Kiểm tra trình duyệt bằng các component ứng dụng thật với fixture QA chỉ đọc riêng ở thư mục bị Git bỏ qua. Fixture không được import vào route sản phẩm và không gửi mutation.
- Đã kiểm tra dashboard chọn nhóm, bảng/danh sách, mở chi tiết Work Order, mở hồ sơ thiết bị và chuyển lịch sử. Kiểm tra responsive ở viewport 1440px và 320px; dashboard, bảng/danh sách, đội ngũ, hồ sơ/lịch sử và form tạo kế hoạch bảo trì không tràn ngang ở 320px.
- Đã sửa nền main còn bị style cũ ghi đè, nhãn truy cập nút biểu tượng, đường timeline còn màu cũ và min-width toàn trang gây tràn ở màn hình nhỏ.

## Giới hạn và phần cần nghiệm thu với stack thật

Backend không chạy trong buổi kiểm tra giao diện. Web thật mở được ở `http://localhost:5173/login`; chưa đăng nhập và chưa nghiệm thu lại các thao tác ghi với stack backend thật trong đợt này. Kiểm tra fixture không thay thế nghiệm thu tích hợp.

Khi backend hoạt động, cần kiểm tra bằng Service Manager:

1. Các nhóm dashboard có số tổng/hồ sơ phù hợp dữ liệu và quyền; mở đúng hồ sơ nguồn.
2. Bảng Work Order: tìm kiếm, lọc ưu tiên, trạng thái, chuyển danh sách, phân trang, mở hồ sơ; các nguồn lỗi hiển thị đúng.
3. Tạo/xem xét yêu cầu, đánh giá bảo hành, tạo/điều phối Work Order và đọc báo cáo theo `allowedActions` thực tế.
4. Bàn giao và đăng ký thiết bị, QR, khách hàng/model, kế hoạch bảo trì và lịch sử; xác nhận hiển thị đầy đủ cả khi một service chưa phản hồi.
5. Báo cáo, phụ tùng/tồn kho và thông báo; lỗi quyền Notification nếu còn xảy ra cần xử lý ở service sở hữu quyền/recipient, không che bằng dữ liệu giả.

## Git và phạm vi

Không thay schema, event, API, phân quyền backend hoặc dependency. Không push/merge trong đợt này. Bản UI trước thay đổi vẫn có mốc `checkpoint/ui-v1-before-field-desk-20261107` và backup tại `tmp/git-safety-20261107-213053`.

Ảnh QA cục bộ: `tmp/workshop-dashboard-desktop.png`, `tmp/workshop-board-desktop.png`, `tmp/workshop-workorder-desktop.png`, `tmp/workshop-dashboard-mobile.png`. Các ảnh dùng dữ liệu minh họa đã gắn nhãn.

# Đối chiếu giao diện Servio với mẫu gốc

Mốc đối chiếu: commit `cb9856d` của Khương (`feat(web): add sample UI for admin, operations and customer portal`, 12/10/2026).

## Đã đưa về giao diện mẫu

- Khung Servio sáng: sidebar, thương hiệu, vùng tổ chức, menu, topbar, breadcrumb, bảng màu, thẻ và responsive.
- Dashboard: thẻ chỉ số, biểu đồ cột, biểu đồ tròn, mục yêu cầu cần chú ý và truy cập nhanh. Số liệu lấy từ API theo quyền hiện tại.
- Danh sách khách hàng, thiết bị và yêu cầu: header, thanh tìm kiếm, bộ lọc, bảng và dải thống kê tương ứng.
- Chi tiết khách hàng, thiết bị, yêu cầu và biểu mẫu tạo yêu cầu: các nhóm thông tin, tab, cột và hành động theo mẫu. API và quyền cũ vẫn được sử dụng.
- Mục “Luồng demo” không còn trong sidebar hoặc dashboard; `/demo` vẫn mở trực tiếp được để dùng khi trình diễn.
- Các trang mẫu gốc cho Work Order, kỹ thuật viên, bảo trì, phụ tùng, kho, tổ chức, báo cáo, cài đặt, thông báo và hồ sơ đã được đưa lại từ commit mẫu. Chúng nằm dưới `/app/*`, `/admin/*` và `/portal/*`, sử dụng dữ liệu mẫu tách khỏi API thật và có nhãn nhận diện trên trang.

## Chưa tương đương 100%

| Phần của mẫu gốc | Trạng thái hiện tại | Lý do |
| --- | --- | --- |
| 8 chỉ số dashboard, lịch công việc và trạng thái Work Order | Chỉ hiển thị chỉ số và biểu đồ có dữ liệu thật | Work Order, bảo trì, phụ tùng chưa có API nghiệp vụ đang chạy tương ứng |
| Work Order, kỹ thuật viên, bảo trì, kho, báo cáo, cài đặt, thông báo | Đã có màn hình mẫu như commit gốc | Chỉ là dữ liệu và thao tác mẫu; service nghiệp vụ tương ứng chưa có API đang chạy |
| Portal mẫu với địa điểm, thông báo, hồ sơ | Đã có màn hình mẫu như commit gốc | Chưa đồng bộ với tài khoản Customer và API thật |
| Nút chuyển vai trò demo, nút thông báo và ô tìm kiếm giả | Không khôi phục | Tài khoản hiện tại dùng đăng nhập và RBAC thật; các nút gốc không thực hiện hành động thật |
| Dữ liệu, tên người dùng và ngày tháng cố định trong mẫu | Hiển thị dữ liệu API, tài khoản và ngày hiện tại | Cần thể hiện đúng tenant và quyền truy cập, không dùng số liệu mẫu như dữ liệu thật |

Các trang mẫu đã được khôi phục từ mã nguồn của Khương, nhưng phần khung đã tích hợp đăng nhập/RBAC và các trang dùng API thật vẫn khác mẫu ở nội dung, dữ liệu và một số thao tác. Vì vậy chưa thể xác nhận toàn bộ website giống 100% theo từng pixel. Các màn hình mẫu được gắn nhãn để không bị nhầm là chức năng đã kết nối service.

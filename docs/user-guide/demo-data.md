# Bộ dữ liệu demo hai chi nhánh

Nguồn dữ liệu thống nhất: [`scripts/demo/catalog.cjs`](../../scripts/demo/catalog.cjs). Mỗi service seed database của chính nó; các tình huống dịch vụ được tạo qua API, scheduler và event thật. Không cần tạo thủ công tài khoản hoặc chạy từng seed theo thứ tự.

Kết quả thực chạy và ảnh giao diện: [nghiệm thu seed](../testing/demo-data.md).

## Người mới pull dự án

```sh
pnpm install
cp .env.example .env
# Đặt JWT_ACCESS_SECRET ngẫu nhiên >=32 ký tự và SEED_DEMO_PASSWORD >=8 ký tự.
pnpm infra:up
pnpm demo:seed
pnpm dev:backend
# Terminal khác:
pnpm dev:web
```

Windows PowerShell dùng `Copy-Item .env.example .env` thay `cp`. Các lệnh pnpm còn lại giống nhau. Nếu volume PostgreSQL cũ thiếu DB, chạy script bootstrap theo README trước.

`demo:seed` tự build backend, áp migration, mở tạm cả tám service và Gateway bằng cổng trống trên localhost, chuẩn bị dữ liệu rồi đóng các process tạm. PostgreSQL, RabbitMQ management và MinIO phải đang chạy. RabbitMQ dùng vhost riêng được tạo tự động bằng tài khoản local trong `.env`; nó giữ message chưa xử lý để lần chạy sau tiếp tục, không trộn event của DB test với DB phát triển.

## Tài khoản

Tenant code là `DEMO`; Platform Admin bỏ trống tenant code. Mật khẩu lấy từ `SEED_DEMO_PASSWORD`, không ghi mật khẩu thật vào repository.

| Email | Vai trò | Phạm vi |
| --- | --- | --- |
| platform.admin@pbl6.local | Platform Admin | Nền tảng |
| tenant.admin@demo.local | Tenant Admin | Toàn doanh nghiệp |
| service.manager@demo.local | Service Manager | HCM |
| service.manager.dn@demo.local | Service Manager | Đà Nẵng |
| inventory@demo.local | Inventory Staff | HCM |
| inventory.dn@demo.local | Inventory Staff | Đà Nẵng |
| technician@demo.local | Technician | HCM 01, ca đang sửa |
| technician.hcm02@demo.local | Technician | HCM 02, còn trống lịch |
| technician.dn01@demo.local | Technician | Đà Nẵng 01, được giao bảo trì |
| technician.dn02@demo.local | Technician | Đà Nẵng 02, còn trống lịch |
| customer.admin@demo.local | Customer Admin | Bệnh viện Demo |
| customer.user@demo.local | Customer User | Bệnh viện Demo |
| factory.admin@demo.local | Customer Admin | Nhà máy Demo |
| factory.user@demo.local | Customer User | Nhà máy Demo |

Không seed tài khoản Dispatcher hoặc tài khoản mời chưa kích hoạt trong bộ demo chính.

## Dữ liệu và kịch bản

- 2 chi nhánh; mỗi chi nhánh 1 Service Manager, 1 Inventory Staff, 2 Technician.
- 2 khách hàng, mỗi khách hàng có site HCM và Đà Nẵng; 4 site, 8 location, 4 contact, 4 customer membership.
- 2 model US-100/PUMP-200; 6 thiết bị, mỗi chi nhánh phục vụ 3 máy; 5 warranty (4 còn hạn, 1 hết hạn), một máy không có warranty; 6 QR hoạt động.
- 2 chính sách bảo hành và 2 mẫu bảo trì đã publish. Mẫu bảo trì có 3 mục checklist để dùng khi đăng ký thiết bị mới.
- 3 kỹ năng, 4 hồ sơ Technician, 2 kho, 3 loại phụ tùng và 6 dòng tồn kho.
- 6 Service Request, 2 dự toán với 3 dòng chi phí mỗi dự toán; 5 WO (3 sửa chữa, 2 bảo trì), 2 báo cáo hoàn tất, 2 kế hoạch và 2 task bảo trì.
- 2 hồ sơ đăng ký hoàn tất sử dụng lại thiết bị và kế hoạch đã có; không sinh thêm thiết bị hoặc lịch bảo trì trùng.
- 3 PDF thật trên MinIO: ghi chú kỹ thuật nội bộ của ca đang sửa, hai biên bản được công khai cho khách hàng trong báo cáo hoàn tất.
- Lịch sử, assignment, nhật ký, giao dịch kho và thông báo phát sinh từ luồng xử lý, không giới hạn giả tạo ở 2–3 dòng.

| Mã tình huống | Chi nhánh | Trạng thái ban đầu |
| --- | --- | --- |
| DEMO-HCM-NEW | HCM | SR NEW, dành để trình diễn trực tiếp |
| DEMO-HCM-INPROGRESS | HCM | SR PROCESSING, WO IN_PROGRESS, cấp 2 bộ lọc |
| DEMO-HCM-CLOSED | HCM | SR CLOSED, WO COMPLETED, khách đã xác nhận |
| DEMO-DN-NEW | Đà Nẵng | SR NEW, máy còn bảo hành |
| DEMO-DN-ESTIMATE | Đà Nẵng | SR AWAITING_CUSTOMER_APPROVAL, dự toán SENT |
| DEMO-DN-CLOSED | Đà Nẵng | Ngoài bảo hành; dự toán APPROVED, WO hoàn tất, dùng 1 cầu chì và trả 1 cầu chì |

WO bảo trì HCM ở CREATED để demo phân công; WO bảo trì Đà Nẵng ở ASSIGNED để demo nhận việc. Mọi ca mới lưu timestamp thực tế của lần chuẩn bị dữ liệu; seed không giả mạo thời điểm người dùng đã thao tác. Ngày bảo hành/dự toán và lịch ban đầu tính theo ngày đầu tiên seed, giữ nguyên khi chạy lại.

Tồn sau seed sạch:

| Phụ tùng | HCM | Đà Nẵng | Ngưỡng tối thiểu |
| --- | ---: | ---: | ---: |
| Bộ lọc | 12 | 8 | 5 |
| Cầu chì | 20 | 2 | 5 |
| Cảm biến áp suất | 0 | 6 | 3 |

Số tồn được tính từ nhập đầu kỳ và giao dịch cấp/trả, không ghi đè trực tiếp để khớp bảng. Notification bootstrap, sự kiện tồn thấp và thông báo ca dịch vụ chạy qua broker thật.

## Chạy lại và reset

`pnpm demo:seed` bổ sung dữ liệu thiếu và giữ hồ sơ đã thao tác, số tồn, ngày bảo hành, mật khẩu/role tài khoản hiện có, chi nhánh nhân viên và cấu hình site đã đổi. Tiến trình seed dang dở được ghi trong `.local/demo/`, gắn với bộ database đích, không chứa token/mật khẩu và bị Git ignore. Seed được khóa để hai process không tạo tình huống trùng đồng thời.

Muốn thay **toàn bộ dữ liệu local thuộc dự án** bằng trạng thái ban đầu:

```sh
# Dừng pnpm dev:backend trước.
pnpm demo:reset
pnpm dev:backend
```

Lệnh reset xóa dữ liệu ứng dụng trong đúng tám `<service>_db`, giữ migration/schema và nạp lại catalog quyền. Nó từ chối production/staging, host DB từ xa, tên DB lạ hoặc backend đang kết nối; không đụng DB dự án khác. Nó dọn message cũ của các queue dự án khi consumer đã dừng. Bucket MinIO không bị xóa toàn bộ; các tệp cũ không còn bản ghi tham chiếu sẽ không xuất hiện trong ứng dụng. Đăng xuất tài khoản cũ và đăng nhập lại sau reset.

## Kiểm tra

`pnpm test:demo-seed` chạy guard tests và seed integration trên đúng tám `*_test_db`: reset sạch, đăng nhập 14 tài khoản, kiểm tra hai chi nhánh/customer scope, trạng thái, tồn kho, báo cáo/tệp/thông báo; chạy lại để kiểm tra không nhân đôi hoặc mất tiến trình. Không chạy song song với các DB suite dùng TRUNCATE.

Khi dùng thiết bị Android thật, đặt `MINIO_PUBLIC_ENDPOINT` thành địa chỉ LAN mà điện thoại truy cập được. Seed uploader tự tạo ticket cho origin nội bộ; backend thông thường vẫn ký URL theo `.env` và không sửa host của URL đã ký.

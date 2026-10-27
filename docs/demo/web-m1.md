# Kịch bản trình chiếu web M1

## Chuẩn bị

Mở `http://localhost:5173` và dùng tenant code `DEMO`. Mật khẩu chung của các tài khoản demo là giá trị `SEED_DEMO_PASSWORD` trong file `.env` local; không ghi mật khẩu vào tài liệu hoặc source. Các tài khoản sau do Identity seed tạo:

| Tài khoản | Vai trò | Dùng để trình diễn |
| --- | --- | --- |
| `customer.user@demo.local` | Customer User | Xem thiết bị, tạo và theo dõi yêu cầu |
| `service.manager@demo.local` | Service Manager | Xem xét bảo hành, tiếp nhận yêu cầu |
| `tenant.admin@demo.local` | Tenant Admin | Xem khách hàng, thiết bị, mời người dùng |
| `platform.admin@pbl6.local` | Platform Admin | Xem danh sách tenant; bật **Tài khoản nền tảng** và để trống mã doanh nghiệp |
| `customer.admin@demo.local` | Customer Admin | Xem dữ liệu khách hàng và màn hình mời người dùng |

Tài khoản `invited@demo.local` ở trạng thái `INVITED`, chưa đăng nhập được. Dispatcher, Technician và Inventory Staff có tài khoản seed nhưng web M1 chưa có màn hình chuyên biệt cho các vai trò này.

Nếu cần khởi động lại từ máy đã cài dependency và đã cấu hình `.env`:

1. Mở Docker Desktop, chờ engine sẵn sàng, chạy `pnpm infra:up`.
2. Nếu database chưa được chuẩn bị, chạy `pnpm db:migrate`, `pnpm identity:seed:dev`, khởi động Identity, rồi seed Organization và Asset theo README của từng service. Sau khi đổi `SEED_DEMO_PASSWORD`, chạy lại `pnpm identity:seed:dev` để cập nhật mật khẩu các tài khoản DEMO.
3. Chạy Identity, Organization, Asset, Service Request, API Gateway và web. Có thể dùng `pnpm dev:backend` cùng `pnpm dev:web`; với M1 chỉ cần các service ở cổng 3001, 3006, 3002, 3007 và Gateway 3000.
4. Đảm bảo `apps/web/.env.local` dùng `VITE_M1_API_MODE=gateway` và `.env` dùng `ASSET_QR_PORTAL_BASE_URL=http://localhost:5173` nếu trình diễn QR.
5. Kiểm tra `/health` ở cổng 3000, 3001, 3002, 3006 và 3007, rồi mở web ở cổng 5173.

## Luồng chính: khoảng 7 phút

1. Đăng nhập `customer.user@demo.local`. Vào **Luồng demo** để giới thiệu các vai trò. Vào **Thiết bị**, mở `DEMO-ASSET-01` của Bệnh viện Đa khoa Demo. Đây là thiết bị còn bảo hành; tài khoản khách hàng chỉ thấy thiết bị thuộc khách hàng của mình.
2. Vào **Yêu cầu dịch vụ → Tạo yêu cầu**. Chọn `DEMO-ASSET-01`, loại `REPAIR`, ưu tiên `NORMAL`, nhập tiêu đề và mô tả sự cố, rồi gửi. Trang chi tiết hiển thị trạng thái `NEW`; số yêu cầu cũng xuất hiện ở danh sách.
3. Đăng xuất và đăng nhập `service.manager@demo.local`. Vào **Luồng demo** để mở lại yêu cầu vừa tạo trong cùng tab, hoặc tìm ở **Yêu cầu dịch vụ**. Nhấn **Xem xét và kiểm tra bảo hành**. Chỉ ra trạng thái `REVIEWING` và kết quả `IN_WARRANTY`; sau đó nhấn **Tiếp nhận**, trạng thái thành `ACCEPTED`. Mở lịch sử trạng thái và thêm một bình luận nội bộ nếu muốn trình diễn trao đổi của nhân viên.
4. Đăng xuất, đăng nhập lại `customer.user@demo.local`. Mở cùng yêu cầu từ **Luồng demo** hoặc danh sách. Chỉ ra trạng thái `ACCEPTED`, lịch sử và phạm vi bình luận khách hàng nhìn thấy. Bình luận `INTERNAL` của nhân viên không hiển thị cho khách hàng.

ID yêu cầu gần nhất được lưu trong `sessionStorage` của tab theo tenant, chỉ để điều hướng. Backend vẫn xác thực token và kiểm tra phạm vi tenant/customer ở từng request. Dùng cùng tab khi đổi tài khoản; nếu mở tab mới, tìm yêu cầu ở danh sách.

Gateway mặc định giới hạn 10 lần đăng nhập từ cùng IP trong 15 phút. Trong buổi demo, chỉ đổi tài khoản theo các bước cần thiết. Nếu nhận `RATE_LIMIT_EXCEEDED`, chờ hết cửa sổ giới hạn hoặc khởi động lại Gateway local trước khi trình chiếu.

## Các chức năng web khác: khoảng 3 phút

- Đăng nhập `tenant.admin@demo.local`: xem **Khách hàng**, chi tiết khách hàng, **Thiết bị** và màn hình **Mời người dùng**. Có thể trình diễn mời một email demo mới và link kích hoạt dev/test; thao tác này tạo dữ liệu mới.
- Đăng nhập `platform.admin@pbl6.local` với ô **Tài khoản nền tảng**: xem danh sách **Doanh nghiệp**.
- Mở link QR đã tạo cho `DEMO-ASSET-01` khi đang đăng nhập Customer User: trang `/portal/qr/{token}` kiểm tra quyền rồi hiển thị thiết bị và nút tạo yêu cầu. Web M1 chưa có nút phát hoặc in QR; QR được tạo qua Asset API.
- Thử truy cập ID thiết bị hoặc yêu cầu của khách hàng khác để giải thích kiểm tra quyền ở backend. Không cần chỉnh ID trong dữ liệu thật nếu không có thời gian.

## Giới hạn cần nói rõ

Web hiện trình diễn Identity, Organization, Asset và Service Request. Work Order, phân công kỹ thuật viên, Service Report, Maintenance, Inventory và Notification chưa có màn hình web trong luồng M1. Với yêu cầu ngoài bảo hành, trạng thái/Cost Estimate có API nhưng màn hình web chưa bao phủ luồng xác nhận chi phí; chọn `DEMO-ASSET-01` để demo luồng tiếp nhận ổn định.

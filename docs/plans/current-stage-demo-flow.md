# Luồng demo giai đoạn hiện tại (26/10/2026)

> Cập nhật 27/10: backend M2 phía Minh đã có Plan/Task API, scheduler và consumer;
> xem [báo cáo M2](../reports/2026-10-27-minh-m2.md). Kịch bản web bên dưới vẫn là
> bản M1 vì màn hình web Maintenance thuộc Hatsady. Mô tả “M2 mới có nền tảng”
> trong bản chụp 26/10 không còn phản ánh code backend hiện tại.

## Phạm vi và mục tiêu

Demo một luồng M1 chạy trên backend thật: **Customer User gửi yêu cầu cho thiết bị còn bảo hành → Service Manager kiểm tra bảo hành và tiếp nhận**. Dành khoảng 8–10 phút. M2 hiện mới có nền tảng Maintenance (database, migration, auth, health); chưa có API Plan/Task hay luồng Work Order, nên kịch bản dừng ở `ACCEPTED`.

## Chuẩn bị trước khi trình bày

1. Trên máy mới, chạy hạ tầng, migration và seed Identity. Các seed dev có sẵn là idempotent. Trên máy hiện tại, Identity/Organization/Asset đã được seed.

   ```powershell
   pnpm infra:up
   pnpm db:migrate
   pnpm identity:seed:dev
   ```

   Bật tạm Identity bằng `pnpm dev:identity` trong một terminal khác. Khi `http://localhost:3001/health` đã trả 200, chạy:

   ```powershell
   pnpm --filter organization-service db:seed:dev
   pnpm --filter asset-service db:seed:dev
   ```

   Dừng terminal Identity tạm trước khi chạy toàn bộ backend ở bước 2. Organization seed cần Identity Service đang chạy để liên kết tài khoản demo. Không chạy `pnpm smoke:m1` ngay trước buổi demo vì script đó tạo thêm tài khoản và dữ liệu kiểm thử.
2. Mở hai terminal tại thư mục gốc repository:

   ```powershell
   pnpm dev:backend
   pnpm dev:web
   ```

3. Kiểm tra `http://localhost:3000/health` trả `identity`, `organization`, `asset`, `service-request` là `up`; mở `http://localhost:5173/login`. Web phải ở gateway mode (không có thông báo dữ liệu mock).
4. Dùng mật khẩu trong `SEED_DEMO_PASSWORD` của `.env` cục bộ. Mã doanh nghiệp là `DEMO`. Không đưa mật khẩu vào slide, tài liệu hay bản ghi màn hình.
5. Thiết bị chính: `DEMO-ASSET-01` thuộc `DEMO-CUST-01`, bảo hành đến 2099. `DEMO-ASSET-02` đã hết bảo hành; `DEMO-ASSET-03` thuộc khách hàng khác và dùng để minh họa phân quyền.

## Kịch bản trình bày

| Bước | Vai trò / thao tác trên web | Kết quả cần chỉ ra |
| --- | --- | --- |
| 1 | Đăng nhập `customer.user@demo.local` tại `/login`, tenant `DEMO`. | Có menu Khách hàng, Thiết bị, Yêu cầu dịch vụ. |
| 2 | Mở **Khách hàng**, rồi **Thiết bị**. | Chỉ thấy `DEMO-CUST-01` và hai thiết bị `DEMO-ASSET-01`, `DEMO-ASSET-02`; không thấy dữ liệu `DEMO-CUST-02`/`DEMO-ASSET-03`. Mở `DEMO-ASSET-01` để xem model, số sê-ri và bảo hành. |
| 3 | Mở **Yêu cầu dịch vụ → Tạo yêu cầu**. Chọn `DEMO-ASSET-01`; loại `WARRANTY`, ưu tiên `NORMAL`; tiêu đề ví dụ “Máy siêu âm báo lỗi khi khởi động”; mô tả ngắn tình trạng thực tế giả lập. Bấm **Gửi yêu cầu**. | Điều hướng tới chi tiết yêu cầu mới, có mã yêu cầu, trạng thái `NEW`; ghi lại mã này để tìm ở vai trò quản lý. |
| 4 | Tại chi tiết, thêm một bình luận hướng khách hàng, ví dụ “Lỗi xuất hiện từ sáng nay.”; mở **Lịch sử trạng thái**. | Bình luận và mốc tạo yêu cầu xuất hiện; thể hiện dữ liệu được lưu trên backend. |
| 5 | Đăng xuất, đăng nhập `service.manager@demo.local`, tenant `DEMO`. Mở **Yêu cầu dịch vụ** và chọn mã vừa tạo. | Service Manager nhìn thấy yêu cầu của khách hàng, thiết bị, trạng thái `NEW`, cùng nút xét duyệt phù hợp. |
| 6 | Bấm **Xem xét và kiểm tra bảo hành** (`review`). | Trạng thái thành `REVIEWING`; chi tiết hiển thị kết quả kiểm tra bảo hành từ Asset và lịch sử ghi lần đổi trạng thái. Với `DEMO-ASSET-01`, kết quả kỳ vọng là còn bảo hành (`IN_WARRANTY`). |
| 7 | Bấm **Tiếp nhận** (`accept`). | Trạng thái thành `ACCEPTED`, lịch sử có lần chuyển trạng thái tương ứng. Đây là điểm kết thúc luồng nghiệp vụ chạy được của bản hiện tại. |

Nếu muốn minh họa một nhánh khác, tạo **yêu cầu mới** cho `DEMO-ASSET-02` rồi xét duyệt. Thiết bị hết bảo hành chưa thể được tiếp nhận vì Cost Estimate thuộc giai đoạn tiếp theo; không dùng yêu cầu này thay cho luồng chính.

## Phần M2 có thể giới thiệu riêng

Mở `http://localhost:3003/health` để thấy Maintenance Service và database trả `up`. Giải thích đây là phần nền tảng M2 đã có; giao diện Maintenance Plan/Task, lịch chạy định kỳ, Work Order, phân công kỹ thuật viên, Service Report và Notification chưa có luồng demo hoàn chỉnh. Không trình bày trạng thái `PROCESSING`, `RESOLVED`, `CLOSED` như kết quả thao tác web hiện tại.

## Kiểm tra thực tế trước khi chốt kịch bản

- Ngày 26/10/2026: Gateway và web trả HTTP 200; Gateway báo bốn service M1 `up`; Maintenance health báo database `up`.
- Đã chạy seed Organization (2 khách hàng, 3 site) và Asset (3 thiết bị, 2 bảo hành) trên môi trường local. Service Request ban đầu có 0 yêu cầu, phù hợp để tạo trực tiếp khi demo.
- Đã đăng nhập qua Gateway và kiểm tra API đọc: Service Manager thấy 2 khách hàng, 3 thiết bị; Customer User thấy 1 khách hàng, 2 thiết bị, còn truy cập trực tiếp `DEMO-ASSET-03` trả 404.
- Đã sửa base URL Service Request ở `apps/web/src/api/config.ts` để web gọi đúng `/api/service-requests`; gọi danh sách qua Vite proxy trả HTTP 200. `pnpm --filter web lint`, `typecheck` và `build` đều đạt. Các thao tác tạo/xét duyệt/tiếp nhận ở bảng trên **chưa được chạy trên trình duyệt trong lần kiểm tra này**; nên chạy thử một lượt trước khi trình bày chính thức.

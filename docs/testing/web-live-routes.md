# Web: chuyển các route mẫu sang API thật — 04/11/2026

## Phạm vi

- Các alias dashboard `/dashboard`, `/app/dashboard`, `/admin`, `/portal` dùng
  dashboard thật theo tài khoản. Khi SR API lỗi, không hiển thị biểu đồ 0 hay
  kết luận không có yêu cầu; có nút tải lại.
- Tenant list/search/filter/pagination, tạo, sửa, chuyển trạng thái và mời
  Tenant Admin qua API Organization/Identity. Lời mời là bước riêng để lỗi
  đồng bộ không khiến người dùng tạo lại Tenant đã tồn tại.
- Chi nhánh list/search/pagination/create/update; người dùng list/search/filter/
  pagination/status/roles; danh mục roles đọc từ Identity.
- Customer Portal đọc sites/locations của customer trong phiên; profile lấy
  `/auth/me`. Settings/audit chưa có API công khai được hiển thị là chưa hỗ trợ,
  gỡ khỏi menu, không còn dữ liệu hoặc nút lưu giả.
- Route thật không import các sample page/store. Cấu hình mock cũ không còn
  chuyển endpoint nghiệp vụ sang Prism. Giữ fixture source và CSS để tham khảo.
- Organization routes chỉ cho Tenant Admin; backend vẫn kiểm tra quyền.
  UI không cho Tenant Admin tự đổi quyền/trạng thái hay sửa Tenant Admin khác.

## Kết quả

- `pnpm --filter web lint`: PASS.
- `pnpm --filter web typecheck`: PASS.
- `pnpm --filter web test`: 36 PASS (9 mới, 27 hồi quy).
- `pnpm --filter web build`: PASS; cảnh báo chunk lớn vẫn còn.
- Chromium desktop 1440×1000 và mobile 390×844: PASS cho tạo Tenant → mời Admin,
  tạo chi nhánh, sites/locations/profile, chặn customer vào trang users,
  dashboard khi SR API trả 503. Không có page error, mobile không tràn ngang.

Browser dùng phản hồi HTTP kiểm soát theo contract, không dùng backend thật.
Kiểm tra này xác nhận DOM, điều hướng và request của giao diện; không xác nhận
DB transaction, tenant isolation của backend hoặc gửi email thật. Gateway local
không chạy tại thời điểm kiểm tra. Không ghi dữ liệu vào database demo.

Script và ảnh kiểm tra phiên này: `/tmp/pbl6-ui-review/check.cjs`, `tenant.png`,
`portal-mobile.png` (artifact tạm, không phải file thuộc repository).

## Nghiệm thu khi stack hoạt động

1. Platform Admin tạo một Tenant; tải lại list/detail, sửa tên/gói và trạng thái.
   Kích hoạt Tenant, mời Admin và xác nhận email/activation ở kênh đã cấu hình.
2. Tenant Admin tạo/sửa chi nhánh; mời user, gán vai trò, tạm khóa/kích hoạt.
   Kiểm tra lỗi 409, 403, tài khoản hiện tại và Tenant Admin được bảo vệ.
3. Customer A/B đăng nhập riêng; so sites/locations/profile với dữ liệu của từng
   tài khoản; xác nhận URL customer khác bị backend từ chối.
4. Khi API trả lỗi, kiểm tra trạng thái lỗi/tải lại; đổi tài khoản khi request
   còn chạy, không hiển thị response cũ. Reload để xác nhận mutation được lưu.

Không coi các bước nghiệm thu stack thật ở trên đã PASS từ browser contract test.

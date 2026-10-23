# Web M1

Web React + Vite gọi Identity, Organization, Asset và Service Request qua API Gateway theo mặc định. Menu lấy vai trò từ `/auth/me`; backend quyết định quyền và phạm vi tenant/customer. Các trang M1 gồm khách hàng, thiết bị, yêu cầu dịch vụ, mời người dùng và đường dẫn QR `/portal/qr/{token}`.

## Chạy local

1. Chạy hạ tầng và các service M1 theo README ở root, migrate và seed DEMO.
2. Sao chép `apps/web/.env.example` thành `apps/web/.env.local`. Nếu đã có `.env.local` từ trước, đổi `VITE_M1_API_MODE=gateway` và bỏ `VITE_IDENTITY_API_URL=/identity` để Identity cũng đi qua gateway.
3. Chạy `pnpm dev:web` từ root, mở `http://localhost:5173`.

Vite chuyển tiếp `/gateway` đến `GATEWAY_PROXY_TARGET` (mặc định `http://localhost:3000`). Các API dùng `/api/identity`, `/api/organization`, `/api/assets` và `/api/service-requests`. Cấu hình `ASSET_QR_PORTAL_BASE_URL` của Asset phải trỏ đến origin web, ví dụ `http://localhost:5173/`; Asset phát link `<origin>/portal/qr/<token>`.

Phiên giữ access token trong bộ nhớ và refresh token trong `sessionStorage` của tab. Khi tải lại trang, web refresh rồi lấy `/auth/me`. Các request cùng lúc dùng chung một lần refresh. QR chỉ là mã nhận diện: trang QR luôn xác thực và gọi Asset `/qr/{token}` theo phạm vi của tài khoản.

Màn hình mời user nhận response có hoặc không có `activationToken`. Chỉ khi backend trả token (dev/test) web mới hiển thị link `/activate#token=…`; fragment không được gửi trong HTTP request. Customer Admin còn gắn tài khoản mới vào customer của mình qua Organization; nếu bước gắn lỗi, web giữ kết quả lời mời và cho thử lại. Luồng này phụ thuộc cập nhật Identity/Organization theo ADR 0008 D1 và D8.

## Kiểm tra

```powershell
pnpm --filter web lint
pnpm --filter web typecheck
pnpm --filter web build
./apps/identity-service/node_modules/.bin/tsx.ps1 apps/web/scripts/check-role-menu.ts
pnpm smoke:m1
```

`pnpm smoke:m1` cần stack thật. Các ca kiểm thử và kết quả ghi trong `docs/testing/m1-test-cases.md`.

## Mock contract tùy chọn

Chỉ dùng để kiểm tra giao diện khi service chưa chạy. Đặt `VITE_M1_API_MODE=mock` và `VITE_IDENTITY_API_URL=/identity` trong `.env.local`, rồi chạy ba Prism server trên cổng 4010–4012 theo `docs/api/{organization,asset,service-request}.yaml`. Sau đó có thể chạy `apps/web/scripts/smoke-mocks.ps1`. Prism không lưu thay đổi sau POST và không thay thế smoke test qua gateway.

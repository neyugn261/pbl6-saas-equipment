# Web M1

Web dùng React + Vite. Identity chạy thật; Organization, Asset và Service Request chạy với mock server tạo từ OpenAPI trong giai đoạn phát triển M1. Các trang prototype M2/M3 còn trong source để tham khảo nhưng không được route từ `App.tsx`.

## Chạy local

1. Chạy Identity, migration và seed theo README ở root.
2. Sao chép `apps/web/.env.example` thành `apps/web/.env.local`.
3. Mở ba terminal ở root:

   ```powershell
   pnpm dlx @stoplight/prism-cli mock docs/api/organization.yaml -p 4010
   pnpm dlx @stoplight/prism-cli mock docs/api/asset.yaml -p 4011
   pnpm dlx @stoplight/prism-cli mock docs/api/service-request.yaml -p 4012
   ```

4. Chạy `pnpm dev:web`, mở `http://localhost:5173`. Dùng tám tài khoản trong README root. Mật khẩu do `SEED_DEMO_PASSWORD` của máy quy định.

Vite chuyển tiếp `/identity` đến Identity và `/mock/*` đến ba mock server, nên trình duyệt chỉ gọi cùng origin. Prism trả dữ liệu mẫu theo schema và không giữ trạng thái sau POST; bước tích hợp cần dùng backend thật để chạy trọn luồng.
Nếu `pnpm dlx` không tải được CLI trên máy, có thể thay từng lệnh bằng `npm exec --yes --package @stoplight/prism-cli -- prism mock <file.yaml> -p <port>`.

Kiểm tra nhanh sau khi cả bốn server và Vite đã chạy:

```powershell
./apps/web/scripts/smoke-identity.ps1 -BaseUrl http://127.0.0.1:5173/identity
./apps/web/scripts/smoke-mocks.ps1
./apps/identity-service/node_modules/.bin/tsx.ps1 apps/web/scripts/check-role-menu.ts
```

Hai smoke script chỉ in trạng thái ca thử, không in mật khẩu hay token. Script Identity đọc `SEED_DEMO_PASSWORD` từ `.env` ở root. Bài kiểm tra menu đối chiếu tám vai trò với RBAC catalog.

## Tích hợp qua gateway

Đặt `VITE_M1_API_MODE=gateway` trong `.env.local`, sau đó khởi động lại Vite. Vite chuyển tiếp `/gateway` đến `GATEWAY_PROXY_TARGET` (mặc định `http://localhost:3000`); ba module M1 dùng `/api/organization`, `/api/assets`, `/api/service-requests` theo các OpenAPI hiện có. Identity vẫn chạy thật qua `/identity`. Kiểm tra lại route thực tế khi gateway của Member D được merge. Kết quả kiểm thử ghi vào `docs/testing/m1-test-cases.md`.

Phiên dùng access token trong bộ nhớ và refresh token trong `sessionStorage` của tab. Khi tải lại trang, web refresh rồi lấy `/auth/me`. Các request cùng lúc dùng chung một lần refresh đang chạy. Backend vẫn là nơi quyết định quyền và phạm vi tenant/customer.

## Kiểm tra

```powershell
pnpm --filter web lint
pnpm --filter web typecheck
pnpm --filter web build
```

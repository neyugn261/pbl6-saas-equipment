# Web M1

Web React + Vite gọi Identity, Organization, Asset và Service Request qua API Gateway theo mặc định. Menu lấy vai trò từ `/auth/me`; backend quyết định quyền và phạm vi tenant/customer. Các trang M1 gồm khách hàng, thiết bị, yêu cầu dịch vụ, mời người dùng và đường dẫn QR `/portal/qr/{token}`.

Giao diện dùng lại ngôn ngữ thiết kế Servio từ bản mẫu của Khương (sidebar, topbar, thẻ số liệu và trạng thái), nhưng dashboard lấy số liệu thật từ API trong phạm vi quyền của tài khoản. Các màn hình và dữ liệu giả của bản mẫu không được dùng để thay thế luồng M1.

## Luồng demo trên web

Sau khi seed dữ liệu DEMO, mở `/demo` từ menu **Luồng demo**. Dùng mật khẩu `SEED_DEMO_PASSWORD` của môi trường local và đổi tài khoản bằng nút Đăng xuất:

1. `customer.user@demo.local` xem thiết bị rồi tạo yêu cầu sửa chữa. Web lưu ID yêu cầu vừa tạo trong `sessionStorage` của tab, theo tenant, để các vai trò tiếp tục cùng yêu cầu.
2. `service.manager@demo.local` mở yêu cầu, chọn **Xem xét và kiểm tra bảo hành**, sau đó **Tiếp nhận**.
3. `customer.user@demo.local` đăng nhập lại, mở yêu cầu từ trang demo và xem trạng thái `ACCEPTED`, lịch sử và bình luận.

Trang demo chỉ dẫn tới các API M1 hiện có. ID lưu ở trình duyệt chỉ giúp điều hướng; backend vẫn kiểm tra tenant và quyền mỗi lần đọc hoặc cập nhật. Work Order và Service Report chưa có trong luồng web này.

Kịch bản thuyết trình, tài khoản theo vai trò và các bước kiểm tra trước giờ demo: [docs/demo/web-m1.md](../../docs/demo/web-m1.md).

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

## M2: thiết bị, yêu cầu, Work Order và bảo trì

Các trang `/app` và `/portal` của M2 gọi API thật qua Gateway, kể cả khi cấu hình M1 đang ở chế độ mock. Khởi động các service Identity, Organization, Asset, Service Request, Work Order và Maintenance, chạy migration và seed DEMO theo README ở root trước khi mở web. Customer User chỉ có thể xem Service Request và phần tóm tắt đã công bố; Customer Admin được xem Maintenance theo phạm vi khách hàng của mình.

Web hiện có thao tác tạo Work Order từ Service Request `ACCEPTED`, phân công kỹ thuật viên, đổi lịch và hủy theo `allowedActions`; tạo/sửa/trạng thái Maintenance Plan; lập, gửi, sửa revision Cost Estimate và Customer Admin phản hồi; kết quả Service Request có thể làm mới để chờ event từ Work Order. Tổng tiền báo giá lấy từ response của backend. Xem ma trận quyền và các ca còn cần chạy trong [M2 web test cases](../../docs/testing/m2-test-cases.md). Bản build và kiểm tra tĩnh không thay thế nghiệm thu thao tác trên trình duyệt và Android.

Nút yêu cầu Work Order thay thế của Maintenance Task được bật khi backend có consumer `MaintenanceWorkOrderReplacementRequested.v1` và migration Work Order mới đã chạy. Sau khi cập nhật từ `develop`, chạy `pnpm --filter workorder-service db:migrate` trước khi thử luồng này. Đặt `VITE_M2_REPLACEMENT_ENABLED=false` trong `.env.local` nếu môi trường triển khai chưa có consumer; khởi động lại Vite sau khi đổi biến. Web giữ cùng `requestId` trong phiên trang để gửi lại an toàn và tự làm mới hành trình khi yêu cầu còn `PENDING`.

Kiểm tra API thật bằng `node --env-file=.env apps/web/scripts/verify-m2-issue33.mjs` từ root. Lệnh cần stack local và dữ liệu DEMO. Có thể thêm `--expect-maintenance-outage` khi chủ động tắt Maintenance Service để kiểm tra trạng thái `UNAVAILABLE`. Chế độ `--exercise-replacement` hủy Work Order đang liên kết và tạo yêu cầu thay thế trên dữ liệu DEMO; chỉ chạy khi có thể chấp nhận thay đổi dữ liệu kiểm thử. Kết quả kiểm tra chi tiết: [docs/testing/m2-web-issue33.md](../../docs/testing/m2-web-issue33.md).

Thêm `--exercise-equipment-update` để kiểm tra PATCH hồ sơ, xác nhận tình trạng với lý do và quyền sửa. Chế độ này ghi lịch sử xác nhận trên thiết bị DEMO rồi phục hồi các trường hồ sơ ban đầu.

## Mock contract tùy chọn

Chỉ dùng để kiểm tra giao diện khi service chưa chạy. Đặt `VITE_M1_API_MODE=mock` và `VITE_IDENTITY_API_URL=/identity` trong `.env.local`, rồi chạy ba Prism server trên cổng 4010–4012 theo `docs/api/{organization,asset,service-request}.yaml`. Sau đó có thể chạy `apps/web/scripts/smoke-mocks.ps1`. Prism không lưu thay đổi sau POST và không thay thế smoke test qua gateway.

## Ghi nhận thiết bị sau bàn giao (ADR 0012)

Menu **Hồ sơ bàn giao** mở `/app/equipment-registrations`; nút **Ghi nhận bàn giao**
chạy wizard 5 bước, có chọn/thêm Customer, Site, Location, Contact, Model,
Equipment mới hoặc máy đã có; Warranty/Plan CREATE, KEEP, NONE hoặc lưu chưa
xác nhận. `/app/customers` và `/app/equipment-models` dùng danh mục thật.
Không cần nhập UUID hoặc tạo Equipment bằng công cụ API trước.

Chạy migration Asset/Maintenance trước khi mở. Đăng nhập Service Manager để
hoàn tất; Tenant Admin lưu draft và nhờ Service Manager xác nhận Maintenance.
PENDING có nút kiểm tra/tiếp tục; kết quả POST chưa rõ được lookup lại theo
key gốc. QR được cấp, tải ảnh và in sau hoàn tất. Danh sách thiết bị có lọc
tiến độ thiết lập và phân trang phía server.

```sh
pnpm --filter web test
pnpm --filter web lint
pnpm --filter web build
```

Thiết kế, migration và kết quả API/browser: [equipment-registration.md](../../docs/testing/equipment-registration.md).

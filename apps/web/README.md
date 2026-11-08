# Web M1

Web React + Vite gọi Identity, Organization, Asset và Service Request qua API Gateway theo mặc định. Menu lấy vai trò từ `/auth/me`; backend quyết định quyền và phạm vi tenant/customer. Các trang M1 gồm khách hàng, thiết bị, yêu cầu dịch vụ, mời người dùng và đường dẫn QR `/portal/qr/{token}`.

Web sử dụng giao diện **Workshop** (xám ấm, cam đất, điều hướng ngang) cho cả 8 vai trò, kết hợp bàn xử lý **Field Desk** và hồ sơ **Casebook**. Menu, dashboard và thao tác theo vai trò hiện hành; khách hàng dùng `/portal`, quản trị nền tảng dùng `/admin`, nhân viên dùng `/app`. Dashboard, danh sách và hồ sơ lấy dữ liệu thật từ API trong phạm vi quyền của tài khoản; dữ liệu bản mẫu không được dùng để thay thế luồng ứng dụng. Flutter trong `apps/mobile` là ứng dụng riêng và không thay đổi trong đợt này.

### Không gian Service Manager

- `/dashboard`: nhóm **Cần tôi xử lý / Chờ khách hàng / Chờ đội thực hiện / Cần xem lại kết quả**. Bao gồm yêu cầu đã tiếp nhận, chờ thông tin/chi phí, bàn giao, bảo trì thất bại và kết quả chờ xác nhận. Mỗi nguồn lấy tối đa 6 hồ sơ; hỗ trợ hồ sơ cũ trước hoặc ưu tiên cao trước ở nguồn có API tương ứng. Tổng từng bộ lọc lấy từ server, không cộng trùng Request và WO. Lỗi dữ liệu hiển thị riêng và không được coi là số 0.
- `/app/work-orders`: mặc định bảng công việc, có thể chuyển **Danh sách**. Mỗi cột gọi server theo trạng thái và bộ lọc, tối đa 4 hồ sơ; **Xem danh sách đầy đủ** giữ bộ lọc và hỗ trợ phân trang. Lệnh hoàn tất/đã hủy có thể chọn qua bộ lọc trạng thái hoặc xem trong danh sách.
- `/app/equipment/:id`: khối nhận dạng, serial, khách hàng, địa điểm, bàn giao, bảo hành theo lịch và tình trạng đã ghi nhận. Có mục lịch sử phụ tùng đã xác nhận sử dụng/điều chỉnh; cùng component phục vụ `/portal/equipment/:id` qua API Asset đã lọc quyền. Không lấy lượng xuất kho làm lượng đã lắp, không tự suy ra chi phí hoặc gia hạn bảo hành.
- Chi tiết WO dùng địa điểm đã lưu trên lệnh; vị trí hiện tại của máy có nhãn riêng. Đầu hồ sơ tách trạng thái công việc, kết quả kỹ thuật, tình trạng máy, xác nhận yêu cầu và đối soát phụ tùng. Lỗi reservation đang giữ giải thích cần phối hợp kho.
- Dispatcher/Tenant Admin cùng sử dụng bảng và hồ sơ WO; kỹ thuật viên web giữ thao tác thực hiện theo `allowedActions`. Lọc đội ngũ theo chi nhánh/kỹ năng và xem trước lệnh đang giao; chưa có cơ chế tự chặn lịch trùng.
- Các vai trò khác có dashboard chọn nhóm theo dõi và liên kết đúng loại hồ sơ. Style Workshop áp dụng cho trang con, biểu mẫu, bảng, kho, quản trị và portal trong shell chung. Menu vẫn lấy từ catalog quyền hiện hành.

Chi tiết triển khai, kiểm tra và giới hạn nghiệm thu: [báo cáo Workshop UI](../../docs/reports/2026-11-07-service-manager-workshop-ui.md).

Đợt mở rộng toàn web và các phần cần backend tiếp tục: [bàn giao Workshop và nghiệp vụ](../../docs/reports/2026-11-08-workshop-web-rollout.md). Xác nhận thay khách hiện được ghi nhãn và hướng dẫn ghi căn cứ trong trao đổi; API chưa có bộ trường bằng chứng bắt buộc. Đối chiếu dự toán/thực hiện là phần đọc hỗ trợ kiểm tra, chưa phải cơ chế phê duyệt phát sinh hoặc điều kiện đóng hồ sơ mới.

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

Các trang `/app` và `/portal` gọi API thật qua Gateway. Khởi động các service Identity, Organization, Asset, Service Request, Work Order và Maintenance, chạy migration và seed DEMO theo README ở root trước khi mở web. Customer User chỉ có thể xem Service Request và phần tóm tắt đã công bố; Customer Admin được xem Maintenance theo phạm vi khách hàng của mình.

Web hiện có thao tác tạo Work Order từ Service Request `ACCEPTED`, phân công kỹ thuật viên, đổi lịch và hủy theo `allowedActions`; tạo/sửa/trạng thái Maintenance Plan; lập, gửi, sửa revision Cost Estimate và Customer Admin phản hồi; kết quả Service Request có thể làm mới để chờ event từ Work Order. Tổng tiền báo giá lấy từ response của backend. Xem ma trận quyền và các ca còn cần chạy trong [M2 web test cases](../../docs/testing/m2-test-cases.md). Bản build và kiểm tra tĩnh không thay thế nghiệm thu thao tác trên trình duyệt và Android.

Nút yêu cầu Work Order thay thế của Maintenance Task được bật khi backend có consumer `MaintenanceWorkOrderReplacementRequested.v1` và migration Work Order mới đã chạy. Sau khi cập nhật từ `develop`, chạy `pnpm --filter workorder-service db:migrate` trước khi thử luồng này. Đặt `VITE_M2_REPLACEMENT_ENABLED=false` trong `.env.local` nếu môi trường triển khai chưa có consumer; khởi động lại Vite sau khi đổi biến. Web giữ cùng `requestId` trong phiên trang để gửi lại an toàn và tự làm mới hành trình khi yêu cầu còn `PENDING`.

Kiểm tra API thật bằng `node --env-file=.env apps/web/scripts/verify-m2-issue33.mjs` từ root. Lệnh cần stack local và dữ liệu DEMO. Có thể thêm `--expect-maintenance-outage` khi chủ động tắt Maintenance Service để kiểm tra trạng thái `UNAVAILABLE`. Chế độ `--exercise-replacement` hủy Work Order đang liên kết và tạo yêu cầu thay thế trên dữ liệu DEMO; chỉ chạy khi có thể chấp nhận thay đổi dữ liệu kiểm thử. Kết quả kiểm tra chi tiết: [docs/testing/m2-web-issue33.md](../../docs/testing/m2-web-issue33.md).

Thêm `--exercise-equipment-update` để kiểm tra PATCH hồ sơ, xác nhận tình trạng với lý do và quyền sửa. Chế độ này ghi lịch sử xác nhận trên thiết bị DEMO rồi phục hồi các trường hồ sơ ban đầu.

## Các route dùng dữ liệu thật

Các route vận hành gọi API thật. Studio DEV được tách riêng ở mục dưới. `VITE_M1_API_MODE=mock` và các biến URL
Prism cũ không còn chuyển nguồn dữ liệu của route. `VITE_GATEWAY_API_URL`
định nghĩa gốc Gateway; `VITE_IDENTITY_API_URL` vẫn cho phép dùng Identity
riêng khi phát triển.

- `/dashboard`, `/app/dashboard`, `/admin`, `/portal`: dashboard trong phạm vi
  tài khoản; lỗi API không được hiển thị như biểu đồ hoặc danh sách rỗng.
- `/tenants`, `/admin/tenants`: danh sách có tìm kiếm, lọc và phân trang server.
  Tạo, sửa, thay đổi trạng thái tại `/admin/tenants/new` và `/admin/tenants/:id`.
  Mời Tenant Admin là bước riêng sau khi tạo Tenant; có thể thử lại khi Identity
  chưa đồng bộ mà không tạo thêm Tenant.
- `/app/organization/branches`: đọc, tạo và sửa chi nhánh.
- `/app/organization/users`: đọc, tìm kiếm, phân trang, tạm khóa/kích hoạt và
  gán vai trò. UI không cho tự thay đổi quyền hoặc quản lý Tenant Admin bằng
  tài khoản Tenant Admin; backend vẫn là nơi kiểm tra quyền cuối cùng.
- `/app/organization/roles`: danh mục vai trò thật từ Identity; không có số
  người dùng hoặc mô tả quyền tự tạo từ fixture.
- `/portal/locations`: địa điểm và vị trí từ customer hiện tại.
- `/portal/profile`: hồ sơ thật từ `/auth/me`, chỉ đọc vì chưa có API tự sửa.

Các trang settings/audit cũ thông báo chưa hỗ trợ và không còn nằm trong menu.
Không dựng số liệu, log hoặc nút lưu giả cho các chức năng chưa có API.
Các file bản mẫu được giữ làm tài liệu giao diện, không được import vào route
hay provider của ứng dụng. CSS bản mẫu vẫn được dùng lại để giữ thiết kế.

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

## M3: thông báo và thử lại giao dịch kho

Notification gọi trực tiếp gốc `/api/notifications` qua Gateway cho danh sách,
`/unread-count` cho badge và `/:id/read` để đánh dấu đã đọc.

Nhập, điều chỉnh, xuất và trả kho lưu cùng key, đường dẫn và nội dung vào
`sessionStorage` trước khi gửi. Nếu mất phản hồi, form khóa và có nút **Thử lại
giao dịch đã lưu**; tải lại hoặc rời rồi mở lại trang trong cùng tab vẫn khôi phục
giao dịch đó. Giao dịch được tách theo tenant và user; đăng nhập lại cùng tài khoản
có thể tiếp tục đối soát, tài khoản khác không thấy/gửi lại giao dịch đã lưu.
Phiên cũ không được gửi lại hoặc xóa giao dịch của phiên mới.

Lỗi nghiệp vụ được trả rõ ngay lần gửi đầu cho phép sửa form. Sau khi kết quả đã
không rõ, lỗi quyền hoặc lookup thất bại không đủ để bỏ giao dịch đã lưu. Với xuất
kho, bằng chứng `COMMITTED`/`ABORTED` hoặc khôi phục thành công cho cùng key giải
quyết giao dịch đang chờ; phần đối soát reservation phía server vẫn hiển thị riêng.
Đóng tab hoặc xóa dữ liệu trình duyệt sẽ mất bản lưu tại web: cần đối soát lịch sử
kho trước khi tạo lại một giao dịch chưa rõ kết quả.

`pnpm --filter web test` bao gồm kiểm thử hồi quy mất phản hồi, tải lại trang,
đổi phiên, thao tác lặp và URL Notification từ component qua API client thật.
Phạm vi và kết quả: [M3 acceptance matrix](../../docs/testing/m3-test-cases.md).

## Workshop: thiết kế UI trước API (08/11/2026)

Chạy `pnpm --filter web dev`, mở **http://localhost:5173/design/workshop**.
Đây là studio chỉ có trong DEV, không yêu cầu tài khoản, có nhãn dữ liệu minh họa
và không gọi API. Đổi góc nhìn trong studio không đổi phiên đăng nhập hay quyền thật.
Studio và fixture không được import vào route vận hành; build production loại studio.

12 hành trình cho 8 role: sự cố, trách nhiệm, dự toán, lịch điều phối, thực hiện/báo cáo,
phiếu kho, xác nhận kết quả, bảo trì, bàn giao, tổng quan/hồ sơ nguồn, tài khoản,
tài liệu/thông báo/lịch sử. Có bộ chọn trạng thái loading, rỗng, nguồn lỗi, thiếu quyền,
chỉ đọc, chưa rõ kết quả và xung đột. Biên nhận/in/tải trong studio đều là minh họa.

Route thật đã sửa khóa khôi phục dự toán, lựa chọn thiết bị độc lập kết quả tìm,
xác nhận đúng revision, số lượng kho, preview kỳ bảo trì và textarea báo cáo.
Yêu cầu mới có mã lỗi/liên hệ/hiện trường; hiện gửi các nội dung bổ sung **trong mô tả**,
không giả định có trường API riêng. Báo cáo một phần cần ghi phần còn lại trong tóm tắt.

Nháp Request/Estimate/Report lưu trong `sessionStorage`, tách tài khoản/tenant/customer/hồ sơ,
thông thường hết hạn sau 12 giờ. Dấu lần gửi chưa rõ kết quả được giữ để đối soát,
không tự hết hạn thành một form được gửi lại. Không có đồng bộ nháp giữa tab/thiết bị.
Đóng tab/xóa dữ liệu trình duyệt có thể mất nháp. Kho tiếp tục dùng cơ chế key/khôi phục riêng.

Tách tải nhóm route và panel chưa mở; panel đã mở giữ editor. Mục hồ sơ có deep link
`#section=...`. Lỗi tải bundle có màn hướng dẫn tải lại, không để app trống.

Báo cáo triển khai, kiểm thử và nhận xét khắt khe:
[2026-11-08-workshop-ui-v2-acceptance.md](../../docs/reports/2026-11-08-workshop-ui-v2-acceptance.md).

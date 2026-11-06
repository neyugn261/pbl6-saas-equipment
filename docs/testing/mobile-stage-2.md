# Mobile — giai đoạn 2: thông báo thật cho Technician

Ngày: 07/11/2026. Tiếp tục trên nhánh `feature/mobile-m3-stage-0-1`, sau commit
`9b4a569` của [giai đoạn 0–1](mobile-stage-0-1.md). Phạm vi là tích hợp mobile
với Notification Service hiện có. Không thay schema, RBAC, event contract,
recipient policy hoặc luồng backend.

## Chức năng và điều kiện chấp nhận

| Công việc | Kết quả |
| --- | --- |
| Thay màn hình chờ ở nút chuông bằng hộp thư thật | DONE, entry point production; preview giữ dữ liệu minh họa riêng |
| Badge chưa đọc | DONE, lấy chính xác `unreadCount` từ server, không đếm trang đang tải; trên 99 hiển thị `99+` |
| Danh sách phân trang | DONE, 20 mục/trang, tổng và số trang từ API; đổi filter về trang 1 |
| Bộ lọc | DONE: tất cả, chưa đọc, đã đọc |
| Đánh dấu một thông báo | DONE, nút riêng hoặc tự đánh dấu khi mở chi tiết; chặn gửi lặp cùng ID khi đang chờ |
| Cập nhật sau khi đọc | DONE, đọc lại count từ server và tải lại danh sách, không trừ nhẩm từ trang hiện tại |
| Lỗi khi đánh dấu đã đọc | DONE, báo chưa xác nhận, cho kiểm tra lại và thử lại; không tự replay PATCH sau 401/refresh |
| Chi tiết thông báo | DONE, nội dung do server cung cấp dưới dạng text và thời điểm theo giờ Việt Nam |
| Mở WO từ thông báo | DONE, chỉ `WORK_ORDER` với UUID hợp lệ; GET lại WO và kiểm tra đúng ID trước khi mở màn hình đọc/thực hiện hiện có |
| Liên kết đã hết quyền | DONE, 403/404 hiển thị ngay tại thông báo, không mở dữ liệu cũ; WO vẫn kiểm tra assignment khi thao tác |
| Loại tài nguyên khác | DONE, đọc được nội dung; không gán SR/Equipment/Stock/loại mới thành WO, không mở URL tùy ý |
| Loading/empty/error/retry | DONE, lỗi list/count không biến thành 0 hoặc dữ liệu preview |
| Foreground và polling | DONE, cập nhật mỗi 30 giây khi foreground; dừng khi inactive/paused/disposed; refresh ngay khi resumed |
| Scope session và phản hồi đến muộn | DONE, repository/controller theo workspace, bỏ phản hồi của filter cũ/session đã đóng; không lưu cache notification qua logout |
| Recipient projection mất hiệu lực khi đang mở app | DONE, lỗi count làm tải lại hộp thư; 403 không để lại các dòng cũ như dữ liệu còn được phép đọc |
| Trợ năng và màn hình nhỏ | DONE, nút chuông có nhãn và số chưa đọc riêng; kiểm tra viewport 360dp và text scale 1.5 |

Thông báo được gửi theo recipient matrix của backend. Với Technician thuần,
đợt này kiểm thử thông báo **được phân công WO**. Không tự tạo thông báo tạm
dừng, hoàn thành hoặc hủy gửi riêng cho Technician nếu backend chưa có chính
sách đó. Tài khoản nhiều role có thể nhận loại thông báo khác và vẫn đọc được
nội dung tại hộp thư.

Đây là **in-app notification**. Không có FCM, thông báo hệ điều hành, socket
hoặc background service khi app đóng. Polling chỉ chạy khi có session và app
ở foreground. Số chưa đọc đổi làm mới danh sách; người dùng vẫn có nút tải lại
và pull-to-refresh để đọc lại nội dung cùng một số lượng thông báo.

## Contract sử dụng

| Phương thức | Gateway route | Mục đích |
| --- | --- | --- |
| GET | `/api/notifications?page=1&pageSize=20&readStatus=ALL` | Danh sách của principal hiện hành |
| GET | `/api/notifications/unread-count` | Tổng chưa đọc của principal |
| PATCH | `/api/notifications/:id/read` | Đánh dấu một dòng thuộc principal, idempotent |
| GET | `/api/workorders/work-orders/:id` | Kiểm tra lại quyền trước khi mở WO |

Không truyền `tenantId`, `userId` hoặc `customerId` để chọn chủ sở hữu hộp thư.
SessionController cấp token, refresh tuần tự và không replay mutation. Nội dung
chỉ dùng các trường public `title`, `body`, `resourceType`, `resourceId`,
`createdAt`, `readAt`; không đọc raw event payload. Server tiếp tục enforce
`notification:read`, recipient snapshot và tenant/user/customer scope.

## Kiểm tra

| Kiểm tra | Kết quả |
| --- | --- |
| Flutter suite đầy đủ | PASS: 151 test, 2 suite backend opt-in SKIP |
| Test mới của giai đoạn 2 | 22 test: API/DTO, count, race, session disposal, UI, phân trang/filter/read, quyền WO, polling, trợ năng, PATCH 401 và recipient projection hết quyền |
| Flutter analyze | PASS, không có issue |
| APK debug mặc định | PASS; dùng Gateway `http://10.0.2.2:3000` |
| Gateway + PostgreSQL + RabbitMQ thật | PASS: Identity bootstrap hai tenant COMPLETED, 22 thông báo của Technician A, hai trang, filter, mark-read lặp giữ nguyên readAt, count 21; tài khoản khác cùng tenant và khác tenant nhận 404 khi PATCH ID của A |
| Android API 36 | PASS: login thật, badge 21 → đọc một mục còn 20 → mở chi tiết còn 19 → mở WO đúng scope → nhận phân công mới khi app ở nền → foreground badge 20 |
| Fixture giai đoạn 0 sau khi mở rộng harness | PASS, cấu hình mặc định vẫn kiểm tra sáu service/Gateway và checklist bảo trì |

[Ảnh chụp và kết quả máy đọc được](artifacts/mobile-stage02/README.md) có hash
APK dùng cho lượt Android với Gateway test. APK debug mặc định được build lại
sau UAT, có cấu hình Gateway khác nên không dùng hash này để nhận diện nó.

Fixture dùng handler Notification thật trên exchange/queue riêng của test;
Identity CLI bootstrap ghi outbox thật, relay được giới hạn vào hai tenant UUID
của lượt chạy. Sự kiện phân công do Work Order API sinh ra. Không seed trực tiếp
notification/recipient snapshot để làm hộp thư trông như đã tích hợp.

## Tái hiện

Chuẩn bị hạ tầng/test database như [giai đoạn 0–1](mobile-stage-0-1.md).
Cần thêm `NOTIFICATION_TEST_DATABASE_URL` trỏ đúng `notification_test_db`, cùng
`RABBITMQ_TEST_URL` (hoặc broker local qua `RABBITMQ_URL`). Tool từ chối DB dev;
không tự suy ra URL test khi thiếu biến. Credential chỉ nằm trong `.env` local.

Từ repository root:

```bash
pnpm build:packages
pnpm --filter identity-service --filter organization-service --filter asset-service --filter maintenance-service --filter workorder-service --filter service-request-service --filter notification-service --filter api-gateway build
node apps/mobile/tool/stage02_fixture.cjs
# Hoặc giữ stack phục vụ Android:
node apps/mobile/tool/stage02_fixture.cjs --serve
```

`stage02_fixture.cjs` dùng chung harness của giai đoạn 0, thêm Notification và
Identity bootstrap; mặc định giai đoạn 0 không đổi. Có bảy service với DB riêng
và một Gateway, cổng loopback ngẫu nhiên. Chờ log PASS và manifest READY.
Manifest `/tmp/pbl6-mobile-stage02-runtime.json` có quyền `0600`, chứa mật khẩu
ngẫu nhiên và thông tin test; không commit/upload manifest vào PR.
Có thể đặt `MOBILE_STAGE01_RUNTIME` để chọn đường dẫn khác của harness chung.

Dùng một emulator riêng như hướng dẫn giai đoạn 0, sau khi boot:

```bash
python3 apps/mobile/tool/stage02_android.py --device emulator-5556 --reset-test-app
```

Tool từ chối điện thoại vật lý và yêu cầu xác nhận reset app test bằng cờ trên.
Nó cài APK trỏ Gateway test, login thật, kiểm tra badge, lọc/đánh dấu đã đọc,
mở thông báo rồi WO, đưa app về nền, phân công thêm qua API và kiểm tra badge
sau khi trở lại foreground. Kết quả/ảnh/hash APK nằm ở
`/tmp/pbl6-mobile-stage02-android`. Mỗi lượt cần fixture mới vì đã thay đổi cờ
đã đọc và tạo thêm phân công.

Kết thúc: Ctrl+C stack fixture để đóng service và xóa queue/exchange riêng;
dữ liệu UUID ở DB test được giữ lại để điều tra. Build lại APK debug mặc định
để tránh bàn giao APK trỏ cổng test đã đóng:

```bash
cd apps/mobile
flutter analyze --no-pub
flutter test --no-pub --reporter expanded
flutter build apk --debug --no-pub
```

## Giới hạn và chuyển giai đoạn

Việc nhận thông báo phụ thuộc Notification Service có recipient projection
đúng và Identity bootstrap hoàn tất. Thiếu projection sẽ trả 403; app hiện lỗi
để kiểm tra cấu hình, không bỏ qua quyền. Chưa nghiệm thu thiết bị vật lý/iOS
hoặc push khi đóng app. Backend race SR/WO ghi ở giai đoạn 0–1 còn là đầu việc
riêng trước khi chốt toàn M3.

Sau khi các kiểm tra trên PASS, có thể tiếp tục **giai đoạn 3: phụ tùng chỉ đọc
cho Technician**. Không suy ra notification của toàn bộ role/Web đã được
nghiệm thu từ kết quả mobile này.

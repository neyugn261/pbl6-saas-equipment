# Mobile — giai đoạn 3: phụ tùng chỉ đọc cho Technician

Ngày: 07/11/2026. Nhánh `feature/mobile-m3-stage-0-1`, tiếp tục từ commit
`988e165` của giai đoạn 2. Scope: thay placeholder của tab Phụ tùng trong WO
bằng dữ liệu Inventory thật, có kiểm thử và hướng dẫn tái hiện. Không thay
database/schema, RBAC, event, API hoặc workflow backend.

## Nghiệp vụ và phạm vi

[ADR 0015](../decisions/0015-inventory-accountability-and-service-parts.md)
thay cách viết tắt cũ trong ADR 0006. Mobile giữ đúng ý nghĩa:

| Trường API | Hiển thị | Ý nghĩa |
| --- | --- | --- |
| `quantityIssued` / `quantityUsed` | Đã cấp | Số xuất ban đầu, không phải số đã dùng |
| `quantityReturned` | Đã trả | Gồm các tình trạng trả về; không phải tất cả đều vào tồn sẵn sàng |
| `quantityOutstanding` | Đã cấp chưa trả | Đã cấp − đã trả, gồm cả phần đã xác nhận dùng |
| `quantityConfirmedUsed` / `quantityConsumed` | Đã xác nhận dùng | Số được backend ghi nhận sau xác nhận/đính chính |
| `quantityUnreconciled` | Chưa đối soát | Đã cấp − đã trả − đã xác nhận dùng |

Ví dụ fixture đang làm: cấp `5.50 l`, trả `1.75 l` → chưa trả `3.75 l`, đã
xác nhận dùng `0.00 l`, chưa đối soát `3.75 l`. Không hiển thị `3.75 l` là đã
dùng. Fixture completed: cấp `3.50 l`, trả `0.50 l`, xác nhận ròng `1.50 l`
→ chưa trả `3.00 l`, chưa đối soát `1.50 l`.

Inventory hiện có API Technician xác nhận dùng sau report và API kho cấp/trả/
đính chính. **Giai đoạn này là màn hình chỉ đọc**: không thêm form hay gọi các
mutation đó từ mobile. Tool fixture có dùng các API này để dựng dữ liệu thật.
Không mở quản lý kho toàn tenant, Request Part, báo giá, thanh toán hoặc suy
ra giá khách hàng từ `unitCost` nội bộ.

Phần chưa đối soát không tạo thêm điều kiện chặn complete trên mobile: xác
nhận dùng theo ADR 0015 diễn ra sau khi đã có report. Gate reservation đang
HELD trước complete/cancel vẫn do Work Order Service thực thi.

## Checklist hoàn thành

| Công việc | Kết quả |
| --- | --- |
| Tab Phụ tùng của WO | DONE, dùng `GET /api/inventory/work-orders/:id/parts` |
| Đúng WO, đúng scope | DONE, kiểm tra ID WO trên từng dòng; backend gọi WO để xác thực scope bằng JWT người dùng |
| Tên/mã/đơn vị/kho lịch sử | DONE, dùng `partSnapshot` và `warehouseSnapshot` tại lúc cấp, kể cả danh mục đã đổi tên/INACTIVE |
| Thiếu dữ liệu legacy | DONE, báo chưa ghi nhận tên/đơn vị/kho; giữ số lượng, không gọi danh mục hiện tại để giả lịch sử |
| Số lượng chính xác | DONE, giữ decimal string, kiểm tra bằng BigInt theo đơn vị 1/100; không dùng double, không làm tròn |
| Bốn trạng thái số lượng và số chưa trả | DONE, tách rõ theo bảng nghiệp vụ |
| Lịch sử trả | DONE, số lượng/thời điểm/GOOD, DAMAGED, PENDING_INSPECTION; giải thích hàng cách ly không sẵn sàng cấp |
| Lịch sử xác nhận/đính chính | DONE, giữ cả bản ghi gốc và đính chính; đánh dấu xác nhận đã bị đính chính |
| Lịch sử trả cũ chưa liên kết đầy đủ | DONE, báo rõ nếu tổng các dòng đã liên kết khác `quantityReturned`; không thay tổng bằng phần lịch sử thiếu |
| Tìm kiếm/lọc | DONE, theo tên/mã phụ tùng/kho và chưa đối soát; lọc trên toàn bộ array API, không phát sinh request danh mục |
| Trạng thái đọc | DONE, loading, empty thực, lỗi và retry; 403/404/503 không đổi thành danh sách rỗng |
| WO đã hoàn thành/hủy | DONE, tra cứu lịch sử theo quyền ever-assigned của WO, không yêu cầu current assignment để đọc |
| Foreground/tải lại | DONE, đọc lại WO và dữ liệu phụ tùng qua cơ chế refresh màn hình hiện có |
| Session/race | DONE, bỏ phản hồi của WO cũ, không render dữ liệu khi repository/session đã bị hủy |
| Màn hình nhỏ | DONE, card mở rộng, không dùng bảng ngang; test 360dp, text scale 1.5 |

API hiện trả array không phân trang. Số lượt cấp hiển thị dựa trên toàn bộ
array; không cộng số lượng khác đơn vị thành một tổng. Mỗi lượt cấp được mở
để xem chi tiết và lịch sử. Metadata mới không thể thay thế lịch sử bị thiếu.

## Kiểm tra đã chạy

| Kiểm tra | Kết quả |
| --- | --- |
| Flutter suite đầy đủ | PASS: 168 test, 2 suite backend opt-in SKIP |
| Test mới | 17 test: ý nghĩa lượng cấp/dùng, decimal cực trị, response sai, legacy, lịch sử, scope/session, filter, retry, terminal, foreground và màn hình nhỏ |
| Flutter analyze | PASS, không có issue |
| APK debug mặc định | PASS; Gateway debug `http://10.0.2.2:3000` |
| Gateway/DB/broker thật | PASS: cả fixture 0 và Notification, thêm 4 lượt cấp Inventory qua reservation thật; trả tốt/hỏng/chờ kiểm tra; completed confirm/reverse; đổi tên/INACTIVE vẫn giữ nhãn lúc cấp; empty; scope và quyền mutation |
| Android API 36 | PASS: login thật → WO đang làm/legacy → completed và xác nhận/đính chính → cancelled và trả chờ kiểm tra → WO chưa có phụ tùng |

Bằng chứng: [ảnh và kết quả Android](artifacts/mobile-stage03/README.md), có
hash APK UAT trỏ Gateway test. Hash này không nhận diện APK đã build lại với
Gateway mặc định sau lượt nghiệm thu.

Các kiểm tra API thật xác nhận: Technician B khác tenant và Technician chưa
từng được giao WO cùng tenant nhận 404; Customer nhận 403; Technician POST
cấp/trả nhận 403. Hoàn thành report, xác nhận và đính chính do các actor đúng
quyền thực hiện qua Gateway. Scope này không được kiểm tra bằng cách chỉ ẩn nút.

Fixture legacy **chỉ** đặt snapshot của một dòng test thành null bằng Prisma
của Inventory trong `inventory_test_db` để mô phỏng dữ liệu trước snapshot.
Số lượng, ledger, cấp/trả, confirmation và reversal đều đến từ API thật; không
ghi trực tiếp vào các bảng nghiệp vụ để giả các giao dịch đã chạy.

## Chạy lại

Chuẩn bị hạ tầng local và tám `*_TEST_DATABASE_URL` trỏ đúng database test của
từng service; bổ sung `INVENTORY_TEST_DATABASE_URL` và
`NOTIFICATION_TEST_DATABASE_URL` nếu `.env` cũ chưa có. Cấu hình broker test bằng
`RABBITMQ_TEST_URL` hoặc broker local `RABBITMQ_URL`. Harness từ chối DB dev và
không tự fallback khi thiếu URL test. Không commit `.env` hoặc runtime credential.

Từ repository root:

```bash
pnpm build:packages
pnpm --filter identity-service --filter organization-service --filter asset-service --filter maintenance-service --filter workorder-service --filter service-request-service --filter notification-service --filter inventory-service --filter api-gateway build
node apps/mobile/tool/stage03_fixture.cjs
# Hoặc giữ stack phục vụ Android:
node apps/mobile/tool/stage03_fixture.cjs --serve
```

Harness dùng chung fixture 0–2, thêm cờ `--parts`: tám service và Gateway ở
cổng loopback ngẫu nhiên, tenant UUID, Identity bootstrap và RabbitMQ exchange/
queue riêng. Relay chỉ lấy outbox của hai tenant test. Manifest
`/tmp/pbl6-mobile-stage03-runtime.json` chứa tài khoản/mật khẩu ngẫu nhiên,
quyền file `0600`; không upload manifest. `MOBILE_STAGE01_RUNTIME` chọn đường
dẫn khác cho harness chung. Dữ liệu UUID giữ trong DB test để điều tra; Ctrl+C
đóng stack và xóa queue/exchange riêng.

Dùng emulator riêng theo [hướng dẫn giai đoạn 0–1](mobile-stage-0-1.md), rồi:

```bash
python3 apps/mobile/tool/stage03_android.py --device emulator-5556 --reset-test-app
```

Tool chỉ chạy trên emulator và cờ reset cho phép xóa dữ liệu app test. Nó login
Identity thật, mở WO đang làm/completed/cancelled và kiểm tra các nhánh đọc.
Các yêu cầu Inventory do phần phụ tùng gửi đều là GET. Kết quả/ảnh/hash APK UAT nằm ở
`/tmp/pbl6-mobile-stage03-android`. Có thể chạy lại phần Android trên cùng
fixture vì luồng này chỉ đọc.

Sau UAT build lại APK với Gateway mặc định:

```bash
cd apps/mobile
flutter analyze --no-pub
flutter test --no-pub --reporter expanded
flutter build apk --debug --no-pub
```

## Chuyển giai đoạn

Giai đoạn 4 đã được triển khai và nghiệm thu sau bản này:
[camera và vòng đời upload](mobile-stage-4.md).

**Đủ chuyển sang giai đoạn 4** về độ bền vòng đời ảnh/upload. Đây không phải
kết luận phát hành toàn M3. Điện thoại vật
lý/iOS chưa nghiệm thu; lỗi đồng bộ SR/WO ghi ở giai đoạn 0–1 vẫn là đầu việc
backend riêng. Xác nhận dùng từ mobile, nếu cần mở ở giai đoạn khác, phải theo
contract sau report của ADR 0015 và không biến số chưa trả thành số đã dùng.

Backlog UX sẵn có: giữ bộ lọc Hiện tại/Lịch sử khi pull-to-refresh danh sách
công việc. Hiện `ReadView` thay child trong loading nên `PersonalJobs` khởi
tạo lại bộ lọc; đây là đầu việc cho đợt hoàn thiện lịch/UX.

# Mobile — hoàn thành giai đoạn 0 và 1

Ngày nghiệm thu: 07/11/2026. Nhánh `feature/mobile-m3-stage-0-1`, xuất phát từ
`origin/develop` tại `b5f182b110224ca9b865e05bbd943eb5acd00005`.

## Phạm vi đã chốt

Giai đoạn 0 chuẩn bị baseline, dữ liệu test và điều kiện nghiệm thu. Giai đoạn 1
hoàn thiện checklist đang có và khả năng giữ/khôi phục công việc đang nhập.
Mobile tiếp tục dành cho **Technician**; điều phối, quản trị, xét duyệt yêu cầu,
báo giá và khách hàng xác nhận kết quả thuộc Web/Customer Portal.

Checklist bảo trì **đã có backend thật**: Model Maintenance Profile → bàn giao
thiết bị → Plan/Task → Work Order với snapshot checklist và kết quả có version.
Đợt này hoàn thiện cách Technician sử dụng trên mobile, không tạo thêm service,
schema, trạng thái WO, permission hoặc API nháp trên server. Contract checklist
và điều kiện complete của Work Order Service tiếp tục quyết định cuối cùng.

Camera quét QR của Technician là tiện ích tùy chọn ở giai đoạn sau. Không cần
quét lại để mở thiết bị đã gắn với WO; Customer Portal vẫn là luồng quét QR
chính để nhận diện thiết bị và tạo yêu cầu. Camera chụp ảnh phục vụ bằng chứng
công việc có mục đích riêng, tiếp tục nằm trong luồng attachment.

## Giai đoạn 0 — baseline và dữ liệu nghiệm thu

| Việc | Kết quả |
| --- | --- |
| Lấy develop mới và tách nhánh mobile | DONE, baseline `b5f182b` |
| Xác nhận phạm vi Technician và phân kỳ | DONE, tài liệu này |
| Chạy baseline Flutter trước sửa | PASS: analyze; 109 test PASS, 2 opt-in SKIP; debug APK |
| Fixture hai tenant, hai customer trong tenant A, Technician khác | DONE, tài khoản UUID và mật khẩu ngẫu nhiên trong manifest riêng |
| WO đủ trạng thái/ngữ cảnh | DONE: assigned, in progress, on hold, completed, cancelled, reassigned, reject, hidden, other tenant, maintenance |
| Luồng bảo trì thật | PASS: profile → registration → scheduler → RabbitMQ → WO và checklist bắt buộc |
| Kiểm tra phạm vi truy cập thật qua Gateway | PASS: thiết bị tenant khác 404, customer khác cùng tenant 404, WO chưa từng được giao 404 |
| Health của sáu service và Gateway | PASS, cả bảy endpoint 200 |
| Ma trận chấp nhận giai đoạn 1 | DONE, bảng bên dưới |

`stage01_fixture.cjs` chỉ chấp nhận URL database test qua `@pbl6/testing`;
không fallback sang database dev. Nó migrate sáu DB test, khởi động sáu service
và Gateway ở cổng loopback ngẫu nhiên. Bootstrap tài khoản dùng client của đúng
service sở hữu DB; các entity và bước nghiệp vụ còn lại đi qua Gateway thật.
RabbitMQ dùng exchange/queue riêng từng lượt chạy; relay chỉ lấy outbox của hai
tenant fixture. Dữ liệu UUID giữ lại trong DB test để điều tra; tool đóng app,
xóa queue/exchange của lượt đó khi kết thúc bình thường.

## Giai đoạn 1 — checklist, nháp và phục hồi

| Việc | Cách hoạt động | Bằng chứng |
| --- | --- | --- |
| Giữ checklist khi chuyển tab | Panel đã mở được giữ mounted, không tạo lại form khi đổi tab | Widget test |
| Bảo vệ khi rời checklist | Chọn tiếp tục, bỏ thay đổi, lưu nháp và rời, hoặc lưu server và rời; chặn Back khi đang gửi | Widget test |
| Tiến độ checklist bắt buộc | Đếm DONE; N/A chỉ hợp lệ khi item cho phép và có lý do | Widget test |
| Xung đột version/409 | Giữ nội dung, báo xung đột và yêu cầu xác nhận trước khi bỏ để tải bản server | Widget test |
| Chặn complete khi còn chỉnh checklist | Nút complete khóa khi checklist dirty/busy hoặc có lần lưu chưa rõ kết quả | Widget test |
| Lưu nháp dùng chung | Record mã hóa, key theo Gateway/tenant/user/WO; checklist và report là section độc lập | Store test; Android thật |
| Phục hồi sau restart | Khôi phục checklist, ghi chú, các trường báo cáo và bước nhập; không tự submit | Store/widget test; Android force-stop |
| Phân công hoặc trạng thái đã đổi | Đọc WO/checklist mới; nháp của assignment cũ chỉ để đối chiếu, không gửi sang assignment mới | Widget/workflow test |
| Lỗi ổ lưu trữ | Hiển thị lỗi, giữ dữ liệu/marker lỗi để điều tra; phải ghi nhận bền vững ý định gửi trước POST | Store/workflow test |
| Lưu chưa rõ kết quả | Giữ operation ID, payload gốc và baseline history/log IDs qua restart; đối soát bằng dữ liệu server | Workflow test |
| Chống gửi trùng qua restart | Command WO chỉ đọc lại để đối soát; không tự replay POST sau timeout, logout hoặc đổi session | Workflow test |
| Phản hồi cũ về muộn | Xóa marker có điều kiện theo operation ID; không xóa marker mới hơn | Store test |
| Lưu checklist thành công | Xóa đúng nháp checklist và marker của lần lưu; nháp report giữ riêng | Widget test |
| Báo cáo hoàn thành | Xóa nháp khi server xác nhận; report thật và WO COMPLETED được đọc qua Gateway | Android thật |

Nháp tự lưu sau 250 ms từ thay đổi và khi về nền. Nút lưu nháp trước khi rời
chờ thao tác ghi hoàn tất. Nếu hệ điều hành giết process ngay trước khi autosave
chạy, ký tự vừa nhập có thể chưa xuống disk; không tuyên bố lưu từng phím một
cách nguyên tử. Native UAT chờ autosave rồi `am force-stop`, mở lại app và kiểm
tra nội dung còn nguyên.

Thông tin gửi chưa rõ kết quả được ghi trước POST và chờ native disk flush của
`pbl6/session_storage`. Khi mở lại, app chỉ đối soát WO/report/history/logs;
không có hàng đợi offline tự chạy. Complete so khớp nội dung report, technician
và liên kết report; note/history dùng ID có trước để không nhận nhầm dữ liệu cũ.
Nếu chưa có bằng chứng, nút gửi vẫn khóa và người dùng có thể kiểm tra lại.

Checklist có nút **Thử lại đúng lần lưu cũ** do người dùng chủ động chọn. Nó
giữ nguyên `expectedVersion` và payload; optimistic concurrency của backend
ngăn lần retry cập nhật lần hai. Nếu GET thấy server đã có version mới, app
đối chiếu kết quả thay vì POST lại. Nội dung khác trên server được báo xung đột,
không tự ghi đè.

Logout hủy navigation/dữ liệu đọc của session nhưng giữ nháp mã hóa và marker
để đúng tài khoản có thể khôi phục sau khi đăng nhập lại. Tài khoản/tenant hoặc
Gateway khác dùng key khác. Xóa dữ liệu app sẽ mất nháp. Đây không phải cơ chế
backup, đồng bộ nhiều thiết bị hay bảo đảm exactly-once của backend.

## Kiểm tra đã chạy

| Kiểm tra | Kết quả |
| --- | --- |
| `flutter analyze --no-pub` | PASS, không có issue |
| `flutter test --no-pub --reporter expanded` | PASS: 129 test; 2 opt-in backend suite SKIP vì không truyền cấu hình opt-in |
| `flutter build apk --debug --no-pub` | PASS; APK bàn giao dùng Gateway debug mặc định `http://10.0.2.2:3000` |
| Fixture với API/DB/broker thật | PASS: baseline dữ liệu, maintenance và isolation như bảng giai đoạn 0 |
| Android API 36, emulator dùng riêng | PASS: login Identity thật → mở maintenance WO → nhập checklist → force-stop → khôi phục → lưu checklist bắt buộc → nhập report → force-stop → khôi phục → submit → WO COMPLETED/report đọc lại đúng nội dung |

Bằng chứng Android: [kết quả và ảnh chụp](artifacts/mobile-stage01/README.md).
Hash trong JSON nhận diện APK dùng cho lượt UAT (cấu hình cổng Gateway test),
không phải APK build lại với Gateway mặc định. Hai suite opt-in lịch sử không
được tính là đã chạy; fixture và UAT mới ở đây là lượt integration riêng.

## Chạy lại fixture và nghiệm thu Android

Chuẩn bị `.env` local theo root README, sáu URL `IDENTITY_TEST_DATABASE_URL`,
`ORGANIZATION_TEST_DATABASE_URL`, `ASSET_TEST_DATABASE_URL`,
`MAINTENANCE_TEST_DATABASE_URL`, `WORKORDER_TEST_DATABASE_URL`,
`SERVICE_REQUEST_TEST_DATABASE_URL`; các DB phải đáp ứng guard test của repo.
Cấu hình `RABBITMQ_TEST_URL` cho broker local. Tool chấp nhận fallback
`RABBITMQ_URL`, vẫn dùng exchange riêng. Không commit `.env` hay credential.

Từ repository root:

```bash
pnpm build:packages
pnpm --filter identity-service --filter organization-service --filter asset-service --filter maintenance-service --filter workorder-service --filter service-request-service --filter api-gateway build
node apps/mobile/tool/stage01_fixture.cjs
```

Để chạy Android, thay lệnh cuối bằng lệnh giữ fixture phục vụ và chờ `PASS`:

```bash
node apps/mobile/tool/stage01_fixture.cjs --serve
```

Manifest `/tmp/pbl6-mobile-stage01-runtime.json` có quyền `0600`, chứa gateway,
tenant, tài khoản/mật khẩu test và các WO. Không in/upload manifest vào log/PR.
Đặt `MOBILE_STAGE01_RUNTIME` nếu cần đường dẫn khác. Không ghi đè manifest khi
fixture trước còn chạy. Dừng bằng Ctrl+C khi kiểm thử xong.

Mở một emulator dùng riêng; ví dụ API 36 dạng read-only trên cổng chưa sử dụng:

```bash
emulator -avd PBL6_API_36 -read-only -no-window -no-audio -no-snapshot-save -gpu swiftshader -port 5556
```

Từ terminal khác, sau khi emulator boot xong:

```bash
python3 apps/mobile/tool/stage01_android.py --device emulator-5556 --reset-test-app
```

Cờ reset cho phép cài và xóa dữ liệu **app test trên emulator chỉ định**; tool
từ chối thiết bị vật lý. Tool build APK trỏ đúng Gateway test, đăng nhập bằng
manifest, điều khiển UI qua adb/uiautomator, force-stop hai lần và đối chiếu
kết quả với Gateway. Python dùng thư viện chuẩn; cần Flutter/adb trong PATH.
Ảnh và kết quả nằm ở `/tmp/pbl6-mobile-stage01-android`. Mỗi lượt Android cần
fixture mới vì luồng cuối sẽ hoàn thành maintenance WO.

Sau UAT, build lại APK mặc định để không dùng cổng test đã đóng:

```bash
cd apps/mobile
flutter analyze --no-pub
flutter test --no-pub
flutter build apk --debug --no-pub
```

## Điều kiện chuyển giai đoạn

**Đủ chuyển sang giai đoạn 2 trong phạm vi mobile**: giai đoạn 0 và 1 có code,
fixture và bằng chứng chạy. Chưa phải kết luận chốt toàn M3 hoặc phát hành.

Cập nhật tiếp theo: [giai đoạn 2 — Notification](mobile-stage-2.md).

Các phần theo kế hoạch tiếp tục: notification thật; phụ tùng chỉ đọc cho
Technician; độ bền vòng đời ảnh/upload; lịch/hồ sơ và UX còn lại; UAT toàn nhóm
và thiết bị vật lý. QR scanner cho Technician không phải điều kiện chặn.
Không mở thêm thanh toán, GPS tracking, ERP hoặc workflow offline tự đồng bộ.

Phụ thuộc backend còn mở từ đợt rà soát develop: event WO cũ đến muộn có thể
đóng SR trong khi WO thay thế còn hoạt động. Ví dụ thứ tự nhận
`A-created → A-completed → B-created` để lại SR CLOSED và B CREATED.
Cần sửa và nghiệm thu riêng ở Service Request/Work Order trước khi chốt M3;
giai đoạn mobile này không thay contract hoặc sửa race đó. Android native UAT
của đợt này xác nhận WO/report; không dùng nó để tuyên bố race SR đã được xử lý.

Chưa nghiệm thu iOS, điện thoại vật lý, mất nguồn đúng thời điểm ghi disk hoặc
stress nhiều thiết bị cùng sửa. Backend vẫn chịu trách nhiệm tenant isolation,
authorization và concurrency; bản nháp local không cấp thêm quyền truy cập.

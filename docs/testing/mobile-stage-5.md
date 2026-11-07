# Mobile — giai đoạn 5: lịch, hồ sơ và trải nghiệm sử dụng

Ngày: 07/11/2026. Nhánh `feature/mobile-m3-stage-0-1`, tiếp tục từ
`66592bf` (giai đoạn 4). Đã fetch `origin/develop`: không có commit develop
chưa nằm trên nhánh, baseline develop vẫn là `36f0257`.

Phạm vi giai đoạn 5 là lịch dự kiến, hồ sơ/tùy chọn cá nhân và UX còn lại sau
giai đoạn 4. Không sửa nghiệp vụ backend, schema, RBAC hoặc thêm microservice.

## Checklist hoàn thành

| Hạng mục | Kết quả |
| --- | --- |
| Giữ bộ lọc công việc | DONE, Hiện tại/Lịch sử, query, trạng thái/loại/ưu tiên, khoảng ngày và trang nằm trong workspace của phiên |
| Refresh/lỗi/retry/foreground | DONE, giữ lựa chọn dù phần dữ liệu được tháo khi loading/lỗi; không render dữ liệu cũ trong trạng thái lỗi |
| Back và chuyển tab | DONE, giữ query/lịch khi về từ WO hoặc đổi tab |
| Shortcut Trang chủ | DONE, áp lại đúng bộ lọc và bỏ query/lọc cũ, kể cả bấm cùng shortcut lần nữa; bấm tab Công việc không xóa lọc |
| Phân trang | DONE, giữ trang khi dữ liệu mới còn đủ; co về trang hợp lệ khi danh sách thu nhỏ |
| Lịch Ngày/Tuần/Tháng | DONE, tuần bắt đầu thứ Hai, tháng có lưới 7 cột, số công việc theo ngày và agenda nhóm theo ngày bắt đầu |
| Chọn ngày/xem cả kỳ | DONE, chọn ô ngày để xem riêng ngày; có Xem cả tuần/tháng và Hôm nay |
| Mốc ngày | DONE, giờ Việt Nam UTC+7, biên cuối không gồm; xử lý qua năm, tháng nhuận và kẹp ngày khi chuyển tháng ngắn |
| Lịch sử/chưa xếp lịch | DONE, lịch sử cá nhân tùy chọn; nhóm chưa xếp lịch chỉ gồm WO hiện tại, không mất việc thiếu scheduledStart |
| Hồ sơ | DONE, Identity hiện hành, Technician/chi nhánh/kỹ năng chỉ đọc; revalidate cập nhật tên/email, không giữ snapshot Identity cũ |
| Giao diện | DONE, sáng/tối/theo hệ thống, lưu trên thiết bị, áp dụng cả login, giữ qua restart/logout; không làm mất route hoặc báo cáo đang nhập |
| Lỗi lưu tùy chọn | DONE, không báo đã đổi/lưu khi write thất bại; hiển thị lỗi an toàn và cho thử lại; không tự ghi đè record không đọc được |
| Tiếng Việt | DONE, Material picker/dialog/tooltip theo locale vi, dùng flutter_localizations từ SDK |
| Trợ năng | DONE, theo cỡ chữ thiết bị; test 360dp × scale 1.5 ở chế độ tối, lịch tháng/ngày nhuận và độ tương phản chữ trung tính |
| Hướng dẫn | DONE, workflow, checklist/report, tệp/khôi phục, mất mạng, thông báo, phụ tùng và chính sách nháp |
| Phiên bản ứng dụng | DONE Android, đọc version/build từ PackageManager của APK đã cài; lỗi có retry, không dùng số giả |
| Đăng xuất | DONE, xác nhận/Ở lại, giải thích giữ nháp theo tài khoản và mất nháp khi xóa dữ liệu app |
| Phạm vi dữ liệu | DONE, lựa chọn công việc/lịch không được dùng lại sau logout; chỉ giao diện là tùy chọn chung của thiết bị |

## Các quyết định giữ theo contract

Lịch lọc **ngày bắt đầu dự kiến** trong `PersonalWork` đã xác minh scope,
không phải mọi khoảng thời gian chồng lấn. WO bắt đầu hôm trước và kết thúc
hôm nay không tự được tính là bắt đầu hôm nay. Không thêm reschedule, kéo-thả,
lịch rảnh, GPS hoặc lịch hẹn khách đã xác nhận. Backend hiện trả start/end;
mobile không tự suy ra scheduledStart từ scheduledEnd.

Ngày đang xem và bộ lọc nằm trong state của workspace, ngoài subtree dữ liệu
của `ReadView`. Khi tải lại hoặc lỗi, subtree vẫn ẩn như trước; sau thành công
màn hình lấy lại lựa chọn từ workspace. Không sửa `ReadView` toàn app để hiện
dữ liệu cũ. Các lựa chọn này chỉ giữ trong tiến trình/phiên; không lưu query
hoặc lịch sử tìm kiếm xuống disk. Tài khoản/tenant đổi tạo workspace mới.

Giao diện là tùy chọn **chung của thiết bị**, không phải hồ sơ nghiệp vụ hay
preference trên server. Record chỉ có version/theme, dùng namespace và flush
adapter Android sẵn có; không chứa token, tài khoản hoặc nháp. Đổi theme không
tạo lại session/navigator. Không thêm toggle Technician tự đổi trạng thái,
sửa user, mật khẩu hoặc tenant khi chưa có contract self-service.

Camera tiếp tục phục vụ ảnh bằng chứng như giai đoạn 4, không bổ sung quét QR
cho Technician. Notification vẫn là in-app; không thêm system push ở đợt này.

## File chính

- `personal_jobs.dart`: bộ lọc, tìm kiếm và phân trang cá nhân.
- `work_calendar.dart`: lựa chọn, biên ngày/tuần/tháng, lưới và agenda.
- `live_workspace.dart`: sở hữu lựa chọn của phiên, profile mới và xác nhận logout.
- `features/preferences/`: tùy chọn giao diện, hướng dẫn, thông tin ứng dụng.
- `session_app.dart`, `main.dart`, `ui/theme.dart`, `ui/components.dart`: nạp/lưu
  giao diện, Material locale và màu theo theme, giữ nguyên navigation/session.
- Android `MainActivity.kt`: channel chỉ đọc version/build; adapter flush giữ nguyên.

`flutter_localizations` lấy từ Flutter SDK; chỉ thêm `intl 0.20.3` transitive
theo SDK hiện có. Tham khảo [hướng dẫn chính thức Flutter](https://docs.flutter.dev/ui/internationalization).
Không nâng các dependency nghiệp vụ khác.

## Kiểm tra

| Kiểm tra | Kết quả |
| --- | --- |
| Flutter analyze | PASS, không issue |
| Flutter suite đầy đủ | PASS 211 test, 2 suite backend opt-in SKIP |
| Test mới | 17 test cho refresh/retry/foreground/scope, shortcut, phân trang, calendar boundary/nhuận/UTC+7, preferences I/O, route/report, profile mới và theme/trợ năng |
| APK debug | PASS, bản Gateway fixture và bản Gateway mặc định sau UAT |
| Backend fixture | PASS, Identity thật, tám service/Gateway, DB test/RabbitMQ; regression fixtures 0–3 và lịch tạo qua public API |
| Android API 36 | PASS, giữ lọc/foreground/Back, giao diện qua restart, version APK, lịch/ngày/lịch sử, system theme và xác nhận logout |

[Bằng chứng Android](artifacts/mobile-stage05/README.md). Không tính hai suite
opt-in đã SKIP là backend PASS; backend thật được kiểm tra riêng bằng harness
và ứng dụng Android. Không dùng số PASS ở giai đoạn trước thay cho lượt chạy này.

## Chạy lại

Chuẩn bị tám `*_TEST_DATABASE_URL` và RabbitMQ test theo
[giai đoạn 3](mobile-stage-3.md#chạy-lại). Build shared packages, tám service và
Gateway trước. Không cần MinIO cho luồng UAT giai đoạn 5 chỉ đọc này.
Python 3 cần có Pillow để kiểm tra màu nền screenshot sau khi đổi giao diện.

```bash
node apps/mobile/tool/stage05_fixture.cjs --serve
python3 apps/mobile/tool/stage05_android.py --device emulator-5556 --reset-test-app
```

Fixture thêm `--experience` cho harness chung để tạo WO có lịch hôm nay/ngày
kế tiếp trước các workflow transition, qua public Create Work Order API.
Không sửa SQL ngày/trạng thái. Các fixture giai đoạn 0–4 không đổi lịch.
Runtime `/tmp/pbl6-mobile-stage05-runtime.json` chứa credential ngẫu nhiên,
quyền `0600`, không upload. Android tool chỉ cho emulator với cờ reset app test;
`--reuse-test-apk` chỉ dùng APK đã build cho chính Gateway fixture đang chạy.
Kết quả/ảnh nằm trong `/tmp/pbl6-mobile-stage05-android`. Ctrl+C dọn stack,
queue/exchange riêng; không dừng hạ tầng Docker dùng chung hoặc xóa DB dev.

```bash
cd apps/mobile
flutter analyze --no-pub
flutter test --no-pub --reporter expanded
flutter build apk --debug --no-pub
```

## Phần còn lại trước bàn giao toàn M3

Đã hoàn tất phạm vi giai đoạn 5 trên Android, đủ chuyển sang đợt UAT toàn nhóm.

Giai đoạn 5 không thay cho UAT toàn nhóm: cần chạy web Customer → SR/estimate
→ dispatch → mobile thực hiện/report → khách xác nhận/reopen trên cùng bản
nghiệm thu, cùng các nhánh bảo trì, inventory, visibility và notification.

Chưa nghiệm thu điện thoại vật lý/iOS. Channel thông tin phiên bản mới thuộc
Android; các target khác hiển thị lỗi đọc thay vì số phiên bản giả. Lỗi đồng
bộ SR/WO được ghi từ giai đoạn 0–1 vẫn là đầu việc backend riêng. Lỗi mất bộ
lọc Lịch sử khi pull-to-refresh ghi ở giai đoạn 3 đã được xử lý trong đợt này.

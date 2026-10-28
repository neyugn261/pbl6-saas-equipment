# Mobile N5 và nghiệm thu N6 phía Android

Ngày 29/10/2026, nhánh `feature/khuong-mobile-session`. Phạm vi đã thống nhất:
hoàn thành mobile; web tạo/phân công WO bàn giao Hatsady. Không thay backend,
OpenAPI, event, migration hay quyền. Không đánh dấu toàn nhóm đã chốt M2.

## 1. Chức năng N5

`lib/main.dart` dùng dữ liệu và thao tác thật qua Gateway. `main_preview.dart`
giữ nguyên bản UI mẫu, không gửi nghiệp vụ.

| Thao tác Technician | API public, sau prefix `/api/workorders` |
| --- | --- |
| Nhận / từ chối có lý do | POST `/work-orders/:id/accept`, `/reject` |
| Di chuyển / bắt đầu | POST `/work-orders/:id/start-travel`, `/start` |
| Tạm dừng có lý do / tiếp tục | POST `/work-orders/:id/hold`, `/resume` |
| Ghi chú nội bộ | POST `/work-orders/:id/logs` |
| Báo cáo và hoàn thành nguyên tử | POST `/work-orders/:id/complete` |

Nút lấy giao của `allowedActions`, trạng thái hợp lệ và current assignment
đúng tài khoản. Ghi chú kiểm tra current assignment/nonterminal riêng vì
contract không có hint add-log. Không mở assign/cancel/update cho Technician.
Backend vẫn kiểm tra quyền, trạng thái và khóa row trong transaction.

Mỗi thao tác cần xác nhận; reject/hold và note kiểm tra nội dung tối đa 2000
ký tự, không chấp nhận toàn khoảng trắng. Trong khi gửi, nút bị khóa và Back
không đóng route. Trước POST đọc lại WO, so trạng thái/assignment/updatedAt với
bản đang thao tác. Đây không phải If-Match ở backend: quyền và quyết định cuối
vẫn thuộc transaction của service, không giả frontend đã loại mọi race.

Sau thành công/đối soát, Home/My Jobs/History/Lịch và profile tự đọc lại. Reject
rời danh sách hiện tại; completed vẫn đọc được qua lịch sử ever-assigned.

## 2. Service Report

Form thật gồm ba bước rồi xem trước:

1. problemDescription bắt buộc, tối đa 5000; rootCause tùy chọn, tối đa 5000.
2. solution bắt buộc, tối đa 5000.
3. result RESOLVED/PARTIALLY_RESOLVED/UNRESOLVED; customerSummary bắt buộc,
   tối đa 2000, ghi rõ đây là nội dung gửi khách.

Không nhảy qua bước chưa validate. Preview ghi rõ Chưa gửi. Chỉ complete tạo
report; không gọi API tạo report riêng hoặc sửa report terminal. Sau server
xác nhận hiển thị mã WO, completedAt và report đọc lại từ backend. Không suy
ra equipment OPERATIONAL hoặc SR đã được khách xác nhận.

Nội dung được giữ khi quay bước hoặc lỗi API. Assignment đổi thì khóa submit
bản nháp của assignment cũ. Nếu 409 đưa WO về ON_HOLD, có thể xác nhận resume
ngay trong form rồi gửi lại sau khi kiểm tra, không mất nội dung.

Back/X với nội dung chưa gửi cần xác nhận. Có listener cập nhật dirty ngay từ
ký tự đầu; lớp Navigator session dùng `maybePop()` để tôn trọng PopScope của
form và dialog gửi lệnh. Test đơn lẻ màn hình không đủ để bắt lỗi này, nên có
regression qua toàn bộ TechnicianApp/nested Navigator và kiểm tra Android.

## 3. Lỗi, timeout và chống gửi lặp

- Một slot gửi theo WO trong repository của session, gồm cả các route khác
  cùng WO; chống double tap, không tự replay mutation sau 401/refresh.
- 400/422/403/404/409 có thông báo; đọc lại WO, cập nhật quyền/nút, giữ form.
  401 được session xử lý nhưng POST không tự gửi lần hai; người dùng xác nhận
  lại sau khi kiểm tra trạng thái.
- Mất phản hồi/5xx/timeout sau khi có thể đã gửi: đọc WO/report hoặc logs/history
  để đối soát. Complete so khớp report ID/WO/technician/nội dung với lần gửi;
  note chỉ so các log ID mới, không lấy một note giống cũ làm bằng chứng.
- Nếu tìm thấy kết quả: hiển thị đã xác nhận trên server, không POST lại. Report
  khác nội dung đang nhập được báo rõ, không giả đã nộp đúng bản nháp này.
- Nếu chưa có đủ bằng chứng: giữ khóa gửi, chỉ cho Kiểm tra kết quả. Marker giữ
  trong session qua đóng/mở route; không phải hàng đợi offline, không tự phát
  lại khi kết nối trở lại. Đây không phải cam kết exactly-once xuyên crash;
  idempotency key/draft bền vững cần contract và giai đoạn riêng.
- Session/route đã bị hủy không gửi muộn sau preflight. Logout xóa navigation
  và dữ liệu của session; không chuyển nháp sang tài khoản khác.

## 4. Kết quả kiểm tra

Các bằng chứng dưới đây là local, chưa thay review/CI/merge của nhóm.

| Kiểm tra | Kết quả |
| --- | --- |
| Flutter analyze | PASS, no issues |
| Flutter test | 102 PASS, 2 opt-in smoke skipped khi không truyền môi trường |
| SDK với backend thật | PASS: accept/start/hold/resume/log, server 409 do manager hold giữa preflight và POST, resume thủ công, complete PARTIALLY_RESOLVED, history, ID ngoài scope 404 |
| Android luồng chính | PASS: accept → travel → start → note → hold/resume → report/complete → history |
| Mất phản hồi thực sau commit | Relay trả 503 một lần cho note và complete; app đối soát; mỗi endpoint của luồng chính chỉ nhận một POST, chỉ một note/report được tạo |
| Android nhánh | PASS: reject có lý do, reassign/cancel trước confirm chặn thao tác cũ |
| Bản nháp trên Android | PASS: Back hệ thống hỏi trước khi rời; giữ nguyên nội dung qua xung đột ON_HOLD, resume có xác nhận rồi complete thành công |
| Khởi động lại Android | PASS: khôi phục session, mở lịch sử cá nhân và đọc report đã hoàn thành |
| Maintenance thật | PASS: Plan → scheduler của Maintenance → Task/event → WO → Android complete → Task COMPLETED và Asset history |
| Web thật | PASS: customer tạo SR, manager review/accept, khách đọc customerSummary không có diagnosis nội bộ, confirm SR CLOSED |
| APK chính / preview | Build debug được kiểm tra riêng; APK N6 relay dùng cổng test, bản bàn giao dùng Gateway mặc định |

Test mới gồm workflow, quyền/state hints, double submit, preflight lỗi, disposal,
đối soát timeout/log cũ/report khác, report validation, lỗi giữ form/resume,
đổi assignment, font lớn/keyboard, dirty Back và nested session Navigator.
Không chạy kịch bản ghi thử trên database dev của nhóm.

Artifact local: `/tmp/pbl6-n5-{analyze,all-tests,nested-back-tests}.log`,
`/tmp/pbl6-n6-{sdk-smoke,android-main,android-branches,android-maintenance,android-draft,android-history,web-prepare,web-verify}.log`.
Runtime N6 có screenshot và `mobile-post-counts.json`; credential chỉ nằm trong
record 0600 của thư mục riêng 0700, được xóa khi stop stack. Không commit APK,
token, password hoặc runtime record.

## 5. Ranh giới nghiệm thu N6 / 9 bước

| Bước trong kế hoạch M2 | Bằng chứng đợt mobile |
| --- | --- |
| 1. Login đúng role trên web/Android | PASS, Identity thật |
| 2. Customer tạo SR trên web | PASS, thao tác browser thật |
| 3. Review bảo hành và accept | PASS ca trong bảo hành; không chạy lại toàn bộ Estimate ngoài bảo hành |
| 4. Tạo WO qua Gateway, SR PROCESSING | PASS bằng API thật và event |
| 5. Dispatcher phân công trên web | **Chờ Hatsady/T2**; fixture hiện phân công bằng Gateway API thật, không tính là UI web PASS |
| 6–8. Android nhận, thực hiện, report/complete | PASS phía Android |
| 9. Event cập nhật SR/Asset, khách đọc và confirm | PASS bằng broker và browser thật |

N5 đủ implementation và bằng chứng local. N6 phía Android đã kiểm tra; N6
**toàn luồng web + Android chưa chốt 9/9** do bước 5, đúng lựa chọn giữ phạm vi
mobile. `apps/web/src/routes/M2Pages.tsx` hiện là WO read UI; sample Operations
chưa gửi assign thật. Không sửa web, không tự tick checkbox owner khác hoặc
release/tag M2. Sau Hatsady nối T2 cần chạy lại luồng tích hợp, owner review,
CI và merge theo [quy trình](../../CONTRIBUTING.md).

## 6. Chạy app để demo dev

Backend/seed theo [root README](../../README.md) và [K7](../demo/workorder-m2.md).
Cần Technician liên kết đúng Identity user; tạo WO và phân công qua API/Swagger
khi demo riêng mobile, trong lúc chờ web T2.

```bash
cd apps/mobile
flutter run -d emulator-5554 -t lib/main.dart
# Gateway debug mặc định http://10.0.2.2:3000; đổi port khi cần:
flutter run -d emulator-5554 --dart-define=API_BASE_URL=http://10.0.2.2:<port>
```

Đăng nhập DEMO / technician@demo.local với SEED_DEMO_PASSWORD của backend.
APK bàn giao: `apps/mobile/build/app/outputs/flutter-apk/app-technician-m2-debug.apk`.
Không cài nhầm `app-session-debug.apk` của đợt P0 hoặc APK relay test cổng 13100.

## 7. Tái chạy bộ N6 riêng (Linux, tùy chọn)

Yêu cầu dependency monorepo đã cài, Node 24, Flutter/SDK, Docker, Python 3 và
emulator API 36. Các script trong `apps/mobile/tool` tạo detached worktree,
PostgreSQL/RabbitMQ riêng và build ở worktree để không clean dist backend dev.
Dùng DB có hậu tố `_mobile_n6_test_db`; API helper từ chối URL ngoài runtime
kiểm thử. Mobile automation xác minh SHA-256 APK đang cài là bản relay N6
trước thao tác, không dùng nhầm app dev. Giữ dữ liệu ứng dụng của origin khác.

Từ root, cài Playwright vào thư mục tạm (không thêm dependency ứng dụng):

```bash
npm install --prefix /tmp/pbl6-n6-browser --no-save --ignore-scripts playwright-core@1.64.1
python3 apps/mobile/tool/n6_stack.py start
node apps/mobile/tool/n6_web.mjs prepare
python3 apps/mobile/tool/n6_prepare.py
```

Script browser dùng Chromium cache hiện có; có thể truyền `N6_CHROMIUM_PATH`
và `N6_PLAYWRIGHT_MODULE`. Nếu cần tải browser, dùng CLI Playwright của bộ test.
Từ `apps/mobile`:

```bash
PBL6_N6_RUNTIME_FILE=/tmp/pbl6-mobile-n6-$(id -u)/runtime.json \
  flutter test test/n5_backend_smoke_test.dart
flutter build apk --debug -t lib/main.dart --dart-define=API_BASE_URL=http://10.0.2.2:13100
```

Quay về root, emulator đã chạy và có ID `emulator-5554`:

```bash
python3 apps/mobile/tool/n6_install.py
python3 apps/mobile/tool/n6_android.py main
python3 apps/mobile/tool/n6_android.py branches
python3 apps/mobile/tool/n6_android.py maintenance
python3 apps/mobile/tool/n6_android.py draft
python3 apps/mobile/tool/n6_android.py history
node apps/mobile/tool/n6_web.mjs verify
python3 apps/mobile/tool/n6_stack.py stop
```

Mỗi fixture phục vụ một lượt ghi; `n6_prepare.py probe` tạo probe WO mới nếu
cần chạy lại SDK smoke. Main driver có thể tiếp tục lượt bị ngắt mà không reset
trạng thái DB hoặc gửi lại các bước đã có. Khi xong, build/cài lại APK dev mặc
định; không dùng APK relay sau khi stop stack. Upload, Notification, phụ tùng,
camera và nháp bền vững vẫn thuộc phần sau, không phải điều kiện N5 hiện tại.

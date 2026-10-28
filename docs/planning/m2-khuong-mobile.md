# Mobile Android M2 — đánh giá và kế hoạch của Khương

Ngày đối chiếu: 28/10/2026. Baseline remote: `origin/develop 3b56135`, sau
PR #37–#40. Người dùng xác nhận Khương nhận thêm phần mobile; trong kế hoạch
gốc phần này mang mã N4–N6. Việc nhận mobile không chuyển toàn bộ Identity,
Gateway, shared package hoặc CI từ Nguyên sang Khương.

Tài liệu này là kết quả đọc code, kiểm tra môi trường và đề xuất triển khai;
không xác nhận mobile đã có nghiệp vụ hoặc M2 đã nghiệm thu.

**Cập nhật sau triển khai cùng ngày:** đã chuẩn bị SDK/AVD, build/cài/chạy
Android và hoàn thành nền tảng/session P0 theo yêu cầu bổ sung. Analyze sạch,
42 tests PASS và Android → Gateway → Identity thật chứng minh login/restore/
rotation/logout, từ chối sai role. [Bằng chứng](../testing/mobile-session-m2.md).
N4 còn My Jobs/detail/equipment; N5/N6 vẫn theo kế hoạch dưới đây. Phần audit
ban đầu được giữ ở mục 1–2 để thấy đầu vào, không dùng làm trạng thái P0 mới.

## 1. Hiện trạng khi bắt đầu đánh giá

- `apps/mobile/lib/main.dart` chỉ có Flutter counter mặc định; `test/` chỉ có
  một widget test tăng counter. Chưa có login, HTTP client, token/session,
  My Jobs, WO detail, equipment, workflow hoặc report.
- `pubspec.yaml` chỉ có Flutter/Cupertino; chưa có dependency cho HTTP hoặc
  lưu token an toàn. README mobile vẫn là template.
- `API_BASE_URL` xuất hiện trong hướng dẫn root nhưng chưa được code Dart đọc.
- Đã kiểm tra lịch sử mobile trên các ref hiện có: chỉ thấy commit khởi tạo
  `45fef42`; nhánh remote `feature/nguyen-platform-m2` cũng chưa bổ sung mobile.
  Không kết luận về code chưa push trên máy thành viên khác.
- Work Order đã có API đọc/thực hiện/report và `allowedActions`; Identity,
  Asset, Gateway có API cần thiết. K7 seed/demo và Swagger đã vào develop.
  Có thể triển khai với backend thật ngay, dùng fake repository cho widget test.
- CI hiện hành có kiểm tra backend/web nhưng chưa có Flutter analyze, widget
  tests hoặc Android build. CI xanh hiện tại chưa chứng minh mobile đạt M2.

## 2. Kiểm tra trước khi cài Android SDK

| Kiểm tra | Kết quả | Ý nghĩa |
| --- | --- | --- |
| `flutter --version` | Flutter 3.47.4, Dart 3.13.3 | Phù hợp SDK constraint hiện hành |
| `flutter analyze` | PASS, no issues | Chỉ kiểm tra code template hiện có |
| `flutter test` | PASS, 1 counter test | Chưa có test nghiệp vụ mobile |
| `flutter doctor -v` | Không tìm thấy Android SDK | Chặn build/chạy Android |
| `flutter devices` / `flutter emulators` | Chỉ Linux; chưa có Android device/AVD | Chưa có thiết bị nghiệm thu |
| `flutter build apk --debug` | FAIL: No Android SDK found | Chưa có APK để cài/nghiệm thu |

Log local: `/tmp/pbl6-mobile-audit-analyze.log`,
`/tmp/pbl6-mobile-audit-test.log`, `/tmp/pbl6-mobile-audit-apk.log`.
Không cài SDK, reset DB hoặc thay đổi code ứng dụng trong lần đánh giá này.

## 3. Phạm vi phải hoàn thành để đạt N4–N6

| Ưu tiên | Phần việc | Tiêu chí đạt |
| --- | --- | --- |
| P0 | Môi trường Android | Android SDK/toolchain và license sẵn sàng; build được APK debug; có emulator hoặc điện thoại để cài |
| P0 — N4 | Nền tảng và session | Đọc Gateway URL theo môi trường; login DEMO/email/password thật; kiểm tra profile Technician; lưu token an toàn, khôi phục session, refresh có điều phối và logout |
| P1 — N4 | My Jobs và đọc WO | List/pagination/filter/refresh; detail; `/technicians/me`; thông tin thiết bị; loading/empty/error/retry; 401/403/404 có hành vi rõ |
| P1 — N5 | Thực hiện công việc | Accept/reject/travel/start/hold/resume, ghi chú, đọc logs/history; nút theo allowedActions; chống submit lặp và xử lý reassign/state conflict |
| P1 — N5 | Service Report | Form đúng DTO, result/customerSummary, submit complete thật; đọc lại report và WO COMPLETED sau thành công; lỗi không giả thành công |
| P1 — N6 | Nghiệm thu Android | Analyze/widget tests/APK đạt; cài và thực hiện WO thật qua Gateway; negative scope tests; bằng chứng Web + Android + broker cho luồng 9/9 |

Các màn hình tối thiểu: đăng nhập, My Jobs, chi tiết WO kèm thiết bị và hoạt
động, form report, đọc report đã nộp, tài khoản/đăng xuất. Equipment/activity
có thể là section/tab thay vì bắt buộc tạo nhiều route riêng.

Kiến trúc vừa đủ: cấu hình + API/session client chung; repository theo auth/
work order/equipment; model Dart; controller/state và widget theo feature.
Repository có interface để widget tests dùng fake. Không cần xây framework
hoặc hệ thống phân quyền mới trước khi có luồng chạy thật.

## 4. API đã sẵn sàng và các điểm dễ làm sai

Tất cả đường dưới đây là đường public qua Gateway, dùng bearer của người dùng.

| Chức năng | API |
| --- | --- |
| Session | `POST /api/identity/auth/login`, `/refresh`, `/logout`; `GET /api/identity/auth/me` |
| Profile | `GET /api/workorders/technicians/me` |
| Việc đang được giao | `GET /api/workorders/work-orders?mine=true` |
| WO/detail/history | `GET /api/workorders/work-orders/{id}` và `/{id}/history` |
| Assignment và hoạt động | `GET /api/workorders/work-orders/{id}/assignments`, `/{id}/logs`; `POST /{id}/logs` |
| Thực hiện | `POST /api/workorders/work-orders/{id}/{accept,reject,start-travel,start,hold,resume,complete}` |
| Đọc report | `GET /api/workorders/work-orders/{id}/service-report` |
| Thiết bị | `GET /api/assets/equipment/{equipmentId}`; model/warranty theo nhu cầu màn hình và contract Asset |

**Token:** Identity xoay refresh token mỗi lần refresh; dùng lại token đã
revoke có thể revoke toàn bộ session của account. Chỉ cho một refresh chạy tại
một thời điểm, các request khác chờ cùng kết quả; lưu cặp token mới trước khi
tiếp tục. Refresh thất bại do lỗi xác thực thì kết thúc session, không lặp vô
hạn. Lỗi mạng/5xx cần thông báo để thử lại, không tự kết luận sai mật khẩu.
Không log password/token hoặc đưa secret vào dart-define/source.

**Profile/quyền:** login trả user với roles, không trả một permission array.
Kiểm tra TENANT_STAFF/TECHNICIAN cho flow này, không giả định JWT có permissions.
Backend quyết định scope cuối cùng. Thiếu profile technician → 404 cần thông
báo profile chưa được thiết lập, không tự tạo bằng tài khoản Technician.

**My Jobs:** `mine=true` chỉ lấy assignment hiện hành ASSIGNED/ACCEPTED.
Sau complete/reject/reassign, việc có thể biến mất khỏi tab đang làm. Lịch sử
dùng list không có mine, filter terminal theo nhu cầu; với account chỉ có role
TECHNICIAN, backend vẫn giới hạn các WO từng được giao. Giữ màn hình kết quả/
report sau complete, không hiểu list rỗng là mất dữ liệu. Không lấy việc của
technician khác để bù list rỗng.

**Workflow:** đọc `allowedActions` từ detail và nạp lại sau mỗi mutation.
Không chỉ kiểm tra một chuỗi status ở frontend. Backend vẫn có thể trả 403
hoặc 409 khi người khác reassign/cancel; cần refresh và giải thích thay đổi.
Không tự retry POST mutation khi timeout hoặc replay complete sau 401 một cách
mù quáng. Với kết quả không rõ, đọc lại detail/report trước khi cho gửi tiếp;
giữ nội dung form khi lỗi. Đây là xử lý lỗi giao tiếp M2, không phải offline sync.

**Payload:** reject/hold cần `{reason}`; log là `{note}`. Accept/travel/start/
resume không có field nghiệp vụ bắt buộc. Form complete gồm
`problemDescription` (1–5000), `rootCause` tùy chọn (tối đa 5000), `solution`
(1–5000), `result` (RESOLVED/PARTIALLY_RESOLVED/UNRESOLVED), `customerSummary`
(1–2000). Trim và validate nội dung; summary dành cho khách tách chẩn đoán nội
bộ. Gửi trực tiếp DTO cho `/complete`, không bọc thêm `{report: ...}`.
Report hiện chưa có API sửa hoặc endpoint lưu draft server.

**Dữ liệu phụ:** WO detail trả reference IDs, không phải toàn bộ tên model,
khách hàng/địa điểm. Lấy equipment bằng public Asset API; nếu cần tên/địa chỉ
thì dùng public API tương ứng với quyền của token. Không gọi `/internal/*`
từ điện thoại. Section phụ lỗi phải có trạng thái riêng, không làm giả thông
tin hoặc xóa toàn bộ detail đã đọc được.

**Android network:** cấu hình API_BASE_URL thật sự trong Dart; emulator dùng
`http://10.0.2.2:3000`, điện thoại thật dùng địa chỉ LAN backend có thể truy cập.
Kiểm tra quyền INTERNET và cấu hình HTTP local trong debug variant; không mặc
định hướng dẫn README đã làm app gọi được mạng. App hiện chỉ khai INTERNET
trong debug/profile manifests và chưa có cấu hình cleartext riêng.

## 5. Thứ tự PR đề xuất

1. **Mobile foundation/auth:** cấu hình URL, API/error/session client, token
   storage, login/me/refresh/logout, điều hướng theo session; test refresh
   concurrency và logout. Chuẩn bị toolchain Android song song, thử APK sớm.
2. **My Jobs/detail/equipment:** profile, pagination/filter, detail và activity,
   loading/empty/error, 401/403/404; widget/model tests theo response thật.
3. **Workflow/logs:** accept/reject/travel/start/hold/resume/note, nút theo
   allowedActions, disable pending, cập nhật state từ server; test conflict,
   reassign và request thất bại.
4. **Service Report:** form validation, result/summary, complete và đọc report,
   refresh My Jobs/history; test submit lặp, response không rõ và mất quyền.
5. **N6 integration/handoff:** APK debug, thao tác Android trên API thật, test
   scope, tài liệu cài/chạy và bảng kết quả với commit/device/IDs. CI Flutter
   nếu bổ sung là PR dùng chung riêng, Nguyên review.

Mỗi PR feature kèm test liên quan; không đợi đến PR cuối mới kiểm tra.

## 6. Bằng chứng bắt buộc để chốt mobile

- Login thật; session refresh/khôi phục/logout đúng; không gửi song song cùng
  refresh token. Sai role, sai mật khẩu, token hết hạn, mạng lỗi có UI rõ.
- My Jobs chỉ có đúng assignment theo token; không tìm thấy record hiển thị
  empty/404 đúng nghĩa. Có refresh và pagination không nhân đôi record.
- Technician accept → travel/start → note → hold/resume → complete/report trên
  Android thật hoặc emulator. Reject cần ca riêng vì đưa WO về CREATED.
- Service Report chỉ một bản; submit thất bại/timeout không hiển thị thành công
  giả. Hoàn thành xong vẫn xem được kết quả dù mine=true không còn việc đó.
- Dùng WO chưa từng giao cho user, tenant khác, và đổi assignment giữa khi mở
  màn hình với lúc bấm action: không đọc/sửa ngoài scope. WO từng được giao
  có thể vẫn được đọc theo contract, nhưng không còn quyền thực hiện nếu đã
  reassign; không viết test đòi 404 cho mọi WO không còn current assignment.
- Web tạo SR/WO và assign, Android nhận/thực hiện/report, broker cập nhật SR/
  Asset và customer xem/confirm/reopen. Ghi nhận riêng Maintenance và nhánh
  cancel/replacement. Kết quả backend script không thay cho bằng chứng Android.
- `flutter analyze`, `flutter test`, `flutter build apk --debug` PASS và APK
  đã cài/chạy. Ghi commit/backend env/device/build/case/result, che token và
  mật khẩu trong bằng chứng; không commit APK build vào source.

## 7. Phụ thuộc và giới hạn M2

- **Khương:** code mobile nhận thêm, tích hợp với WO do mình sở hữu; dùng K7
  đã merge để chuẩn bị dữ liệu. `demo:prepare` tạo WO CREATED, còn assignment
  cần Dispatcher; `test:demo` có thể hoàn thành job nên không chạy ngay trước
  buổi nghiệm thu nếu muốn diễn lại bằng Android. Không reset SQL để diễn lại.
- **Nguyên:** phối hợp môi trường/Gateway/Identity, review auth và file chung;
  không cần chuyển N1–N3 thành phần Khương phải viết lại để nhận mobile.
- **Hatsady:** web tạo/assign, bảng test và bằng chứng 9/9.
- **Huy:** SR lifecycle/event ordering và dữ liệu cũ F09/F10/F11 cần giải quyết
  theo ownership. Chưa thể coi mobile hoặc script happy path PASS là đã chốt
  các vấn đề ordering của SR.
- **Minh:** Maintenance/Asset history/replacement integration.

Không đưa upload/chụp ảnh/MinIO, offline sync, push notification, phụ tùng,
GPS/maps, iOS hoặc ký phát hành production vào điều kiện chốt mobile M2.
K8 upload chỉ là contract chuẩn bị M3; chưa dùng làm endpoint thực thi.

Nguồn: [phân công N4–N6 và nghiệm thu 9/9](../plans/m2-task-assignment.md),
[WO API](../api/workorder.yaml), [Identity](../../apps/identity-service/README.md),
[seed/demo K7](../demo/workorder-m2.md),
[source mobile](../../apps/mobile/lib/main.dart).

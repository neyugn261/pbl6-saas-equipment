# Mobile M2 — môi trường Android và nền tảng/session P0

Ngày: 28/10/2026. Owner triển khai: Khương theo phân công bổ sung của người dùng.
Baseline: `origin/develop 3b56135`; triển khai trên nhánh
`feature/khuong-mobile-session`. Kết quả bên dưới là kiểm tra local; PR/CI
remote được theo dõi riêng. Chưa nghiệm thu toàn bộ N4–N6 hoặc M2.

## 1. Môi trường đã chuẩn bị

| Thành phần | Kết quả thực tế |
| --- | --- |
| Flutter/Dart | 3.47.4 / 3.13.3 |
| JDK | OpenJDK 21.0.12.1; giữ bytecode Java/Kotlin 17 trong app |
| SDK | `$HOME/Android/Sdk`, Platform 36, Build Tools 36.0.0, Platform Tools |
| Công cụ native | NDK 28.2.13676358, CMake 3.22.1; Platform 35 được plugin tự cài khi build |
| Command-line tools | 22.0, archive 15859902, kiểm SHA-256 theo trang Android chính thức |
| Emulator | 37.2.12.0, AVD PBL6_API_36 / Pixel 6 / Google APIs x86_64 / Android 16 |
| Tăng tốc | `emulator -accel-check`: KVM installed and usable; guest boot_completed=1 |
| SDK license | Đã chấp nhận; doctor xác nhận All Android licenses accepted |
| Flutter doctor | Android toolchain PASS; Chrome/Linux desktop còn thiếu công cụ riêng |

ANDROID_HOME/JAVA_HOME/PATH nằm trong `$HOME/.config/android/env.sh`, được
nạp từ `.zshrc`, `.bashrc`, `.profile`; có backup shell config tại cùng thư mục
android trước khi sửa. SDK, AVD, cache, local.properties và APK không đưa vào Git.
VS Code đã có extension Dart/Flutter. Chưa cài Android Studio vì SDK CLI và
emulator đã đủ cho luồng Flutter Android được kiểm tra.

## 2. Phạm vi code P0

- AppConfig đọc API_BASE_URL, giới hạn Gateway origin; debug mặc định emulator
  host `http://10.0.2.2:3000`; profile/release đòi HTTPS tường minh.
- Gateway client dùng HTTP JSON có timeout, correlation id, bearer; không tự
  follow redirect, không tự retry request và không đưa raw response vào lỗi UI.
- Form login tenant/email/password; trạng thái pending, validation, ẩn mật khẩu,
  chặn submit lặp. Chỉ nhận profile ACTIVE TENANT_STAFF có role TECHNICIAN.
- Session encrypted storage theo Gateway origin; một record chứa token pair,
  expiry, user/tenant binding và refreshPending. Không tự login bằng password
  lưu sẵn; không thêm permission array hoặc hệ thống role mới.
- Mở lại app/foreground xác minh `/auth/me`; lỗi mạng/profile tạm thời có Retry
  và giữ cặp token đã biết. Refresh invalid/expired/reused kết thúc phiên.
- Refresh single flight; marker pending được ghi trước POST; cặp token mới ghi
  trước khi các request chờ được tiếp tục. Kết quả refresh không rõ/pending
  khi restart → login lại, tránh dùng lại refresh token cũ.
- Secure storage plugin 11.2.0 dùng SharedPreferences.apply; adapter Android
  nhỏ chờ commit cùng namespace trên background task queue. Thất bại flush
  thành lỗi storage, không đánh dấu đã persist hoặc tiếp tục refresh POST.
  Không thay thư viện mã hóa, không truyền credential qua channel flush.
- GET/HEAD chỉ retry tối đa một lần sau 401; mutation không replay. Logout và
  login/refresh đang chờ có epoch guard; response cũ không phục hồi phiên đã xóa.
- Logout xóa local và yêu cầu revoke server; server chưa xác nhận thì UI nói rõ.
  Tắt backup và loại SharedPreferences khỏi transfer; HTTP chỉ bật trong debug.

Nguồn SDK/storage:
[Flutter Android setup](https://docs.flutter.dev/platform-integration/android/setup),
[flutter_secure_storage](https://pub.dev/packages/flutter_secure_storage/versions/11.2.0),
[Android apply/commit](https://developer.android.com/reference/android/content/SharedPreferences.Editor#apply()).
Khi nâng plugin phải kiểm lại namespace/flush adapter và chạy lại Android smoke.

## 3. Kiểm tra đã chạy

| Kiểm tra | Kết quả |
| --- | --- |
| `flutter analyze` | PASS, no issues |
| `flutter test` | PASS 42 tests: config/transport, session concurrency/error/security, secure-store persistence protocol và UI |
| `flutter build apk --debug` trước code P0 | PASS; counter cài/chạy trên emulator |
| Build APK P0 cho Gateway kiểm thử | PASS; API_BASE_URL=http://10.0.2.2:13000 |
| Build/cài APK bàn giao | PASS; debug default Gateway 10.0.2.2:3000, màn hình login chạy trên emulator |
| Android real-session smoke | PASS toàn bộ các bước bên dưới |
| Debug merged manifest | INTERNET, allowBackup=false, fullBackupContent=false, dataExtractionRules và usesCleartextTraffic=true đúng variant |

Unit/widget tests dùng MockClient/MemoryStore/platform storage doubles để điều
khiển race và lỗi, không thay bằng chứng Android thật. Bao gồm:

- Nhiều request hết token chỉ refresh một lần; 401 đến muộn không xoay thêm.
- 401 retry bị giới hạn, 403 nghiệp vụ không tự logout, POST không tự gửi lại.
- Marker pending sau restart, refresh lỗi mạng/timeout/reuse, persistence/flush
  thất bại, refresh hết hạn và mất mạng khi đọc profile.
- Logout khi refresh/login đang chạy, logout lặp, clear thất bại, server revoke
  chưa xác nhận; binding user/tenant và role bị đổi.
- Secure record tách Gateway, dữ liệu hỏng được xóa đúng key, write/delete theo
  thứ tự và chờ native flush acknowledgement.
- Login validation/pending/error/profile/logout/recovery và layout màn hình nhỏ.

## 4. Android + backend thật

Chạy riêng PostgreSQL 17 `identity_mobile_test_db`, migration/seed Identity
thật, Identity `13001`, Gateway `13000`, không mock endpoint auth. Access TTL
60 giây để quan sát rotation. Credential ngẫu nhiên chỉ ở env/file runtime
local mode 0600 và được nhập qua stdin; không chứa trong APK, source hoặc log.
Các DB/service dev hiện có không bị reset/seed/migrate trong đợt kiểm thử này.
Sau kiểm tra đã dừng/xóa các service và PostgreSQL tạm, xóa credential runtime;
giữ emulator và bản APK dùng Gateway mặc định để tiếp tục phát triển.

| Bước | Bằng chứng |
| --- | --- |
| Login Technician trên emulator | Tài khoản hiển thị; Identity có đúng một session active mới |
| Force-stop/start app | Khôi phục bằng secure storage + me; không thêm login/session |
| Kiểm tra phiên khi access gần hết hạn | Refresh đúng một lần: thêm successor, revoke predecessor, còn một active |
| Force-stop/start sau rotation | Dùng cặp token mới, không login hoặc rotate thêm |
| Logout rồi restart | UI login; server không còn session active của lần chạy; không tự phục hồi |
| Login Service Manager | UI từ chối sai vai trò; session mới được revoke |

Smoke tự động thao tác Android qua adb/uiautomator và đối chiếu read-only
auth_sessions trong DB Identity kiểm thử; không đọc DB service khác hoặc dùng
token test giả thay cho Identity. Hai lượt harness đầu đã sửa lỗi nhập thiếu
ký tự email và mốc chờ TTL tính nhầm session cũ; lượt cuối chạy lại đầy đủ PASS.
Không dùng các lượt chưa hoàn tất để ghi Pass toàn bộ.

Log local: `/tmp/pbl6-mobile-session-{analyze,tests,build}.log`,
`/tmp/pbl6-mobile-android-smoke-final.log`, `/tmp/pbl6-android-doctor.log`,
`/tmp/pbl6-android-baseline-build.log`. Log chỉ là artifact của máy hiện tại.

## 5. Cách kiểm tra lại

Xem [README mobile](../../apps/mobile/README.md) để khởi động emulator, build,
cài APK và cấu hình URL. Start/seed Identity và Gateway theo root README;
đăng nhập Technician, đóng/mở app, kiểm tra phiên và logout. Với access TTL
ngắn trên môi trường kiểm thử riêng, đợi gần hết TTL rồi dùng Kiểm tra phiên;
đối chiếu session chỉ tại DB Identity do service này sở hữu.

Không commit token/password/APK. Chỉ dùng adb run-as, dữ liệu test riêng và
log đã che secret khi xác minh storage. Chưa kiểm thử physical phone,
iOS/desktop/web hoặc mất nguồn vật lý của thiết bị.

## 6. Phần tiếp theo

My Jobs, `/technicians/me`, WO detail/equipment, workflow, Service Report và
nghiệm thu 9/9 vẫn là phần tiếp theo. Backend scope tests hiện có không thay
cho negative tests các màn hình đó sau khi triển khai. CI Flutter chưa được
thêm; PR file dùng chung cần Nguyên review theo CONTRIBUTING.

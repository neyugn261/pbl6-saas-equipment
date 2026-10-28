# PBL6 Technician — Flutter Android

Mobile dành cho Technician. Đã có nền tảng/session P0: đăng nhập Identity thật,
lưu token mã hóa, khôi phục phiên, refresh tuần tự, kiểm tra profile và đăng
xuất. Giao diện 5 tab và các màn hình nghiệp vụ theo
[thiết kế mobile](../../docs/planning/mobile-technician-design.md).
App đăng nhập đã nối các API đọc thật qua Gateway: công việc cá nhân/lịch sử,
WO/report/logs, lịch, thiết bị/dossier/bảo hành/timeline, liên hệ và hồ sơ
Technician. Các command nghiệp vụ và M3 còn TODO; chưa nghiệm thu toàn bộ
workflow N4–N6/M2. Xem [đọc backend và cách demo](../../docs/testing/mobile-backend-reads.md).

## Xem giao diện không cần backend

Từ `apps/mobile`, khi emulator đã chạy:

```bash
flutter pub get
flutter run -d emulator-5554 -t lib/main_preview.dart
# Hoặc build để cài:
flutter build apk --debug -t lib/main_preview.dart
```

Entry point preview không tạo SessionController, HTTP client hoặc đọc secure
storage. Dữ liệu và trạng thái WO là fixtures bất biến. Tìm kiếm/lọc, đổi tab,
ngày lịch, stepper và xem trước form chỉ hoạt động trong giao diện; các nút
nghiệp vụ thông báo rõ chưa gửi/thay đổi dữ liệu. Camera, file upload, thông
báo và phụ tùng M3 có giao diện minh họa, chưa nối plugin/API.

`lib/main.dart` dùng session P0 và workspace đọc backend thật, không dùng
fixtures của preview. Có loading/empty/error/retry, phân trang, kéo tải lại
và đọc lại khi trở về foreground. Thiếu profile/quyền, lỗi API hoặc dịch vụ
chưa cấu hình được thể hiện rõ. Khi phiên đổi, navigation stack riêng được
hủy để không giữ màn hình chi tiết và dữ liệu của phiên cũ.

Theme, danh mục màn hình và TODO bàn giao:
[mobile UI preview](../../docs/demo/mobile-ui-preview.md).

## Toolchain của dự án

- Flutter với Dart phù hợp `pubspec.yaml` (hiện `^3.13.3`).
- Java 21 cho Gradle hiện tại; Java/Kotlin bytecode của app vẫn target 17.
- Android SDK Platform 36, Build Tools 36.0.0 và Platform Tools.
- NDK 28.2.13676358 theo Flutter SDK hiện tại; CMake 3.22.1.
- Android Emulator và system image API 36 Google APIs x86_64 cho máy Linux x64.

Phiên bản compile/target SDK và NDK lấy từ Flutter, xem
`android/app/build.gradle.kts`; không hardcode đường dẫn máy cá nhân vào Git.
SDK/AVD, `android/local.properties`, Gradle cache và `build/` là dữ liệu local.

Hướng dẫn chính thức: [Flutter Android setup](https://docs.flutter.dev/platform-integration/android/setup),
[Android SDK tools](https://developer.android.com/tools/sdkmanager),
[emulator acceleration/KVM](https://developer.android.com/studio/run/emulator-acceleration).

## Môi trường local của Khương

SDK nằm tại `$HOME/Android/Sdk`. Flutter được cấu hình trỏ vào SDK này.
`$HOME/.config/android/env.sh` thiết lập ANDROID_HOME, JAVA_HOME và PATH cho
adb/emulator/command-line tools; được nạp từ shell startup của máy.

Mở terminal mới hoặc nạp vào terminal đang mở:

```bash
source "$HOME/.config/android/env.sh"
flutter doctor -v
emulator -accel-check
flutter emulators
```

AVD cho dự án: `PBL6_API_36`, Pixel 6, API 36, x86_64, dùng KVM. Chỉ chạy một
instance của cùng AVD. Để mở cửa sổ emulator:

```bash
flutter emulators --launch PBL6_API_36
flutter devices
```

Nếu đã có emulator đang chạy, dùng device ID từ `flutter devices` thay vì mở
thêm instance. Có thể tắt emulator bằng nút đóng cửa sổ hoặc
`adb -s <device-id> emu kill`.

## Chạy, kiểm tra và build

Từ thư mục `apps/mobile`:

```bash
flutter pub get
flutter analyze
flutter test
flutter run -d <device-id>
flutter build apk --debug
```

APK: `build/app/outputs/flutter-apk/app-debug.apk`.
Để cài bản đã build lên thiết bị cụ thể:

```bash
adb -s <device-id> install -r build/app/outputs/flutter-apk/app-debug.apk
adb -s <device-id> shell am start -n com.pbl6.pbl6_technician/.MainActivity
```

Emulator dùng mặc định `http://10.0.2.2:3000` trong debug. Điện thoại thật dùng
địa chỉ LAN backend có thể truy cập; cấu hình bằng:

```bash
flutter run -d <device-id> --dart-define=API_BASE_URL=http://<backend-lan-ip>:3000
```

API_BASE_URL phải là origin Gateway (scheme/host/port, không có user/password,
path/query/fragment). Profile/release yêu cầu cấu hình HTTPS tường minh.
INTERNET được khai trong main manifest; HTTP local chỉ bật cho debug, không
tắt kiểm tra chứng chỉ TLS. Không lưu password/token trong source/dart-define.

## Đăng nhập và vòng đời session

Start backend theo root README. Seed Identity dev tạo tài khoản
`technician@demo.local`, tenant `DEMO`, mật khẩu từ SEED_DEMO_PASSWORD của môi
trường backend. Nhập trên form; app không chứa sẵn mật khẩu. Dùng tài khoản
TENANT_STAFF ACTIVE có role TECHNICIAN. Tài khoản khác bị từ chối trên app và
session vừa cấp được yêu cầu revoke; backend vẫn thực thi RBAC/tenant scope.

App có màn hình đăng nhập, workspace/tài khoản và khôi phục khi lỗi. Các route auth
qua `/api/identity/auth/*`. Khi mở lại/đưa app về foreground, kiểm tra profile
qua `/auth/me`; mất mạng khi đọc profile giữ phiên đã biết và hiển thị Thử lại.
Refresh xoay token nên các request đồng thời dùng chung một lần refresh; chỉ
GET/HEAD được retry một lần sau 401, mutation không tự gửi lại. Logout xóa phiên
local và gọi endpoint 204; nếu server chưa xác nhận thì app nói rõ điều đó.

Token pair lưu thành một record trong flutter_secure_storage, tách key theo
Gateway origin; không gửi credential của môi trường cũ sang Gateway khác.
Trước refresh, ghi marker pending; thành công mới lưu cặp token kế tiếp.
Nếu kết quả refresh không rõ hoặc app khởi động với marker pending, yêu cầu
đăng nhập lại thay vì thử token cũ và kích hoạt reuse detection của Identity.
Không dùng password để tự login lại.

Android adapter `pbl6/session_storage` chờ SharedPreferences.commit trên worker
queue sau các write/delete của secure storage. Plugin 11.2.0 dùng apply bất
đồng bộ; adapter bảo đảm marker/cặp token mới đã ghi disk trước bước tiếp theo.
Namespace `pbl6_session_v1` phải đồng bộ giữa Dart và MainActivity; dependency
được pin, cần kiểm tra lại adapter khi nâng plugin. Adapter không nhận token
hoặc tự triển khai mã hóa. Backup/transfer SharedPreferences bị loại trừ.

Bằng chứng và cách nghiệm thu: [kiểm thử session M2](../../docs/testing/mobile-session-m2.md).

Android toolchain có thể sẵn sàng dù `flutter doctor` còn báo thiếu công cụ
Chrome/Linux desktop; các target đó không nằm trong phạm vi Android M2.

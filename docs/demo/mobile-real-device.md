# Chạy Mobile trên máy ảo và điện thoại Android thật

Dự án dùng Flutter entry point `apps/mobile/lib/main.dart`. Đây là ứng dụng
Technician gọi API thật. `main_preview.dart` dùng dữ liệu preview và không dùng
để nghiệm thu nghiệp vụ. Hướng dẫn cho máy Ubuntu hiện tại của Khương.

Kiểm tra ngày 03/11/2026: Flutter 3.47.4/Dart 3.13.3 đã có; chưa có thiết bị
Android kết nối. IP Wi-Fi hiện tại là `10.101.172.209`; Gateway và MinIO health
qua địa chỉ LAN trả 200 từ host. Chưa kiểm tra được kết nối từ điện thoại thật.
IP có thể thay đổi khi đổi Wi-Fi; lấy lại bằng `ip -brief -4 address`, dùng địa
chỉ của card Wi-Fi/Ethernet, không dùng địa chỉ `docker0` hoặc Docker bridge.

## 1. Backend phải đang chạy

Dùng [runbook M3](m3-complete-runbook.md) để chuẩn bị DB, seed, storage và backend.
Nếu đang chạy ổn thì không chạy thêm instance. Khi backend watch đang chạy,
không chạy các wrapper seed có build lại hoặc `attachments:prepare`.

Mobile truy cập Gateway trực tiếp tại cổng 3000, không đi qua Vite cổng 5173.
API_BASE_URL chỉ là origin, không thêm `/api`, `/gateway` hoặc tên service.
Các URL giữa backend với nhau vẫn giữ cấu hình đang dùng; không cần đổi toàn bộ
IDENTITY_SERVICE_URL/WORKORDER_SERVICE_URL thành IP điện thoại.

## 2. Điện thoại thật cùng Wi-Fi — cách chính

### Chuẩn bị mạng và file storage

1. Kết nối máy tính và điện thoại vào cùng mạng LAN/Wi-Fi có thể liên lạc với nhau.
   Nếu dùng mạng trường/công ty và hai thiết bị bị cô lập, xem cách USB ở mục 5.
2. Trên trình duyệt điện thoại, mở:

   ```text
   http://10.101.172.209:3000/health
   http://10.101.172.209:9000/minio/health/live
   ```

   Cả hai phải HTTP 200. MinIO health có thể trả nội dung trống; HTTP 200 là đủ.
   Nếu không mở được, chưa nên build lại app để thử đăng nhập: cần xử lý kết nối trước.
3. Để upload/download file trên cả điện thoại và browser host, sửa riêng biến
   sau trong `.env` root:

   ```dotenv
   MINIO_PUBLIC_ENDPOINT=http://10.101.172.209:9000
   ```

   `MINIO_ENDPOINT=localhost` và `MINIO_PORT=9000` vẫn đúng với backend chạy ở
   host; public endpoint là địa chỉ mà client nhận trong URL ký. Nếu attachments
   chưa bật, cấu hình/provision theo runbook M3 trước khi bật watch.
4. Sau khi đổi public endpoint, Ctrl+C terminal `pnpm dev:backend`, rồi chạy lại:

   ```bash
   pnpm dev:backend
   ```

   Xin upload/download ticket mới từ app. Không thay host của URL đã ký và không
   tái dùng một ticket localhost cũ. Với Compose demo dùng biến
   `DEMO_STORAGE_PUBLIC_URL` trong `.env.demo` và recreate Work Order, thay vì
   biến môi trường local ở trên.

### Kết nối điện thoại để cài/chạy

Trên Android, mở phần thông tin phần mềm, chạm **Số bản dựng / Build number**
7 lần để bật Developer options, rồi bật **USB debugging / Gỡ lỗi USB**.
Tên menu có thể khác tùy hãng. Cắm cáp có truyền dữ liệu, mở khóa điện thoại và
chấp thuận hộp thoại RSA cho máy tính.

Terminal mới:

```bash
source "$HOME/.config/android/env.sh"
cd /home/khuong/projects/PBL6/pbl6-saas-equipment/apps/mobile
adb devices -l
flutter devices
```

Thiết bị phải xuất hiện với trạng thái `device`. Nếu `unauthorized`, mở khóa và
chấp thuận trên điện thoại. Nếu không thấy thiết bị, kiểm tra cáp, USB debugging
và chế độ kết nối; nếu báo `no permissions`, kiểm tra cấu hình quyền USB/udev trên
Ubuntu theo hướng dẫn Android. Không chạy Flutter bằng sudo để né lỗi quyền.

Thay `DEVICE_ID` bên dưới bằng ID từ danh sách (không phải tên model):

```bash
flutter pub get
flutter run --debug -d DEVICE_ID -t lib/main.dart \
  --dart-define=API_BASE_URL=http://10.101.172.209:3000
```

API_BASE_URL được đóng vào bản build. Khi đổi IP/Gateway, chạy lại lệnh với
`--dart-define` mới; hot reload đơn thuần không đổi cấu hình này.
Trong phiên `flutter run`, `r` hot reload, `R` hot restart, `d` detach và để app
chạy trên thiết bị, `q` dừng phiên chạy. Khi dùng LAN, app đã cài vẫn có thể gọi
backend sau khi detach/rút USB, miễn điện thoại còn liên lạc được với máy tính.

## 3. Đăng nhập và thao tác demo

- Tenant code: `DEMO`.
- Email: `technician@demo.local`.
- Password: `SEED_DEMO_PASSWORD` của backend; nhập trong form, không đưa vào dart-define.
- App yêu cầu user ACTIVE có role TECHNICIAN. Tài khoản manager/customer không
  thay cho Technician để chạy workflow này.

Trên web, Service Manager/Dispatcher tạo và phân công WO còn mở cho đúng
`DEMO-TECH-01` đã seed. Trên mobile kéo tải lại, tìm WO đó, nhận lệnh → di chuyển
→ bắt đầu → nhập report/customer summary → hoàn tất theo allowedActions.
Dùng hai file nhỏ JPEG/PNG/PDF để thử upload: evidence WO khi còn mở, file report
sau khi report hoàn tất. Service Manager công bố CUSTOMER ở web; Customer đọc
qua SR portal. Không dùng WO đã COMPLETED từ rehearsal trước để thử lại các
transition tạo mới.

Nhận file từ camera/gallery/Files và upload attachment đã có code trong app
hiện tại; các ghi chú M2/preview cũ trong README không đại diện cho toàn bộ M3.
Notification recipient bootstrap trên baseline 3bcf42f còn blocker đã ghi trong
[báo cáo M3](../reports/2026-11-03-m3-final-readiness.md); không dùng việc chạy
mobile/đăng nhập thành công để kết luận Notification đã nghiệm thu.

## 4. Build APK để cài và dùng độc lập

Tại `apps/mobile`, dùng đúng IP Gateway của máy chủ:

```bash
flutter build apk --debug -t lib/main.dart \
  --dart-define=API_BASE_URL=http://10.101.172.209:3000
```

APK mới nằm tại `build/app/outputs/flutter-apk/app-debug.apk`.
Cài qua USB:

```bash
adb -s DEVICE_ID install -r build/app/outputs/flutter-apk/app-debug.apk
```

Hoặc chuyển APK sang điện thoại, cho phép cài từ ứng dụng chứa file đó rồi mở
**PBL6 Technician**. Bản này không cần laptop chạy `flutter run`, nhưng backend
và MinIO vẫn phải bật và truy cập được. APK cũ trong workspace có thể chứa IP
hoặc entry point preview từ lần build trước; luôn build lại với lệnh rõ ràng.

Debug dùng HTTP local được. Profile/release của dự án yêu cầu Gateway HTTPS;
không đổi sang `--release` mà vẫn dùng IP HTTP. Khi triển khai ngoài LAN, cung
cấp URL HTTPS cho cả Gateway và storage trước khi build bản dùng môi trường đó.

## 5. Điện thoại qua USB khi Wi-Fi không cho truy cập LAN

Giữ điện thoại cắm USB và được adb nhận. Cách này không cần IP Wi-Fi:

```bash
adb -s DEVICE_ID reverse tcp:3000 tcp:3000
adb -s DEVICE_ID reverse tcp:9000 tcp:9000

flutter run --debug -d DEVICE_ID -t lib/main.dart \
  --dart-define=API_BASE_URL=http://localhost:3000
```

Với phương án này, public storage endpoint phải là `http://localhost:9000`
trong `.env` backend. Restart backend nếu vừa đổi lại từ LAN IP, xin ticket mới.
Hai reverse cần thiết vì API đi cổng 3000 còn file PUT/GET đi trực tiếp cổng 9000.
Mapping chỉ phục vụ thiết bị đã nối USB; cần thiết lập lại sau khi kết nối lại.
Không dùng cấu hình localhost/USB này để phát APK cho điện thoại khác qua Wi-Fi.

Xem/gỡ mapping:

```bash
adb -s DEVICE_ID reverse --list
adb -s DEVICE_ID reverse --remove tcp:3000
adb -s DEVICE_ID reverse --remove tcp:9000
```

## 6. Máy ảo Android trên máy tính

```bash
source "$HOME/.config/android/env.sh"
flutter emulators
flutter emulators --launch PBL6_API_36
flutter devices
cd /home/khuong/projects/PBL6/pbl6-saas-equipment/apps/mobile
flutter pub get
flutter run --debug -d emulator-5554 -t lib/main.dart \
  --dart-define=API_BASE_URL=http://10.0.2.2:3000
```

Dùng ID emulator thực tế từ `flutter devices`, không mở thêm cùng AVD nếu đang
chạy. `10.0.2.2` là địa chỉ host đặc biệt của Android Emulator; điện thoại thật
không dùng địa chỉ này. Với file, public storage có thể dùng LAN IP của host nếu
emulator cũng truy cập được, hoặc dùng reverse cả hai cổng như mục 5 để giữ
public endpoint localhost. Không giả định localhost trong máy ảo là host.

## 7. Nếu “điện thoại ngoài” nghĩa là 4G hoặc mạng khác

IP `10.101.172.209` chỉ dùng trong LAN; cài APK không tự đưa backend ra Internet.
Cần một môi trường có Gateway và MinIO truy cập được qua HTTPS, hoặc kết nối VPN
phù hợp vào mạng demo. Dùng Gateway origin đó trong API_BASE_URL; cấu hình
MINIO_PUBLIC_ENDPOINT (hoặc DEMO_STORAGE_PUBLIC_URL) theo storage origin tương ứng
và xin URL ký mới. Chỉ mở Gateway mà storage còn localhost/LAN thì login có thể
chạy nhưng upload/download vẫn hỏng. Không mở PostgreSQL/RabbitMQ cho điện thoại.
Ubuntu hiện tại phục vụ build Android; build/cài iOS cần môi trường macOS/Xcode.

## 8. Tra lỗi nhanh

| Hiện tượng | Kiểm tra |
|---|---|
| Không thấy Android trong `flutter devices` | USB debugging, hộp thoại RSA, cáp dữ liệu, quyền USB |
| Điện thoại không mở được `/health` | Sai IP, đổi mạng, Wi-Fi client isolation, VPN hoặc firewall của host |
| API kết nối được nhưng app báo cấu hình sai | URL chỉ có scheme/host/port; bỏ `/api` và `/gateway` |
| Đăng nhập được nhưng không thấy WO | Đúng Technician/tenant, đã có assignment cho user này; kéo refresh |
| Login được nhưng upload/download lỗi | Public storage URL/ticket còn localhost hoặc 9000 chưa truy cập được |
| App yêu cầu HTTPS | Đang build profile/release; dùng debug cho demo HTTP local |
| Đổi IP nhưng app vẫn gọi IP cũ | Build/run lại với dart-define mới |
| Muốn mở web trên điện thoại | Vite cần listen LAN và cấu hình CORS phù hợp; đây là cấu hình web riêng, không cần để chạy app Flutter native |

Nếu UFW đang bật và chặn LAN, chỉ mở các cổng cần thiết cho subnet demo. Với
mạng Wi-Fi hiện tại là `10.101.172.0/24`:

```bash
sudo ufw status
# Chỉ chạy hai lệnh sau nếu firewall thực sự đang chặn kết nối demo:
sudo ufw allow from 10.101.172.0/24 to any port 3000 proto tcp
sudo ufw allow from 10.101.172.0/24 to any port 9000 proto tcp
```

Không tắt toàn bộ firewall. Đổi subnet theo mạng thực tế; không cần đổi CORS
Gateway chỉ để chạy HTTP client native của Flutter.

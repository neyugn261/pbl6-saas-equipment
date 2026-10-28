# Mobile — đọc dữ liệu backend sau đăng nhập

Nhánh `feature/khuong-mobile-session`, 28/10/2026. UI được chốt và push ở
`05a9909`; nhánh đã nhận `develop` đến `e16a7b8` trước đợt tích hợp này.
Thiết kế: [mobile-technician-design](../planning/mobile-technician-design.md).

## Phạm vi đã nối

`lib/main.dart` đăng nhập Identity thật và mở workspace trong
`apps/mobile/lib/features/workspace/`. `main_preview.dart` vẫn dành riêng cho
UI fixtures, không tạo session/network. App đăng nhập không dùng
fixtures để bù cho dữ liệu thiếu, lỗi hoặc ngoài quyền.

| Màn hình | Dữ liệu đọc thật qua Gateway |
| --- | --- |
| Trang chủ | `/api/workorders/technicians/me`, toàn bộ các trang WO đúng scope cá nhân; tổng việc, trạng thái, completedAt hôm nay, việc cần chú ý, lịch sắp tới |
| Công việc | Hiện tại và từng được phân công; tìm mã/tiêu đề, trạng thái, loại, ưu tiên, ngày bắt đầu dự kiến; phân trang hiển thị 20 mục |
| Chi tiết WO | GET WO theo UUID; thiết bị/customer/site/location/contact qua Asset dossier; assignment hiện tại, status history, assignment history, work logs |
| Báo cáo | GET `work-orders/:id/service-report`; RESOLVED/PARTIALLY_RESOLVED/UNRESOLVED, nội dung chẩn đoán/giải pháp và customerSummary tách riêng; report chưa nộp khác lỗi quyền |
| Yêu cầu nguồn | Asset composition `equipment/:id/service-requests/:requestId`: request, snapshot xét bảo hành, history/comments/estimates đúng quyền caller |
| Lịch | Ngày/tuần/tháng, agenda cá nhân, lịch sử tùy chọn, nhóm chưa xếp lịch; lọc theo scheduledStart, giờ Việt Nam UTC+7 |
| Thiết bị | Asset list phân trang server; q assetCode/serial/model name; warranty/status/operationalStatus, chọn customer/site từ Organization API |
| Hồ sơ thiết bị | Dossier/model/thông số/ngày bàn giao/vận hành/customer/site/contact/warranties; timeline phân trang; WO/SR liên quan phân trang và mở hồ sơ nguồn |
| QR | Nhập token/dán URL QR → GET `/api/assets/qr/:token` có bearer → mở dossier theo UUID; không truy cập URL bên ngoài được dán |
| Cá nhân | Identity `/auth/me`, Technician employeeCode/status/skills (level 1–5), branch từ Organization; kiểm tra phiên và logout P0 |

Home không dùng `items.length` của trang đầu làm tổng. Tỷ lệ hoàn thành là
COMPLETED / toàn bộ công việc từng được phân công; các KPI hiện tại chỉ lấy
assignment đang thuộc user. Hoàn thành hôm nay dùng **completedAt**, không dùng
scheduledStart; nhấn KPI chuyển sang lịch sử cùng bộ lọc ngày hoàn thành.
Lịch và bộ lọc khoảng ngày dùng ngày bắt đầu dự kiến, không giả API hỗ trợ
mọi khoảng thời gian giao nhau hay lịch hẹn đã được khách xác nhận.

## Scope cá nhân và session

`mine=true` chỉ lấy assignment ASSIGNED/ACCEPTED hiện tại, không đủ cho lịch
sử đã kết thúc hoặc từ chối/gỡ phân công. Bản tích hợp dùng contract hiện có:

- Tài khoản chỉ có TECHNICIAN: backend WO list đã scope theo **ever assigned**.
- TECHNICIAN kèm role staff khác: backend có scope staff rộng hơn. Mobile đọc
  assignment của từng ứng viên và chỉ đưa WO từng có technicianUserId của
  caller vào tập cá nhân; tối đa 4 lookup đồng thời. Không đưa danh sách staff
  vào UI dưới nhãn Công việc của tôi.
- Hiện tại: nonterminal, currentAssignment đúng user và ASSIGNED/ACCEPTED.
  Lịch sử: từng được phân công nhưng không còn phân công hiện tại; có thể có
  WO đã bị gỡ/chuyển người khác dù WO chưa terminal.
- Đọc hết trang trước khi hiện tổng/history; page lỗi, trùng ID, total/pageSize
  đổi hoặc số bản ghi không khớp làm lượt tải thất bại và có nút thử lại. Không
  công bố tổng thiếu. Đây vẫn là nhiều lượt đọc độc lập, không phải snapshot
  transaction xuyên các API; kéo tải lại khi backend thay đổi.
- Tập dữ liệu chỉ tồn tại trong workspace của session; logout/đổi user/tenant
  hoặc gate session phá navigation và state cũ. Các GET dùng
  `SessionController.authorizedRequest`, giữ single-flight refresh/401 retry
  P0, kiểm tra epoch và bỏ response trễ. Đổi tập role cũng tạo workspace mới.

Tradeoff: account có nhiều role và nhiều WO có thể tải lâu do phải đọc hết
trang và xác minh assignment. Nên bổ sung filter backend
**ever-assigned-to-caller** theo PR contract riêng khi cần tối ưu; đợt này
không sửa API, RBAC, schema hoặc migration của service nào.

## Trạng thái dữ liệu và TODO

Có loading, empty, lỗi an toàn, thử lại, kéo refresh và đọc lại khi foreground.
Response cũ không thay response mới khi đổi filter. Thiếu Technician profile
được giải thích rõ; vẫn truy cập Thiết bị được nếu có quyền. Dossier giữ
AVAILABLE/RESTRICTED/UNAVAILABLE/NOT_CONFIGURED/NOT_FOUND; phần nguồn lỗi không
bị biến thành danh sách rỗng. UNKNOWN là Chưa xác nhận; hoàn thành WO không
được suy ra equipment OPERATIONAL. Bảo hành theo ngày khác snapshot xét SR.
Tên actor chưa resolve được hiển thị bằng ID, không gọi Identity internal.

Các nút ghi nghiệp vụ vẫn ghi rõ **Chưa kết nối**: accept/reject, travel/start,
hold/resume, POST log, complete/report. Không có business POST/PATCH/DELETE từ
workspace. Camera, file/upload, Notification, phụ tùng và nháp M3 chờ API/plugin;
app đăng nhập hiện ghi chú chờ triển khai, không hiện inbox/file/stock mẫu như
là dữ liệu thật. Vì vậy đây là nghiệm thu **đọc backend**, chưa phải hoàn tất
workflow mobile M2.

## Chạy với backend local của nhóm

Dùng các DB đã được owner migrate đúng phiên bản backend. Đợt mobile không
thêm hoặc tự áp migration dev. Chuẩn bị Identity/Organization/Asset/WO theo
[root README](../../README.md) và [demo Work Order M2](../demo/workorder-m2.md).
Cần Gateway + Identity + Organization + Asset + Service Request + Work Order;
RabbitMQ cho đồng bộ lịch sử. K7 seed tạo Technician liên kết đúng tài khoản
Identity; chỉ seed Identity sẽ chưa có `technicians/me`.

1. Chạy các service và seed theo hướng dẫn trên. Tài khoản demo là tenant
   `DEMO`, `technician@demo.local`, mật khẩu từ `SEED_DEMO_PASSWORD` của backend.
2. Tạo/assign WO bằng web hoặc Swagger với manager/dispatcher. Dùng thêm WO đã
   hoàn thành để kiểm tra lịch sử/report. WO chỉ CREATED chưa phân công không
   xuất hiện trong Công việc của Technician.
3. Từ `apps/mobile`, emulator Android:

```bash
flutter run -d emulator-5554 -t lib/main.dart
# Debug mặc định Gateway http://10.0.2.2:3000; port khác:
flutter run -d emulator-5554 --dart-define=API_BASE_URL=http://10.0.2.2:<gateway-port>
```

Đăng nhập, xem Home → Công việc → Chi tiết → Hoạt động/Báo cáo → thiết bị →
Bảo hành/Lịch sử/Liên quan → Lịch → Cá nhân. Mọi cập nhật nghiệp vụ để thực hiện
ở web/Swagger trong đợt này, rồi kéo tải lại mobile để thấy kết quả. QR manual
lookup dùng token/URL được manager cấp qua Asset API, không dùng assetCode làm
token QR. Điện thoại thật dùng Gateway LAN; xem [mobile README](../../apps/mobile/README.md).

## Bằng chứng kiểm tra

- `flutter analyze`: PASS, no issues.
- `flutter test`: **75 PASS**, 1 opt-in backend smoke skipped trong lệnh thường.
  Bao gồm 53 regression session/UI preview và 22 test mới cho repository,
  Gateway-shaped DTO rendering, scope đa role, phân trang, timezone, lỗi/retry,
  profile thiếu, late response/logout, section trạng thái, report enum/403/404
  và màn hình hẹp với font lớn.
- `test/backend_reads_smoke_test.dart` chạy riêng với backend thật: **1 PASS**.
  Đăng nhập qua SessionController/Gateway, kiểm tra 2 WO hiện tại (có lịch và
  chưa lịch), history completed/report, loại WO chưa từng được phân công,
  equipment/filter/dossier/warranty/timeline/linked source/profile/QR/logout.
- Stack kiểm thử riêng: Gateway + Identity + Organization + Asset + SR + WO,
  PostgreSQL và RabbitMQ riêng; migrations/seed và kịch bản K7 demo qua broker
  thật PASS. Không chạy kịch bản ghi thử trên DB dev của nhóm.
- Build debug entry point thật với Gateway kiểm thử: PASS. APK mặc định Gateway
  local và preview được kiểm tra riêng khi bàn giao.
- Android Pixel 6 API 36: smoke login/current/history/activity/report/calendar/
  dossier/model/warranty/timeline/profile/logout **ALL PASS**. Screenshot local được ghi
  ở `/tmp/pbl6-mobile-read-android.log`, `/tmp/pbl6-mobile-real-*.png`.
- Log analyze/unit/backend/build local: `/tmp/pbl6-mobile-read-analyze.log`,
  `/tmp/pbl6-mobile-read-tests.log`, `/tmp/pbl6-mobile-real-backend-tests.log`,
  `/tmp/pbl6-mobile-read-build-smoke.log`.

Opt-in smoke yêu cầu một stack **kiểm thử riêng** với dữ liệu tương ứng các
assertions (2 current, ít nhất 1 completed, một WO ngoài scope và QR đã cấp).
Truyền các biến môi trường `PBL6_MOBILE_SMOKE_GATEWAY`,
`PBL6_MOBILE_SMOKE_PASSWORD`, `PBL6_MOBILE_SMOKE_HIDDEN_ORDER`,
`PBL6_MOBILE_SMOKE_EQUIPMENT`, `PBL6_MOBILE_SMOKE_QR`, rồi chạy:

```bash
flutter test test/backend_reads_smoke_test.dart
```

Không đưa password/token vào source, ảnh, body PR hoặc log công khai. Bộ test
này chỉ đọc nghiệp vụ; dữ liệu test được chuẩn bị trước bằng seed/API của từng
service. Không cần truy vấn database service khác từ mobile.

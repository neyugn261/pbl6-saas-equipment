# Mobile UI preview — theme task management

Nhánh: `feature/khuong-mobile-session`. Ngày: 28/10/2026.
Thiết kế chức năng: [mobile-technician-design](../planning/mobile-technician-design.md).
Mục tiêu đợt này chỉ là giao diện Flutter theo ảnh tham chiếu của người dùng.
Không có API/backend/migration/permission mới. Chưa coi UI là nghiệm thu M2/M3.

## Theme và bố cục

- Nền trắng, card xám rất nhạt, bo tròn 20–30, typography đậm rõ và ít shadow.
- Teal `#619FA3`, peach `#F6B77E`, berry `#AD5678`, violet `#5547B5`, ink `#171A1B`.
- Pill filter chọn nền đen; CTA tím; badge trạng thái có text/icon và màu.
- Gauge nửa vòng tự vẽ từ fixtures; date rail và agenda có card màu như ảnh.
- Bottom navigation đủ Trang chủ / Công việc / Lịch / Thiết bị / Cá nhân.
  Giữ state/scroll khi đổi root tab; detail/form không có bottom navigation.
- Ảnh thiết bị dùng icon/đồ họa minh họa local, không tải ảnh từ bên ngoài.
  Không đưa quảng cáo Premium/project-management ngoài nghiệp vụ PBL6 vào app.

## Cách mở

```bash
source "$HOME/.config/android/env.sh" # máy đã được chuẩn bị Android SDK
cd apps/mobile
flutter run -d emulator-5554 -t lib/main_preview.dart
```

Nếu chưa bật AVD, xem [README mobile](../../apps/mobile/README.md). Preview mở
thẳng workspace, không login và không cần backend. Cài APK preview đã build:

```bash
adb -s emulator-5554 install -r build/app/outputs/flutter-apk/app-preview-debug.apk
```

`app-preview-debug.apk` và `app-session-debug.apk` là bản sao local đã tạo khi
kiểm tra hai entry point; lệnh Flutter build bình thường xuất `app-debug.apk`.
Tất cả APK/build output đều gitignored. Cùng application ID nên hai bản cài
thay nhau trên emulator; dùng đúng entry point khi chạy lại.

## Màn hình đã dựng

| Khu vực | Giao diện |
| --- | --- |
| Trang chủ | Avatar/lời chào, gauge, công việc cần chú ý, 4 chỉ số, tiếp tục công việc, shortcut tra cứu/QR |
| Công việc | Hiện tại/lịch sử, search, chip trạng thái, sheet priority/type/date, list card và empty state |
| WO detail | Header/type/status/priority, thiết bị, thông tin/site/contact, hoạt động, assignment history, report, file, parts |
| Action theo state | Nhận/từ chối, di chuyển/start, pause reason/resume, note, report; terminal chỉ đọc |
| Service Report | 3 bước chẩn đoán/xử lý/kết quả, validation, nội dung nội bộ/customerSummary, xác nhận rời form và preview |
| Report đọc | Result, chẩn đoán/giải pháp, summary dành khách, link giao diện tài liệu; không có edit report |
| Lịch | Ngày/tuần/tháng, date rail/month grid, agenda màu, chưa xếp lịch và ngày rỗng |
| Thiết bị | Search/filter warranty, card, dossier overview/spec/warranty/history, related WO và section Maintenance restricted |
| QR | Khung camera minh họa, mở thiết bị mẫu, manual lookup sheet |
| Cá nhân | Profile/skills/branch/status chỉ đọc, phiên, appearance, hướng dẫn, phiên bản, nháp M3 |
| Notification M3 | Inbox/read filter, trạng thái unread, điều hướng WO; mark-read còn stub |
| Attachment M3 | List/gallery, viewer/PDF placeholder, upload chooser/progress/pending/error/retry và visibility nội bộ |
| Parts M3 | Issued/returned/net quantities chỉ đọc; không Request Part hoặc issue/return bằng Technician |

Fixtures ở `apps/mobile/lib/ui/preview_data.dart`, gồm 8 WO và 4 thiết bị. Đây
là display codes minh họa, không phải UUID tài nguyên của backend. Timeline,
report/file/contact/stock và mọi con số trên giao diện là dữ liệu mẫu. Chưa có
work order được chuyển trạng thái, report gửi, file lưu/upload hoặc QR được đọc.

## Ranh giới thực thi

- `main_preview.dart` chỉ dựng MaterialApp/workspace; không import auth/network.
- `main.dart` giữ login/restore/refresh/logout P0. Shell sau login vẫn có dữ
  liệu minh họa. Session workspace dùng Navigator riêng; logout/xác thực lại
  loại bỏ các route detail cũ.
- Search/filter/calendar/stepper là UI state local để đánh giá layout. Date
  range picker, preference persistence và phục hồi nháp có stub/TODO.
- Mutation CTA mở notice Bản xem trước; không giả thông báo server thành công,
  không mutate fixtures. Report preview có nhãn Chưa gửi dữ liệu.
- Nút theo fixture state để duyệt thiết kế; authorization thật sau này phải
  lấy allowedActions/assignment từ server. Upload WO không mở ở ASSIGNED hoặc
  CANCELLED; file report ở COMPLETED theo contract khi actor hợp lệ.
- Role/status Technician chỉ đọc. Không thêm checklist, reschedule/assign,
  sửa equipment, publish CUSTOMER hoặc quyền Maintenance cho Technician.
- Các module `lib/ui/` không gọi HTTP, secure storage, camera hoặc filesystem.

## Các TODO cho lần nối nghiệp vụ

| File | Nối tiếp |
| --- | --- |
| `preview_data.dart` | DTO adapter với resource UUID riêng, fixture-free repositories; field status/refs đúng API |
| `home_screen.dart` | Scoped exact totals, profile, attention preview; không đếm một page làm tổng |
| `jobs_screen.dart` | Pagination, server filtering/date, ever-assigned history cho account đa role |
| `job_detail_screen.dart` | Detail/history/logs/assignments; allowedActions, note, state conflict và revalidation |
| `report_screen.dart` | Complete một lần, đọc lại kết quả khi timeout, giữ riêng nội dung nội bộ/khách |
| `schedule_screen.dart` | Query ngày theo Asia/Ho_Chi_Minh, unscheduled; thống nhất overlap nếu cần |
| `equipment_screens.dart` | Scoped Asset/dossier/section status, public contacts, QR/camera permission |
| `notification_screen.dart` | Confirm routes/recipient policy; inbox/count/mark one read và reauthorize deep links |
| `attachment_screens.dart` | K8 prepare → PUT → finalize; không gửi bearer tới storage; Inventory read-only |
| `profile_screen.dart` | Technician/branch/skill APIs, local preferences/drafts; giữ nguyên RBAC |

Các TODO hiện rõ ngay trong code của từng khu vực. Không đưa DTO/service kit
TypeScript vào Flutter hoặc đọc DB từ điện thoại để hoàn thiện các mục này.

## Kiểm tra

- `flutter analyze`: PASS, no issues.
- `flutter test`: 53 PASS, gồm regression session và UI navigation/report/
  non-persistence/route cleanup/narrow phone/large text.
- Build debug cả `lib/main.dart` và `lib/main_preview.dart`: PASS.
- Preview APK cài/chạy trên Pixel 6 API 36. Kiểm tra trực tiếp các root tab và
  các route detail/report/dossier, lịch chưa xếp lịch, cá nhân và Notification;
  UI-only emulator smoke PASS, chưa phải business E2E.
- Log local: `/tmp/pbl6-mobile-ui-{analyze,tests,session-build,preview-build}.log`.
  Smoke: `/tmp/pbl6-mobile-ui-smoke.log`; screenshot
  `/tmp/pbl6-mobile-ui-{home,jobs,schedule,job-detail,report-form,report-read,equipment,dossier,profile,notifications}.png`.

Chưa thêm CI Flutter, chưa tích hợp backend mới, chưa commit/push đợt UI này.

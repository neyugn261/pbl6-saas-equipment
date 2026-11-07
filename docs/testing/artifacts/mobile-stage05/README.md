# Bằng chứng Android giai đoạn 5

Android API 36 emulator `emulator-5556`, Identity/Gateway và tám backend thật
trên các DB test, RabbitMQ exchange riêng. Baseline nhánh `66592bf`; fixture
lịch được tạo bằng public API trong working tree giai đoạn 5.

[results.json](results.json) ghi hash APK UAT thực sự đã cài, version/build
được đối chiếu PackageManager, ngày nghiệp vụ, các case và tên ảnh. APK này
trỏ Gateway test; APK build lại với Gateway mặc định sau UAT có hash khác.
Không đưa manifest chứa credential hoặc token vào artifact.

| Ảnh | Nội dung |
| --- | --- |
| [history-filter-refresh.png](history-filter-refresh.png) | Lịch sử và mã tìm kiếm còn sau tải lại; WO completed được mở và quay lại đúng lọc |
| [dark-appearance.png](dark-appearance.png) | Lựa chọn Tối áp dụng trong route tùy chọn |
| [installed-version.png](installed-version.png) | Version/build của APK đã cài, không phải placeholder |
| [help.png](help.png) | Hướng dẫn workflow và dữ liệu nháp |
| [restart-dark-home.png](restart-dark-home.png) | Force-stop/restart giữ giao diện tối |
| [month-day-history.png](month-day-history.png) | Lưới tháng, chọn ngày và bật lịch sử làm agenda từ 1 thành 2 việc |
| [week-agenda.png](week-agenda.png) | Lịch tuần và agenda theo ngày bắt đầu |
| [day-agenda.png](day-agenda.png) | Agenda ngày được chọn |
| [system-dark.png](system-dark.png) | Theo hệ thống khi Android bật night mode |
| [system-light.png](system-light.png) | Theo hệ thống khi Android tắt night mode |
| [logout-drafts-policy.png](logout-drafts-policy.png) | Xác nhận đăng xuất, chính sách giữ nháp và nút Ở lại |
| [dark-login-after-logout.png](dark-login-after-logout.png) | Sau xác nhận logout trở về login, vẫn giữ giao diện thiết bị |

Nghiệm thu chỉ trên emulator Android. Thử lựa chọn Theo hệ thống dùng night
mode của emulator riêng, không thay cài đặt máy thật. Các test không đếm màu
trong khung hình chuyển động; chờ giao diện đổi xong rồi mới chụp/kiểm tra.
Hướng dẫn tái hiện và giới hạn: [mobile-stage-5.md](../../mobile-stage-5.md).
